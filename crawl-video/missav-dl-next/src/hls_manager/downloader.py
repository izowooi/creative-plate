from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable
from contextlib import suppress
from pathlib import Path
from typing import Any, Protocol

from .hls import parse_media_playlist
from .http_client import HttpClientFactory
from .models import DownloadResult, partial_output_path

ProgressCallback = Callable[[int, int, int, bool], Awaitable[None]]


class Downloader(Protocol):
    async def download(
        self,
        job: dict[str, Any],
        progress: ProgressCallback,
    ) -> DownloadResult: ...


def _write_all(fd: int, chunk: memoryview) -> None:
    while chunk:
        written = os.write(fd, chunk)
        if written <= 0:
            raise OSError("file write made no progress")
        chunk = chunk[written:]


class HlsDownloader:
    def __init__(
        self,
        http_factory: HttpClientFactory,
        *,
        max_playlist_bytes: int,
        max_segments: int,
        max_segment_bytes: int,
        chunk_bytes: int = 64 * 1024,
        segment_retries: int = 3,
        retry_base_seconds: float = 0.5,
    ) -> None:
        if not 1 <= chunk_bytes <= 64 * 1024:
            raise ValueError("chunk_bytes must be between 1 and 65536")
        self.http_factory = http_factory
        self.max_playlist_bytes = max_playlist_bytes
        self.max_segments = max_segments
        self.max_segment_bytes = max_segment_bytes
        self.chunk_bytes = chunk_bytes
        self.segment_retries = segment_retries
        self.retry_base_seconds = retry_base_seconds

    async def download(
        self,
        job: dict[str, Any],
        progress: ProgressCallback,
    ) -> DownloadResult:
        final_path = Path(job["output_path"])
        final_path.parent.mkdir(parents=True, exist_ok=True)
        if final_path.exists() and final_path.stat().st_size > 0 and not bool(job["overwrite"]):
            size = final_path.stat().st_size
            return DownloadResult(str(final_path), 0, 0, size, skipped=True)

        client = self.http_factory(job["referer"])
        part_path = partial_output_path(final_path, job["id"])
        fd: int | None = None
        published = False
        try:
            playlist_text = await client.get_text(
                job["playlist_url"], max_bytes=self.max_playlist_bytes
            )
            playlist = parse_media_playlist(
                playlist_text,
                job["playlist_url"],
                max_segments=self.max_segments,
            )
            total = len(playlist.segments)
            await progress(0, total, 0, True)
            fd = os.open(part_path, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o644)
            completed = 0
            bytes_written = 0

            for segment in playlist.segments:
                segment_offset = os.lseek(fd, 0, os.SEEK_CUR)
                last_error: Exception | None = None
                for attempt in range(self.segment_retries + 1):
                    os.ftruncate(fd, segment_offset)
                    os.lseek(fd, segment_offset, os.SEEK_SET)
                    segment_bytes = 0

                    def on_chunk(chunk: bytes) -> None:
                        # CurlHttpClient runs this callback serially on its bounded
                        # writer thread and joins that thread before stream() exits.
                        # Keeping every os.write here at <= chunk_bytes therefore
                        # preserves event-loop responsiveness and safe fd cleanup.
                        nonlocal segment_bytes
                        view = memoryview(chunk)
                        for start in range(0, len(view), self.chunk_bytes):
                            piece = view[start : start + self.chunk_bytes]
                            if segment_bytes + len(piece) > self.max_segment_bytes:
                                raise ValueError(f"segment exceeds {self.max_segment_bytes} bytes")
                            _write_all(fd, piece)
                            segment_bytes += len(piece)

                    try:
                        await client.stream(segment.url, on_chunk)
                        last_error = None
                        break
                    except asyncio.CancelledError:
                        os.ftruncate(fd, segment_offset)
                        os.lseek(fd, segment_offset, os.SEEK_SET)
                        raise
                    except Exception as exc:
                        last_error = exc
                        os.ftruncate(fd, segment_offset)
                        os.lseek(fd, segment_offset, os.SEEK_SET)
                        if attempt >= self.segment_retries:
                            break
                        await asyncio.sleep(self.retry_base_seconds * (2**attempt))

                if last_error is not None:
                    raise RuntimeError(
                        f"segment {completed + 1}/{total} failed after "
                        f"{self.segment_retries + 1} attempts: {last_error}"
                    ) from last_error
                completed += 1
                bytes_written = os.lseek(fd, 0, os.SEEK_CUR)
                await progress(completed, total, bytes_written, completed == total)

            os.fsync(fd)
            os.close(fd)
            fd = None
            if final_path.exists() and final_path.stat().st_size > 0 and not bool(job["overwrite"]):
                part_path.unlink(missing_ok=True)
                size = final_path.stat().st_size
                return DownloadResult(str(final_path), completed, total, size, skipped=True)
            os.replace(part_path, final_path)
            published = True
            return DownloadResult(str(final_path), completed, total, bytes_written, skipped=False)
        finally:
            if fd is not None:
                os.close(fd)
            try:
                await client.close()
            finally:
                if not published:
                    with suppress(OSError):
                        part_path.unlink(missing_ok=True)
