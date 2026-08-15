from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, field_validator
from starlette.middleware.trustedhost import TrustedHostMiddleware

from remind_prompt.config import Settings
from remind_prompt.database import Database
from remind_prompt.errors import InvalidTransition, ReminderNotFound, VersionConflict
from remind_prompt.slack import SlackNotifier
from remind_prompt.time_utils import (
    ScheduleError,
    from_db,
    get_zone,
    resolve_local,
    resolve_relative,
    to_db,
    utc_now,
)
from remind_prompt.worker import NotificationWorker


class ExactSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["exact"]
    timezone: str
    local_datetime: str = Field(min_length=10, max_length=32)
    fold: Literal[0, 1] | None = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        get_zone(value)
        return value

    @field_validator("local_datetime")
    @classmethod
    def validate_local_datetime(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("local_datetime must be ISO-8601 local time") from exc
        if parsed.tzinfo is not None:
            raise ValueError("local_datetime must not include a UTC offset")
        return value


class RelativeSchedule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["relative"]
    timezone: str
    amount: int = Field(ge=1, le=10_000)
    unit: Literal["hour", "day", "week", "month"]
    anchor_at: datetime | None = None
    fold: Literal[0, 1] | None = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        get_zone(value)
        return value

    @field_validator("anchor_at")
    @classmethod
    def validate_anchor(cls, value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("anchor_at must include a UTC offset")
        return value


ScheduleInput = Annotated[ExactSchedule | RelativeSchedule, Field(discriminator="type")]


class ReminderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    prompt_text: str = Field(min_length=1, max_length=30_000)
    destination_label: str = Field(min_length=1, max_length=500)
    destination_url: str | None = Field(default=None, max_length=2_048)
    project: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5_000)
    source_label: str | None = Field(default=None, max_length=500)
    source_ref: str | None = Field(default=None, max_length=2_048)
    schedule: ScheduleInput

    @field_validator("title", "prompt_text", "destination_label")
    @classmethod
    def required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("field cannot be blank")
        return value

    @field_validator("project", "notes", "source_label", "source_ref")
    @classmethod
    def optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("destination_url")
    @classmethod
    def validate_destination_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("destination_url must be an http(s) URL")
        return value


class ReminderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    prompt_text: str | None = Field(default=None, min_length=1, max_length=30_000)
    destination_label: str | None = Field(default=None, min_length=1, max_length=500)
    destination_url: str | None = Field(default=None, max_length=2_048)
    project: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5_000)
    source_label: str | None = Field(default=None, max_length=500)
    source_ref: str | None = Field(default=None, max_length=2_048)
    schedule: ScheduleInput | None = None

    @field_validator("title", "prompt_text", "destination_label")
    @classmethod
    def validate_optional_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("field cannot be blank")
        return value

    @field_validator("project", "notes", "source_label", "source_ref")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None

    @field_validator("destination_url")
    @classmethod
    def validate_optional_destination_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("destination_url must be an http(s) URL")
        return value


class VersionAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)


class ScheduleAction(VersionAction):
    schedule: ScheduleInput


class ReopenAction(VersionAction):
    schedule: ScheduleInput | None = None


class ImportDocumentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=500)
    content: str
    last_modified: datetime | None = None


class ImportPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    documents: list[ImportDocumentRequest] = Field(min_length=1, max_length=200)
    timezone: str

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        get_zone(value)
        return value


def _resolve_schedule(schedule: ScheduleInput, *, now: datetime) -> dict[str, Any]:
    if isinstance(schedule, ExactSchedule):
        local_due = datetime.fromisoformat(schedule.local_datetime)
        due_at = resolve_local(local_due, schedule.timezone, fold=schedule.fold)
        expression = f"exact:{local_due.isoformat(timespec='minutes')}"
        anchor_at = None
    else:
        anchor = schedule.anchor_at or now
        due_at, local_due = resolve_relative(
            anchor,
            schedule.timezone,
            schedule.amount,
            schedule.unit,
            fold=schedule.fold,
        )
        expression = f"{schedule.amount} {schedule.unit}"
        anchor_at = to_db(anchor)
    return {
        "due_at": to_db(due_at),
        "due_local": local_due.isoformat(timespec="seconds"),
        "timezone": schedule.timezone,
        "schedule_expression": expression,
        "anchor_at": anchor_at,
        "is_past": due_at <= now,
    }


def _serialize_reminder(reminder: dict[str, Any], *, now: datetime) -> dict[str, Any]:
    result = dict(reminder)
    result.pop("claim_token", None)
    result.pop("claimed_until", None)
    due_at = from_db(reminder["due_at"])
    result["is_overdue"] = bool(
        reminder["status"] == "open" and due_at is not None and due_at <= now
    )
    return result


def create_app(
    settings: Settings | None = None,
    *,
    start_worker: bool = True,
    clock=utc_now,
    notifier: SlackNotifier | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings.database_path)
    notifier = notifier or SlackNotifier(
        settings.slack_webhook_url,
        base_url=settings.base_url,
        prompt_max_chars=settings.slack_prompt_max_chars,
    )
    worker = NotificationWorker(settings, database, notifier, clock=clock)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.initialize()
        app.state.database = database
        app.state.worker = worker
        stop_event: asyncio.Event | None = None
        worker_task: asyncio.Task | None = None
        if start_worker:
            stop_event = asyncio.Event()
            worker_task = asyncio.create_task(worker.run(stop_event), name="remind-prompt-worker")
        try:
            yield
        finally:
            if stop_event is not None:
                stop_event.set()
            if worker_task is not None:
                try:
                    await asyncio.wait_for(worker_task, timeout=5)
                except TimeoutError:
                    worker_task.cancel()
                    await asyncio.gather(worker_task, return_exceptions=True)

    app = FastAPI(
        title="Remind Prompt",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    trusted_hosts = {"127.0.0.1", "localhost"}
    base_hostname = urlparse(settings.base_url).hostname
    if base_hostname:
        trusted_hosts.add(base_hostname)
    if settings.host not in {"0.0.0.0", "::"}:
        trusted_hosts.add(settings.host)
    # The installed Starlette version reduces bracketed IPv6 Host headers to
    # "[" internally. IPv6 literals cannot be DNS-rebound, so permit that token
    # only when an IPv6 address was explicitly configured.
    if any(":" in host for host in trusted_hosts):
        trusted_hosts.add("[")
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=sorted(trusted_hosts),
        www_redirect=False,
    )
    app.state.settings = settings
    app.state.database = database
    app.state.worker = worker

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if request.url.path == "/" or request.url.path.startswith("/assets/"):
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; connect-src 'self'; img-src 'self' data:; "
                "style-src 'self'; script-src 'self'; base-uri 'none'; "
                "frame-ancestors 'none'; form-action 'self'"
            )
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ReminderNotFound)
    async def reminder_not_found(_: Request, exc: ReminderNotFound) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": f"Reminder not found: {exc}"})

    @app.exception_handler(VersionConflict)
    async def version_conflict(_: Request, exc: VersionConflict) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={
                "detail": str(exc),
                "code": "version_conflict",
                "current_version": exc.current_version,
            },
        )

    @app.exception_handler(InvalidTransition)
    async def invalid_transition(_: Request, exc: InvalidTransition) -> JSONResponse:
        return JSONResponse(
            status_code=409,
            content={"detail": str(exc), "code": "invalid_transition"},
        )

    @app.exception_handler(ScheduleError)
    async def invalid_schedule(_: Request, exc: ScheduleError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={"detail": str(exc), "code": "invalid_schedule"},
        )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        state = database.worker_state()
        return {
            "ok": database.check(),
            "database": "ok",
            "slack_configured": settings.slack_configured,
            "worker_state": state,
        }

    @app.get("/api/config")
    async def config() -> dict[str, Any]:
        now = clock()
        return {
            "timezone": settings.timezone,
            "slack_configured": settings.slack_configured,
            "server_now": to_db(now),
            "worker_state": database.worker_state(),
            "counts": database.counts(now=now),
            "failed_delivery_count": database.failed_delivery_count(),
            "poll_interval_seconds": settings.poll_interval_seconds,
            "follow_up_hours": settings.follow_up_hours,
        }

    @app.post("/api/schedule/preview")
    async def preview_schedule(schedule: ScheduleInput) -> dict[str, Any]:
        return _resolve_schedule(schedule, now=clock())

    @app.get("/api/reminders")
    async def list_reminders(
        view: Literal[
            "active", "overdue", "upcoming", "acknowledged", "completed", "cancelled", "all"
        ] = "active",
        q: str | None = Query(default=None, max_length=200),
    ) -> dict[str, Any]:
        now = clock()
        items = database.list_reminders(view=view, query=q, now=now)
        return {
            "items": [_serialize_reminder(item, now=now) for item in items],
            "counts": database.counts(now=now),
            "server_now": to_db(now),
        }

    @app.post("/api/reminders", status_code=201)
    async def create_reminder(payload: ReminderCreate) -> dict[str, Any]:
        now = clock()
        schedule = _resolve_schedule(payload.schedule, now=now)
        reminder = database.create_reminder(
            title=payload.title,
            prompt_text=payload.prompt_text,
            destination_label=payload.destination_label,
            destination_url=payload.destination_url,
            project=payload.project,
            notes=payload.notes,
            source_label=payload.source_label,
            source_ref=payload.source_ref,
            timezone=schedule["timezone"],
            due_at=datetime.fromisoformat(schedule["due_at"].replace("Z", "+00:00")),
            due_local=schedule["due_local"],
            schedule_expression=schedule["schedule_expression"],
            now=now,
        )
        return _serialize_reminder(reminder, now=now)

    @app.get("/api/reminders/{reminder_id}")
    async def get_reminder(reminder_id: str) -> dict[str, Any]:
        now = clock()
        return _serialize_reminder(database.get_reminder(reminder_id), now=now)

    @app.patch("/api/reminders/{reminder_id}")
    async def patch_reminder(reminder_id: str, payload: ReminderPatch) -> dict[str, Any]:
        now = clock()
        changes: dict[str, Any] = {}
        for field in (
            "title",
            "prompt_text",
            "destination_label",
            "destination_url",
            "project",
            "notes",
            "source_label",
            "source_ref",
        ):
            if field in payload.model_fields_set:
                changes[field] = getattr(payload, field)
        if payload.schedule is not None:
            schedule = _resolve_schedule(payload.schedule, now=now)
            changes.update(
                {
                    "timezone": schedule["timezone"],
                    "due_at": schedule["due_at"],
                    "due_local": schedule["due_local"],
                    "schedule_expression": schedule["schedule_expression"],
                }
            )
        reminder = database.update_reminder(
            reminder_id,
            changes=changes,
            expected_version=payload.expected_version,
            now=now,
        )
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/acknowledge")
    async def acknowledge(reminder_id: str, payload: VersionAction) -> dict[str, Any]:
        now = clock()
        reminder = database.acknowledge(
            reminder_id, expected_version=payload.expected_version, now=now
        )
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/complete")
    async def complete(reminder_id: str, payload: VersionAction) -> dict[str, Any]:
        now = clock()
        reminder = database.complete(
            reminder_id, expected_version=payload.expected_version, now=now
        )
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/cancel")
    async def cancel(reminder_id: str, payload: VersionAction) -> dict[str, Any]:
        now = clock()
        reminder = database.cancel(reminder_id, expected_version=payload.expected_version, now=now)
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/retry")
    async def retry(reminder_id: str, payload: VersionAction) -> dict[str, Any]:
        now = clock()
        reminder = database.retry_notification(
            reminder_id, expected_version=payload.expected_version, now=now
        )
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/snooze")
    async def snooze(reminder_id: str, payload: ScheduleAction) -> dict[str, Any]:
        now = clock()
        schedule = _resolve_schedule(payload.schedule, now=now)
        reminder = database.snooze(
            reminder_id,
            due_at=datetime.fromisoformat(schedule["due_at"].replace("Z", "+00:00")),
            due_local=schedule["due_local"],
            schedule_expression=schedule["schedule_expression"],
            timezone=schedule["timezone"],
            expected_version=payload.expected_version,
            now=now,
        )
        return _serialize_reminder(reminder, now=now)

    @app.post("/api/reminders/{reminder_id}/reopen")
    async def reopen(reminder_id: str, payload: ReopenAction) -> dict[str, Any]:
        now = clock()
        schedule = _resolve_schedule(payload.schedule, now=now) if payload.schedule else None
        reminder = database.reopen(
            reminder_id,
            due_at=(
                datetime.fromisoformat(schedule["due_at"].replace("Z", "+00:00"))
                if schedule
                else None
            ),
            due_local=schedule["due_local"] if schedule else None,
            schedule_expression=schedule["schedule_expression"] if schedule else None,
            timezone=schedule["timezone"] if schedule else None,
            expected_version=payload.expected_version,
            now=now,
        )
        return _serialize_reminder(reminder, now=now)

    @app.get("/api/reminders/{reminder_id}/history")
    async def reminder_history(reminder_id: str) -> dict[str, Any]:
        return {
            "deliveries": database.deliveries_for(reminder_id),
            "events": database.events_for(reminder_id),
        }

    @app.post("/api/import/preview")
    async def import_preview(payload: ImportPreviewRequest) -> dict[str, Any]:
        try:
            from remind_prompt.importer import (
                ImportDocument,
                ImportValidationError,
                extract_candidates,
            )
        except ImportError as exc:  # pragma: no cover - catches broken installations
            raise HTTPException(status_code=503, detail="Markdown importer is unavailable") from exc

        documents = [
            ImportDocument(
                name=document.name,
                content=document.content,
                timestamp=document.last_modified,
            )
            for document in payload.documents
        ]
        try:
            candidates = extract_candidates(
                documents,
                now=clock(),
                timezone=payload.timezone,
            )
        except ImportValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        serialized = [candidate.to_dict() for candidate in candidates]
        warnings = [
            warning for candidate in serialized for warning in candidate.get("warnings", [])
        ]
        return {"candidates": serialized, "warnings": list(dict.fromkeys(warnings))}

    static_directory = Path(__file__).with_name("static")
    if static_directory.exists():
        app.mount(
            "/assets",
            StaticFiles(directory=static_directory),
            name="assets",
        )

        @app.get("/", include_in_schema=False)
        async def index() -> FileResponse:
            return FileResponse(static_directory / "index.html")

    return app


app = create_app()
