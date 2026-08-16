from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from curl_cffi import CurlOpt

import hls_manager.http_client as http_module
from hls_manager.app import create_app
from hls_manager.config import AppConfig, load_config
from hls_manager.db import JobStore
from hls_manager.http_client import CurlHttpClient
from hls_manager.process_lock import ProcessLock
from hls_manager.security import PublicUrlPolicy


class FakeResponse:
    encoding = "utf-8"
    status_code = 200
    headers: dict[str, str] = {}

    def __init__(self, chunks: tuple[bytes, ...] = (b"12345", b"67890")) -> None:
        self.closed = False
        self.chunks = chunks

    def raise_for_status(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True


class FakeSession:
    options: dict[str, object]

    def __init__(self, **options: object) -> None:
        self.options = options
        self.curl_options = options["curl_options"]
        self.closed = False

    async def get(self, url: str, *, content_callback: object, **kwargs: object) -> FakeResponse:
        header_callback = self.options["curl_options"][CurlOpt.HEADERFUNCTION]  # type: ignore[index]
        header_callback(b"HTTP/1.1 200 OK\r\n")  # type: ignore[operator]
        response = FakeResponse()
        for chunk in response.chunks:
            content_callback(chunk)  # type: ignore[operator]
        return response

    async def close(self) -> None:
        self.closed = True


class BlockingAnalyzer:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()
        self.closed = asyncio.Event()

    async def analyze(
        self, page_url: str, preferred_quality: str, output_dir: str
    ) -> dict[str, str]:
        self.started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise

    async def close(self) -> None:
        self.closed.set()


class UnexpectedDownloader:
    async def download(self, job: dict[str, object], progress: object) -> None:
        raise AssertionError("download must not start while analysis is blocked")


@pytest.mark.asyncio
async def test_playlist_fetch_aborts_before_exceeding_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolver(_hostname: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    monkeypatch.setattr(http_module, "_SessionFactory", FakeSession)
    client = CurlHttpClient(
        "https://missav123.com",
        url_policy=PublicUrlPolicy(resolver=resolver),
    )
    with pytest.raises(ValueError, match="exceeds 8"):
        await client.get_text("https://cdn.example/master.m3u8", max_bytes=8)
    await client.close()


def test_target_session_enables_chrome_impersonation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(http_module, "_SessionFactory", FakeSession)
    target = CurlHttpClient("https://missav123.com")
    generic = CurlHttpClient("https://example.com")
    assert target._session.options["impersonate"] == "chrome"  # type: ignore[attr-defined]
    assert "impersonate" not in generic._session.options  # type: ignore[attr-defined]


def test_process_lock_excludes_second_owner_and_is_reusable(tmp_path: Path) -> None:
    first = ProcessLock(tmp_path / "data" / "manager.lock")
    second = ProcessLock(tmp_path / "data" / "manager.lock")
    first.acquire()
    try:
        with pytest.raises(RuntimeError, match="another manager"):
            second.acquire()
        assert (tmp_path / "data").stat().st_mode & 0o777 == 0o700
        assert (tmp_path / "data" / "manager.lock").stat().st_mode & 0o777 == 0o600
    finally:
        first.release()
    second.acquire()
    second.release()


def test_dotenv_load_keeps_shell_priority_and_blank_uses_default(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "HOST=0.0.0.0\nPORT=3999\nAPP_DATA_DIR=/should/not/win\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("HOST", "127.0.0.9")
    monkeypatch.setenv("APP_DATA_DIR", "")
    monkeypatch.delenv("PORT", raising=False)
    config = load_config(env_file=env_file)
    assert config.host == "127.0.0.9"
    assert config.port == 3999
    assert config.data_dir == (Path.home() / ".hls-download-manager").resolve()


def test_database_redacts_urls_from_public_failure_error(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    try:
        job = store.create_job(
            url="https://example.com/video",
            output_dir=str(tmp_path),
            preferred_quality="720p",
            overwrite=False,
        )
        store.claim_for_analysis(1)
        store.fail_job(
            job["id"],
            "analyzing",
            "request https://cdn.example/media.m3u8?token=secret failed",
        )
        error = store.get_job(job["id"])["error"]
        assert "token=secret" not in error
        assert "<redacted-url>" in error
    finally:
        store.close()


@pytest.mark.asyncio
async def test_app_shutdown_requeues_and_cancels_blocked_analysis(tmp_path: Path) -> None:
    store = JobStore(tmp_path / "jobs.sqlite3")
    analyzer = BlockingAnalyzer()
    config = AppConfig(
        data_dir=tmp_path / "data",
        default_output_dir=tmp_path / "downloads",
        public_dir=tmp_path / "public",
        analyze_concurrency=1,
        download_concurrency=1,
        shutdown_timeout_seconds=1,
    )
    app = create_app(
        config,
        store=store,
        analyzer=analyzer,
        downloader=UnexpectedDownloader(),
        use_process_lock=False,
    )
    try:
        async with app.router.lifespan_context(app):
            job = store.create_job(
                url="https://example.com/video",
                output_dir=str(tmp_path),
                preferred_quality="720p",
                overwrite=False,
            )
            app.state.scheduler.notify()
            await asyncio.wait_for(analyzer.started.wait(), timeout=2)
            assert store.get_record(job["id"])["status"] == "analyzing"

            with store._lock:
                store._connection.execute(
                    "UPDATE jobs SET playlist_url=?, referer=? WHERE id=?",
                    (
                        "https://cdn.example/transient.m3u8",
                        "https://example.com/transient",
                        job["id"],
                    ),
                )

        record = store.get_record(job["id"])
        assert record["status"] == "queued"
        assert record["playlist_url"] is None
        assert record["referer"] is None
        assert [attempt["outcome"] for attempt in store.attempt_history(job["id"])] == [
            "interrupted"
        ]
        assert analyzer.cancelled.is_set()
        assert analyzer.closed.is_set()
    finally:
        store.close()
