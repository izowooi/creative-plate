from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from typing import Any

from .analyzer import Analyzer
from .db import JobStore
from .downloader import Downloader
from .events import EventBroker
from .models import BrowserInterruptedError


class JobScheduler:
    """Persistent scheduler; in-memory tasks are only abort handles, never history."""

    def __init__(
        self,
        store: JobStore,
        analyzer: Analyzer,
        downloader: Downloader,
        events: EventBroker,
        *,
        analyze_concurrency: int = 2,
        progress_update_interval: float = 0.25,
        shutdown_timeout: float = 10.0,
    ) -> None:
        self.store = store
        self.analyzer = analyzer
        self.downloader = downloader
        self.events = events
        self.analyze_concurrency = analyze_concurrency
        self.progress_update_interval = progress_update_interval
        self.shutdown_timeout = shutdown_timeout
        self.download_concurrency = int(store.get_settings()["concurrency"])
        self._analysis_tasks: dict[str, asyncio.Task[None]] = {}
        self._download_tasks: dict[str, asyncio.Task[None]] = {}
        self._loop_task: asyncio.Task[None] | None = None
        self._wake = asyncio.Event()
        self._running = False
        self.accepting = False

    async def start(self) -> None:
        if self._running:
            return
        recovered = self.store.recover_interrupted()
        self._running = True
        self.accepting = True
        self._loop_task = asyncio.create_task(self._run_loop(), name="job-scheduler")
        self.events.publish("recovered", count=recovered)
        self.notify()

    def notify(self) -> None:
        self._wake.set()

    def set_concurrency(self, value: int) -> None:
        self.download_concurrency = value
        self.notify()

    def cancel_running(self, job_id: str) -> bool:
        task = self._analysis_tasks.get(job_id) or self._download_tasks.get(job_id)
        if task and not task.done():
            task.cancel()
            return True
        return False

    def cancel_many(self, job_ids: list[str]) -> None:
        for job_id in job_ids:
            self.cancel_running(job_id)

    async def _run_loop(self) -> None:
        try:
            while self._running:
                download_capacity = self.download_concurrency - len(self._download_tasks)
                for job in self.store.claim_for_download(download_capacity):
                    self._spawn(self._download_tasks, job["id"], self._run_download(job))

                analysis_capacity = self.analyze_concurrency - len(self._analysis_tasks)
                prefetched = (
                    len(self._download_tasks)
                    + len(self._analysis_tasks)
                    + self.store.count_ready_for_download()
                )
                analysis_capacity = min(
                    analysis_capacity,
                    max(
                        0,
                        self.download_concurrency + self.analyze_concurrency - prefetched,
                    ),
                )
                for job in self.store.claim_for_analysis(analysis_capacity):
                    self._spawn(self._analysis_tasks, job["id"], self._run_analysis(job))

                self._wake.clear()
                with suppress(TimeoutError):
                    await asyncio.wait_for(self._wake.wait(), timeout=0.5)
        except asyncio.CancelledError:
            pass

    def _spawn(
        self,
        registry: dict[str, asyncio.Task[None]],
        job_id: str,
        coroutine: Any,
    ) -> None:
        task = asyncio.create_task(coroutine, name=f"job-{job_id}")
        registry[job_id] = task

        def finished(done: asyncio.Task[None]) -> None:
            registry.pop(job_id, None)
            if not done.cancelled():
                done.exception()
            self.notify()

        task.add_done_callback(finished)

    async def _run_analysis(self, job: dict[str, Any]) -> None:
        job_id = job["id"]
        self.events.publish("job", jobId=job_id, status="analyzing")
        try:
            result = await self.analyzer.analyze(
                job["url"], job["preferred_quality"], job["output_dir"]
            )
            if self.store.save_analysis(job_id, **result):
                self.events.publish("job", jobId=job_id, status="queued")
        except asyncio.CancelledError:
            raise
        except BrowserInterruptedError as exc:
            # A terminal Ctrl+C reaches Chrome before Uvicorn enters lifespan shutdown.
            # Give shutdown a chance to cancel this task; otherwise retry a crashed browser
            # a bounded number of times instead of stranding the job as a false failure.
            await asyncio.sleep(0.25)
            if int(job.get("attempts", 0)) >= 3:
                if self.store.fail_job(job_id, "analyzing", str(exc)):
                    self.events.publish("job", jobId=job_id, status="failed")
            elif self.store.requeue_interrupted(job_id, "analyzing"):
                self.events.publish("job", jobId=job_id, status="queued")
        except Exception as exc:
            if self.store.fail_job(job_id, "analyzing", str(exc)):
                self.events.publish("job", jobId=job_id, status="failed")
        finally:
            self.notify()

    async def _run_download(self, job: dict[str, Any]) -> None:
        job_id = job["id"]
        self.events.publish("job", jobId=job_id, status="downloading")
        last_write = 0.0

        async def progress(
            completed: int,
            total: int,
            bytes_written: int,
            force: bool,
        ) -> None:
            nonlocal last_write
            now = time.monotonic()
            if not force and now - last_write < self.progress_update_interval:
                return
            if self.store.update_progress(
                job_id,
                completed_segments=completed,
                total_segments=total,
                bytes_written=bytes_written,
            ):
                last_write = now
                self.events.publish("progress", jobId=job_id)

        try:
            result = await self.downloader.download(job, progress)
            if self.store.complete_job(
                job_id,
                output_path=result.output_path,
                completed_segments=result.completed_segments,
                total_segments=result.total_segments,
                bytes_written=result.bytes_written,
                skipped=result.skipped,
            ):
                self.events.publish("job", jobId=job_id, status="completed")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            if self.store.fail_job(job_id, "downloading", str(exc)):
                self.events.publish("job", jobId=job_id, status="failed")

    async def shutdown(self) -> None:
        if not self._running:
            return
        self.accepting = False
        self._running = False
        running_ids = self.store.reset_running_for_shutdown()
        self.events.publish("shutdown", count=len(running_ids))
        if self._loop_task:
            self._loop_task.cancel()
        tasks = [*self._analysis_tasks.values(), *self._download_tasks.values()]
        for task in tasks:
            task.cancel()
        close_task = asyncio.create_task(self.analyzer.close(), name="browser-close")
        waiters = [task for task in [self._loop_task, *tasks, close_task] if task is not None]
        try:
            async with asyncio.timeout(self.shutdown_timeout):
                if waiters:
                    await asyncio.gather(*waiters, return_exceptions=True)
        except TimeoutError:
            for task in waiters:
                task.cancel()
            await asyncio.wait(waiters, timeout=0.1)
        finally:
            self._analysis_tasks.clear()
            self._download_tasks.clear()
            self._loop_task = None
