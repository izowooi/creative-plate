from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path

import pytest

import hls_manager.downloader as downloader_module
from hls_manager.downloader import HlsDownloader


class FakeHttpClient:
    def __init__(
        self,
        playlist: str,
        responses: dict[str, list[bytes | Exception]],
    ) -> None:
        self.playlist = playlist
        self.responses = responses
        self.streamed: list[str] = []
        self.closed = False

    async def get_text(self, url: str, *, max_bytes: int) -> str:
        assert len(self.playlist.encode()) <= max_bytes
        return self.playlist

    async def stream(self, url: str, on_chunk: Callable[[bytes], None]) -> None:
        self.streamed.append(url)
        actions = self.responses[url]
        action = actions.pop(0) if len(actions) > 1 else actions[0]
        if isinstance(action, Exception):
            raise action
        on_chunk(action)

    async def close(self) -> None:
        self.closed = True


def make_job(tmp_path: Path, *, overwrite: bool = False) -> dict:
    return {
        "id": "job-123",
        "playlist_url": "https://cdn.example/path/media.m3u8",
        "referer": "https://example.com",
        "output_path": str(tmp_path / "video.ts"),
        "overwrite": overwrite,
    }


def make_downloader(client: FakeHttpClient, **kwargs: object) -> HlsDownloader:
    return HlsDownloader(
        lambda _referer: client,
        max_playlist_bytes=1024,
        max_segments=100,
        max_segment_bytes=1024 * 1024,
        retry_base_seconds=0,
        **kwargs,
    )


@pytest.mark.asyncio
async def test_streams_map_and_segments_in_playlist_order(tmp_path: Path) -> None:
    client = FakeHttpClient(
        '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:1,\none.ts\n#EXTINF:1,\n/two.ts\n',
        {
            "https://cdn.example/path/init.mp4": [b"INIT"],
            "https://cdn.example/path/one.ts": [b"ONE"],
            "https://cdn.example/two.ts": [b"TWO"],
        },
    )
    progress: list[tuple[int, int, int, bool]] = []
    result = await make_downloader(client).download(
        make_job(tmp_path), lambda *args: _record(progress, *args)
    )
    assert Path(result.output_path).read_bytes() == b"INITONETWO"
    assert result.completed_segments == 3
    assert progress[-1] == (3, 3, 10, True)
    assert client.closed


async def _record(target: list[tuple[int, int, int, bool]], *args: object) -> None:
    target.append(args)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_failed_segment_rolls_back_before_retry(tmp_path: Path) -> None:
    class PartialFailureClient(FakeHttpClient):
        attempts = 0

        async def stream(self, url: str, on_chunk: Callable[[bytes], None]) -> None:
            self.streamed.append(url)
            if url.endswith("two.ts") and self.attempts == 0:
                self.attempts += 1
                on_chunk(b"CORRUPT")
                raise RuntimeError("connection reset")
            on_chunk(b"ONE" if url.endswith("one.ts") else b"TWO")

    client = PartialFailureClient(
        "#EXTM3U\none.ts\ntwo.ts\n",
        {},
    )
    result = await make_downloader(client, segment_retries=1).download(
        make_job(tmp_path), lambda *args: _record([], *args)
    )
    assert Path(result.output_path).read_bytes() == b"ONETWO"
    assert client.streamed.count("https://cdn.example/path/two.ts") == 2


@pytest.mark.asyncio
async def test_large_transport_chunk_is_written_in_at_most_64k_pieces(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = b"x" * 200_000
    client = FakeHttpClient(
        "#EXTM3U\none.ts\n",
        {"https://cdn.example/path/one.ts": [payload]},
    )
    real_write = downloader_module.os.write
    write_sizes: list[int] = []

    def tracked_write(fd: int, data: bytes | memoryview) -> int:
        write_sizes.append(len(data))
        return real_write(fd, data)

    monkeypatch.setattr(downloader_module.os, "write", tracked_write)
    await make_downloader(client).download(make_job(tmp_path), lambda *args: _record([], *args))
    assert max(write_sizes) <= 64 * 1024
    assert (tmp_path / "video.ts").stat().st_size == len(payload)


@pytest.mark.asyncio
async def test_permanent_failure_removes_job_specific_partial(tmp_path: Path) -> None:
    client = FakeHttpClient(
        "#EXTM3U\none.ts\ntwo.ts\n",
        {
            "https://cdn.example/path/one.ts": [b"ONE"],
            "https://cdn.example/path/two.ts": [RuntimeError("down")],
        },
    )
    with pytest.raises(RuntimeError, match="failed after 2 attempts"):
        await make_downloader(client, segment_retries=1).download(
            make_job(tmp_path), lambda *args: _record([], *args)
        )
    assert not (tmp_path / "video.ts").exists()
    part = tmp_path / ".video.ts.job-123.part"
    assert not part.exists()


@pytest.mark.asyncio
async def test_nonempty_existing_file_skips_but_zero_byte_is_replaced(tmp_path: Path) -> None:
    final = tmp_path / "video.ts"
    final.write_bytes(b"existing")
    skipped_client = FakeHttpClient("", {})
    skipped = await make_downloader(skipped_client).download(
        make_job(tmp_path), lambda *args: _record([], *args)
    )
    assert skipped.skipped and final.read_bytes() == b"existing"

    final.write_bytes(b"")
    client = FakeHttpClient(
        "#EXTM3U\none.ts\n",
        {"https://cdn.example/path/one.ts": [b"fresh"]},
    )
    result = await make_downloader(client).download(
        make_job(tmp_path), lambda *args: _record([], *args)
    )
    assert not result.skipped and final.read_bytes() == b"fresh"


@pytest.mark.asyncio
async def test_segment_size_cap_rolls_back_current_segment(tmp_path: Path) -> None:
    client = FakeHttpClient(
        "#EXTM3U\none.ts\n",
        {"https://cdn.example/path/one.ts": [b"0123456789"]},
    )
    downloader = HlsDownloader(
        lambda _referer: client,
        max_playlist_bytes=1024,
        max_segments=100,
        max_segment_bytes=5,
        segment_retries=0,
    )
    with pytest.raises(RuntimeError, match="segment exceeds 5"):
        await downloader.download(make_job(tmp_path), lambda *args: _record([], *args))
    assert not (tmp_path / ".video.ts.job-123.part").exists()


@pytest.mark.asyncio
async def test_cancellation_removes_partial_file(tmp_path: Path) -> None:
    started = asyncio.Event()

    class BlockingClient(FakeHttpClient):
        async def stream(self, url: str, on_chunk: Callable[[bytes], None]) -> None:
            on_chunk(b"partial")
            started.set()
            await asyncio.Future()

    client = BlockingClient("#EXTM3U\none.ts\n", {})
    task = asyncio.create_task(
        make_downloader(client).download(make_job(tmp_path), lambda *args: _record([], *args))
    )
    await asyncio.wait_for(started.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not (tmp_path / ".video.ts.job-123.part").exists()
    assert client.closed
