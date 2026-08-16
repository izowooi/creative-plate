from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from hls_manager.db import JobStore
from hls_manager.events import EventBroker
from hls_manager.models import BrowserInterruptedError, DownloadResult
from hls_manager.queue import JobScheduler


class FakeAnalyzer:
    def __init__(self, tmp_path: Path) -> None:
        self.tmp_path = tmp_path
        self.closed = False

    async def analyze(
        self, page_url: str, preferred_quality: str, output_dir: str
    ) -> dict[str, str]:
        return {
            "slug": "video",
            "selected_quality": "720p",
            "playlist_url": "https://cdn.example/media.m3u8",
            "referer": "https://example.com",
            "output_path": str(self.tmp_path / "video.ts"),
        }

    async def close(self) -> None:
        self.closed = True


class FakeDownloader:
    async def download(self, job: dict, progress: object) -> DownloadResult:
        await progress(1, 1, 4, True)  # type: ignore[operator]
        return DownloadResult(job["output_path"], 1, 1, 4)


class InterruptedOnceAnalyzer(FakeAnalyzer):
    def __init__(self, tmp_path: Path) -> None:
        super().__init__(tmp_path)
        self.calls = 0

    async def analyze(
        self, page_url: str, preferred_quality: str, output_dir: str
    ) -> dict[str, str]:
        self.calls += 1
        if self.calls == 1:
            raise BrowserInterruptedError("Chrome closed while analyzing")
        return await super().analyze(page_url, preferred_quality, output_dir)


class PausingDownloader:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.calls = 0
        self.cancelled = 0

    async def download(self, job: dict, progress: object) -> DownloadResult:
        self.calls += 1
        if self.calls == 1:
            self.started.set()
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                self.cancelled += 1
                raise
        return DownloadResult(job["output_path"], 1, 1, 4)


async def wait_for_status(store: JobStore, job_id: str, status: str) -> None:
    async with asyncio.timeout(3):
        while store.get_record(job_id)["status"] != status:
            await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_scheduler_analyzes_downloads_and_persists_completion(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    analyzer = FakeAnalyzer(tmp_path)
    scheduler = JobScheduler(
        store,
        analyzer,
        FakeDownloader(),
        EventBroker(),
        progress_update_interval=0,
        shutdown_timeout=1,
    )
    await scheduler.start()
    try:
        job = store.create_job(
            url="https://example.com/video",
            output_dir=str(tmp_path),
            preferred_quality="720p",
            overwrite=False,
        )
        scheduler.notify()
        await wait_for_status(store, job["id"], "completed")
        completed = store.get_job(job["id"])
        assert completed["completedSegments"] == 1
        assert completed["bytesWritten"] == 4
        assert completed["attempts"] == 1
    finally:
        await scheduler.shutdown()
        store.close()
    assert analyzer.closed


@pytest.mark.asyncio
async def test_pause_aborts_running_task_and_resume_starts_new_attempt(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    downloader = PausingDownloader()
    scheduler = JobScheduler(
        store,
        FakeAnalyzer(tmp_path),
        downloader,
        EventBroker(),
        progress_update_interval=0,
        shutdown_timeout=1,
    )
    await scheduler.start()
    try:
        job = store.create_job(
            url="https://example.com/video",
            output_dir=str(tmp_path),
            preferred_quality="720p",
            overwrite=False,
        )
        scheduler.notify()
        await asyncio.wait_for(downloader.started.wait(), timeout=2)
        store.pause(job["id"])
        assert scheduler.cancel_running(job["id"])
        await wait_for_status(store, job["id"], "paused")
        store.resume(job["id"])
        scheduler.notify()
        await wait_for_status(store, job["id"], "completed")
        assert downloader.cancelled == 1
        assert store.get_job(job["id"])["attempts"] == 2
    finally:
        await scheduler.shutdown()
        store.close()


@pytest.mark.asyncio
async def test_shutdown_requeues_and_clears_running_analysis_data(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    downloader = PausingDownloader()
    scheduler = JobScheduler(
        store,
        FakeAnalyzer(tmp_path),
        downloader,
        EventBroker(),
        shutdown_timeout=1,
    )
    await scheduler.start()
    job = store.create_job(
        url="https://example.com/video",
        output_dir=str(tmp_path),
        preferred_quality="720p",
        overwrite=False,
    )
    scheduler.notify()
    await asyncio.wait_for(downloader.started.wait(), timeout=2)
    await scheduler.shutdown()
    record = store.get_record(job["id"])
    assert record["status"] == "queued"
    assert record["playlist_url"] is None
    assert record["referer"] is None
    store.close()


@pytest.mark.asyncio
async def test_browser_interruption_is_retried_once_as_a_new_attempt(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    analyzer = InterruptedOnceAnalyzer(tmp_path)
    scheduler = JobScheduler(
        store,
        analyzer,
        FakeDownloader(),
        EventBroker(),
        progress_update_interval=0,
        shutdown_timeout=1,
    )
    await scheduler.start()
    try:
        job = store.create_job(
            url="https://example.com/video",
            output_dir=str(tmp_path),
            preferred_quality="720p",
            overwrite=False,
        )
        scheduler.notify()
        await wait_for_status(store, job["id"], "completed")
        assert analyzer.calls == 2
        assert store.get_job(job["id"])["attempts"] == 2
        history = store.attempt_history(job["id"])
        assert [attempt["outcome"] for attempt in history] == ["completed", "interrupted"]
    finally:
        await scheduler.shutdown()
        store.close()
