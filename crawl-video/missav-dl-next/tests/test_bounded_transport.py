from __future__ import annotations

import asyncio
import contextlib
import threading
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

import hls_manager.downloader as downloader_module
from hls_manager.downloader import HlsDownloader
from hls_manager.http_client import CurlHttpClient
from hls_manager.security import ResolvedUrl, validate_public_http_url

_SERVER_CHUNK = bytes(range(256)) * 256


@dataclass(slots=True)
class _ServerState:
    payload_bytes: int
    chunk_delay: float = 0.0
    segment_started: threading.Event = field(default_factory=threading.Event)
    disconnected: threading.Event = field(default_factory=threading.Event)


class _LocalPinPolicy:
    """Test-only resolver that deliberately pins a public-shaped name to loopback."""

    async def resolve(self, url: str) -> ResolvedUrl:
        hostname, port = validate_public_http_url(url)
        return ResolvedUrl(url, hostname, port, ("127.0.0.1",))


def _handler_for(state: _ServerState) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            if self.path == "/media.m3u8":
                body = b"#EXTM3U\n#EXTINF:1,\nsegment.ts\n"
                self.send_response(200)
                self.send_header("Content-Type", "application/vnd.apple.mpegurl")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if self.path != "/segment.ts":
                self.send_error(404)
                return

            self.send_response(200)
            self.send_header("Content-Type", "video/mp2t")
            self.send_header("Content-Length", str(state.payload_bytes))
            self.end_headers()
            remaining = state.payload_bytes
            try:
                while remaining:
                    piece = _SERVER_CHUNK[: min(remaining, len(_SERVER_CHUNK))]
                    self.wfile.write(piece)
                    self.wfile.flush()
                    state.segment_started.set()
                    remaining -= len(piece)
                    if state.chunk_delay:
                        time.sleep(state.chunk_delay)
            except (BrokenPipeError, ConnectionResetError):
                state.disconnected.set()

        def log_message(self, _format: str, *_args: object) -> None:
            return

    return Handler


@contextlib.contextmanager
def _local_hls_server(
    payload_bytes: int, *, chunk_delay: float = 0.0
) -> Iterator[tuple[str, _ServerState]]:
    state = _ServerState(payload_bytes, chunk_delay)
    server = ThreadingHTTPServer(("127.0.0.1", 0), _handler_for(state))
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, name="bounded-test-http")
    thread.start()
    port = server.server_address[1]
    try:
        yield f"http://transport.example:{port}", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def _job(tmp_path: Path, base_url: str) -> dict[str, object]:
    return {
        "id": "bounded-job",
        "playlist_url": f"{base_url}/media.m3u8",
        "referer": base_url,
        "output_path": str(tmp_path / "bounded.ts"),
        "overwrite": False,
    }


async def _ignore_progress(_done: int, _total: int, _size: int, _force: bool) -> None:
    return


def _downloader(client: CurlHttpClient, payload_bytes: int) -> HlsDownloader:
    return HlsDownloader(
        lambda _referer: client,
        max_playlist_bytes=64 * 1024,
        max_segments=10,
        max_segment_bytes=payload_bytes + 1,
        chunk_bytes=16 * 1024,
        segment_retries=0,
    )


@pytest.mark.asyncio
async def test_fast_multimegabyte_transport_stays_inside_bounded_queue(tmp_path: Path) -> None:
    payload_bytes = 8 * 1024 * 1024 + 123
    with _local_hls_server(payload_bytes) as (base_url, _state):
        client = CurlHttpClient(
            base_url,
            url_policy=_LocalPinPolicy(),  # type: ignore[arg-type]
            stream_buffer_bytes=64 * 1024,
            stream_buffer_items=2,
        )
        result = await _downloader(client, payload_bytes).download(
            _job(tmp_path, base_url), _ignore_progress
        )

    assert Path(result.output_path).stat().st_size == payload_bytes
    assert client.last_stream_stats is not None
    assert client.last_stream_stats.peak_bytes <= 64 * 1024
    assert client.last_stream_stats.peak_items <= 2
    assert not client.last_stream_stats.aborted


@pytest.mark.asyncio
async def test_slow_disk_writer_does_not_block_loop_and_applies_backpressure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload_bytes = 2 * 1024 * 1024
    real_write = downloader_module.os.write
    writer_threads: set[str] = set()

    def slow_write(fd: int, data: bytes | memoryview) -> int:
        writer_threads.add(threading.current_thread().name)
        time.sleep(0.004)
        return real_write(fd, data)

    monkeypatch.setattr(downloader_module.os, "write", slow_write)
    ticks = 0
    keep_ticking = True

    async def heartbeat() -> None:
        nonlocal ticks
        while keep_ticking:
            ticks += 1
            await asyncio.sleep(0.001)

    with _local_hls_server(payload_bytes) as (base_url, _state):
        client = CurlHttpClient(
            base_url,
            url_policy=_LocalPinPolicy(),  # type: ignore[arg-type]
            stream_buffer_bytes=32 * 1024,
            stream_buffer_items=2,
        )
        heartbeat_task = asyncio.create_task(heartbeat())
        try:
            await _downloader(client, payload_bytes).download(
                _job(tmp_path, base_url), _ignore_progress
            )
        finally:
            keep_ticking = False
            await heartbeat_task

    assert ticks >= 50
    assert writer_threads == {"hls-segment-writer"}
    assert client.last_stream_stats is not None
    assert client.last_stream_stats.peak_bytes <= 32 * 1024
    assert client.last_stream_stats.peak_items <= 2


@pytest.mark.asyncio
async def test_cancel_aborts_curl_and_joins_writer_before_partial_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload_bytes = 64 * 1024 * 1024
    real_write = downloader_module.os.write
    write_started = threading.Event()

    def slow_write(fd: int, data: bytes | memoryview) -> int:
        write_started.set()
        time.sleep(0.05)
        return real_write(fd, data)

    monkeypatch.setattr(downloader_module.os, "write", slow_write)
    with _local_hls_server(payload_bytes) as (base_url, state):
        client = CurlHttpClient(
            base_url,
            url_policy=_LocalPinPolicy(),  # type: ignore[arg-type]
            stream_buffer_bytes=32 * 1024,
            stream_buffer_items=2,
        )
        task = asyncio.create_task(
            _downloader(client, payload_bytes).download(_job(tmp_path, base_url), _ignore_progress)
        )
        await asyncio.wait_for(asyncio.to_thread(write_started.wait), timeout=2)
        started_at = asyncio.get_running_loop().time()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(task, timeout=1)
        cancel_seconds = asyncio.get_running_loop().time() - started_at
        await asyncio.wait_for(asyncio.to_thread(state.disconnected.wait), timeout=2)

    assert cancel_seconds < 1
    assert not (tmp_path / "bounded.ts").exists()
    assert not (tmp_path / ".bounded.ts.bounded-job.part").exists()
    assert client.last_stream_stats is not None and client.last_stream_stats.aborted
    assert not any(thread.name == "hls-segment-writer" for thread in threading.enumerate())


@pytest.mark.asyncio
async def test_disk_error_aborts_inflight_curl_and_removes_partial(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload_bytes = 32 * 1024 * 1024
    write_attempted = threading.Event()

    def failed_write(_fd: int, _data: bytes | memoryview) -> int:
        write_attempted.set()
        raise OSError("simulated disk failure")

    monkeypatch.setattr(downloader_module.os, "write", failed_write)
    with _local_hls_server(payload_bytes) as (base_url, state):
        client = CurlHttpClient(
            base_url,
            url_policy=_LocalPinPolicy(),  # type: ignore[arg-type]
            stream_buffer_bytes=32 * 1024,
            stream_buffer_items=2,
        )
        started_at = asyncio.get_running_loop().time()
        with pytest.raises(RuntimeError, match="simulated disk failure"):
            await asyncio.wait_for(
                _downloader(client, payload_bytes).download(
                    _job(tmp_path, base_url), _ignore_progress
                ),
                timeout=1,
            )
        failure_seconds = asyncio.get_running_loop().time() - started_at
        await asyncio.wait_for(asyncio.to_thread(state.disconnected.wait), timeout=2)

    assert write_attempted.is_set()
    assert failure_seconds < 1
    assert not (tmp_path / "bounded.ts").exists()
    assert not (tmp_path / ".bounded.ts.bounded-job.part").exists()
    assert not any(thread.name == "hls-segment-writer" for thread in threading.enumerate())
