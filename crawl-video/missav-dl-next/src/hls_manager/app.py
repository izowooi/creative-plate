from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from .analyzer import HlsAnalyzer
from .browser import SharedBrowser
from .config import AppConfig, load_config
from .db import JobStore
from .downloader import HlsDownloader
from .events import EventBroker
from .hls import expand_range_urls
from .http_client import CurlHttpClientFactory
from .models import (
    ALL_STATUSES,
    DuplicateJobError,
    InvalidTransitionError,
    JobNotFoundError,
)
from .process_lock import ProcessLock
from .queue import JobScheduler
from .security import (
    MutationGuardMiddleware,
    SecurityHeadersMiddleware,
    validate_public_http_url,
)

MAX_JSON_BODY_BYTES = 8 * 1024 * 1024


def _json_error(message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status_code)


async def _body(request: Request) -> dict[str, Any]:
    try:
        content = bytearray()
        async for chunk in request.stream():
            if len(content) + len(chunk) > MAX_JSON_BODY_BYTES:
                raise ValueError("request body is too large")
            content.extend(chunk)
        value = json.loads(content)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("request body must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError("request body must be an object")
    return value


def _absolute_output_dir(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("outputDir must be a non-empty absolute path")
    expanded = Path(value.strip()).expanduser()
    if not expanded.is_absolute():
        raise ValueError("outputDir must be an absolute path")
    resolved = expanded.resolve(strict=False)
    try:
        resolved.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValueError(f"outputDir cannot be created: {exc}") from exc
    if not resolved.is_dir() or not os.access(resolved, os.W_OK | os.X_OK):
        raise ValueError("outputDir must be a writable directory")
    return str(resolved)


def _valid_url(value: Any, config: AppConfig) -> str:
    if not isinstance(value, str):
        raise ValueError("each URL must be a string")
    value = value.strip()
    if not value or len(value) > config.max_url_length:
        raise ValueError(f"each URL must contain 1 to {config.max_url_length} characters")
    validate_public_http_url(value)
    return value


def _output_dir_writable(path: Path) -> bool:
    candidate = path.expanduser()
    while not candidate.exists() and candidate != candidate.parent:
        candidate = candidate.parent
    return candidate.is_dir() and os.access(candidate, os.W_OK | os.X_OK)


def create_app(
    config: AppConfig | None = None,
    *,
    store: JobStore | None = None,
    scheduler: JobScheduler | None = None,
    analyzer: Any = None,
    downloader: Any = None,
    events: EventBroker | None = None,
    use_process_lock: bool = True,
) -> Starlette:
    config = config or load_config()
    injected_store = store
    injected_scheduler = scheduler
    broker = events or EventBroker()

    @asynccontextmanager
    async def lifespan(app: Starlette) -> AsyncIterator[None]:
        process_lock: ProcessLock | None = None
        active_store = injected_store
        active_scheduler = injected_scheduler
        owns_store = active_store is None
        if use_process_lock:
            process_lock = ProcessLock(config.lock_path)
            process_lock.acquire()
        try:
            if active_store is None:
                active_store = JobStore(
                    config.database_path,
                    default_concurrency=config.download_concurrency,
                )
            if active_scheduler is None:
                http_factory = CurlHttpClientFactory(timeout=config.request_timeout_seconds)
                active_analyzer = analyzer or HlsAnalyzer(
                    SharedBrowser(
                        concurrency=config.analyze_concurrency,
                        channel=config.browser_channel,
                        headless=config.browser_headless,
                        idle_seconds=config.browser_idle_seconds,
                    ),
                    http_factory,
                    max_playlist_bytes=config.max_playlist_bytes,
                    url_policy=http_factory.url_policy,
                )
                active_downloader = downloader or HlsDownloader(
                    http_factory,
                    max_playlist_bytes=config.max_playlist_bytes,
                    max_segments=config.max_segments,
                    max_segment_bytes=config.max_segment_bytes,
                    chunk_bytes=config.stream_chunk_bytes,
                )
                active_scheduler = JobScheduler(
                    active_store,
                    active_analyzer,
                    active_downloader,
                    broker,
                    analyze_concurrency=config.analyze_concurrency,
                    progress_update_interval=config.progress_update_interval,
                    shutdown_timeout=config.shutdown_timeout_seconds,
                )
            app.state.store = active_store
            app.state.scheduler = active_scheduler
            app.state.events = broker
            app.state.config = config
            await active_scheduler.start()
            yield
        finally:
            if active_scheduler is not None:
                await active_scheduler.shutdown()
            if owns_store and active_store is not None:
                active_store.close()
            if process_lock:
                process_lock.release()

    async def health(request: Request) -> Response:
        database_ok = False
        try:
            database_ok = bool(request.app.state.store.ping())
        except Exception:
            database_ok = False
        output_ok = _output_dir_writable(config.default_output_dir)
        healthy = database_ok and output_ok
        return JSONResponse(
            {
                "status": "ok" if healthy else "degraded",
                "checks": {
                    "database": database_ok,
                    "outputDirectory": output_ok,
                },
                "acceptingJobs": bool(request.app.state.scheduler.accepting),
            },
            status_code=200 if healthy else 503,
        )

    async def dashboard(request: Request) -> Response:
        params = request.query_params
        status = params.get("status") or None
        if status and status not in ALL_STATUSES:
            return _json_error("unknown status")
        try:
            limit = int(params.get("limit", "50"))
            offset = int(params.get("offset", "0"))
        except ValueError:
            return _json_error("limit and offset must be integers")
        if not 1 <= limit <= 200 or offset < 0:
            return _json_error("limit must be 1..200 and offset must be non-negative")
        summary, jobs, total = request.app.state.store.dashboard(
            status=status,
            search=params.get("search", ""),
            limit=limit,
            offset=offset,
        )
        settings = request.app.state.store.get_settings()
        settings.update(
            {
                "defaultOutputDir": str(config.default_output_dir),
                "recentOutputDirs": request.app.state.store.recent_output_dirs(),
            }
        )
        return JSONResponse(
            {
                "summary": summary,
                "jobs": jobs,
                "settings": settings,
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "total": total,
                    "hasMore": offset + len(jobs) < total,
                },
            }
        )

    async def create_jobs(request: Request) -> Response:
        if not request.app.state.scheduler.accepting:
            return _json_error("server is shutting down", 503)
        try:
            body = await _body(request)
            urls = body.get("urls")
            if not isinstance(urls, list) or not urls:
                raise ValueError("urls must be a non-empty array")
            if len(urls) > config.max_urls_per_request:
                raise ValueError(f"at most {config.max_urls_per_request} URLs are allowed")
            normalized_urls = [_valid_url(url, config) for url in urls]
            output_dir = _absolute_output_dir(body.get("outputDir", str(config.default_output_dir)))
            preferred_value = body.get("preferredQuality", "720p")
            if isinstance(preferred_value, bool) or not isinstance(preferred_value, (str, int)):
                raise ValueError("preferredQuality must be auto or a vertical resolution")
            preferred = str(preferred_value).strip()
            if not re.fullmatch(
                r"(?:auto|best|source|original|\d{2,5}p?)", preferred.strip(), re.IGNORECASE
            ):
                raise ValueError("preferredQuality must be auto or a vertical resolution")
            overwrite = body.get("overwrite", False)
            if not isinstance(overwrite, bool):
                raise ValueError("overwrite must be a boolean")
        except ValueError as exc:
            return _json_error(str(exc))

        created: list[dict[str, Any]] = []
        skipped: list[dict[str, str]] = []
        for url in normalized_urls:
            try:
                created.append(
                    request.app.state.store.create_job(
                        url=url,
                        output_dir=output_dir,
                        preferred_quality=preferred,
                        overwrite=overwrite,
                    )
                )
            except DuplicateJobError as exc:
                skipped.append({"url": url, "existingJobId": exc.existing_job_id})
        if created:
            request.app.state.events.publish("jobs", count=len(created))
            request.app.state.scheduler.notify()
        return JSONResponse({"created": created, "skipped": skipped}, status_code=201)

    async def job_action(request: Request) -> Response:
        job_id = request.path_params["job_id"]
        try:
            body = await _body(request)
            action = body.get("action")
            store = request.app.state.store
            if action == "pause":
                job = store.pause(job_id)
                request.app.state.scheduler.cancel_running(job_id)
            elif action == "resume":
                job = store.resume(job_id)
                request.app.state.scheduler.notify()
            elif action == "cancel":
                job = store.cancel(job_id)
                request.app.state.scheduler.cancel_running(job_id)
            elif action == "retry":
                job = store.retry(job_id)
                request.app.state.scheduler.notify()
            else:
                raise ValueError("action must be pause, resume, cancel, or retry")
        except ValueError as exc:
            return _json_error(str(exc))
        except JobNotFoundError:
            return _json_error("job not found", 404)
        except DuplicateJobError as exc:
            return JSONResponse(
                {"error": str(exc), "existingJobId": exc.existing_job_id}, status_code=409
            )
        except InvalidTransitionError as exc:
            return _json_error(str(exc), 409)
        request.app.state.events.publish("job", jobId=job_id, status=job["status"])
        return JSONResponse({"job": job})

    async def bulk_action(request: Request) -> Response:
        try:
            body = await _body(request)
            action = body.get("action")
            if action == "retry_failed":
                updated = request.app.state.store.retry_failed()
                request.app.state.scheduler.notify()
            elif action == "cancel_all":
                updated, job_ids = request.app.state.store.cancel_all()
                request.app.state.scheduler.cancel_many(job_ids)
            else:
                raise ValueError("action must be retry_failed or cancel_all")
        except ValueError as exc:
            return _json_error(str(exc))
        request.app.state.events.publish("jobs", count=updated)
        return JSONResponse({"updated": updated})

    async def delete_job(request: Request) -> Response:
        job_id = request.path_params["job_id"]
        try:
            request.app.state.store.delete_terminal(job_id)
        except JobNotFoundError:
            return _json_error("job not found", 404)
        except InvalidTransitionError as exc:
            return _json_error(str(exc), 409)
        request.app.state.events.publish("deleted", jobId=job_id)
        return JSONResponse({"deleted": True, "id": job_id})

    async def patch_settings(request: Request) -> Response:
        try:
            body = await _body(request)
            concurrency = body.get("concurrency")
            if isinstance(concurrency, bool) or not isinstance(concurrency, int):
                raise ValueError("concurrency must be an integer")
            settings = request.app.state.store.set_concurrency(concurrency)
        except ValueError as exc:
            return _json_error(str(exc))
        request.app.state.scheduler.set_concurrency(concurrency)
        request.app.state.events.publish("settings")
        settings.update(
            {
                "defaultOutputDir": str(config.default_output_dir),
                "recentOutputDirs": request.app.state.store.recent_output_dirs(),
            }
        )
        return JSONResponse({"settings": settings})

    async def expand_ranges(request: Request) -> Response:
        try:
            body = await _body(request)
            start = _valid_url(body.get("startUrl"), config)
            end = _valid_url(body.get("endUrl"), config)
            urls = expand_range_urls(start, end, maximum=config.max_range_urls)
        except ValueError as exc:
            return _json_error(str(exc))
        return JSONResponse({"urls": urls})

    async def event_stream(request: Request) -> Response:
        async def generate() -> AsyncIterator[bytes]:
            async with request.app.state.events.subscribe() as subscription:
                initial = {"type": "connected"}
                yield f"event: change\ndata: {json.dumps(initial)}\n\n".encode()
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        event = await asyncio.wait_for(subscription.queue.get(), timeout=15)
                        yield f"event: change\ndata: {json.dumps(event)}\n\n".encode()
                    except TimeoutError:
                        yield b": heartbeat\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    routes = [
        Route("/api/health", health, methods=["GET"]),
        Route("/api/dashboard", dashboard, methods=["GET"]),
        Route("/api/jobs", create_jobs, methods=["POST"]),
        Route("/api/jobs/actions", bulk_action, methods=["POST"]),
        Route("/api/jobs/{job_id:str}/action", job_action, methods=["POST"]),
        Route("/api/jobs/{job_id:str}", delete_job, methods=["DELETE"]),
        Route("/api/settings", patch_settings, methods=["PATCH"]),
        Route("/api/events", event_stream, methods=["GET"]),
        Route("/api/ranges/expand", expand_ranges, methods=["POST"]),
    ]
    if config.public_dir.is_dir():
        routes.append(Mount("/", app=StaticFiles(directory=config.public_dir, html=True)))
    return Starlette(
        routes=routes,
        lifespan=lifespan,
        middleware=[
            Middleware(SecurityHeadersMiddleware),
            Middleware(MutationGuardMiddleware),
        ],
    )


app = create_app()
