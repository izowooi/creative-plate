from __future__ import annotations

import asyncio
import threading
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urljoin, urlparse

from curl_cffi import Curl, CurlOpt
from curl_cffi.curl import CURL_WRITEFUNC_PAUSE, CURLPAUSE_CONT
from curl_cffi.requests import AsyncSession

from .security import PublicUrlPolicy, validate_public_http_url

TARGET_HOST = "missav123.com"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_DEFAULT_STREAM_BUFFER_BYTES = 512 * 1024
_DEFAULT_STREAM_BUFFER_ITEMS = 16


class _SingleHandleAsyncSession(AsyncSession):
    """AsyncSession variant that exposes its sole in-flight Curl handle.

    curl-cffi does not currently pass the easy handle to ``content_callback``.
    Keeping one client in the pool and tracking ``pop_curl``/``release_curl`` lets
    the bounded body bridge resume that exact handle after returning
    CURL_WRITEFUNC_PAUSE. See the module note in ``CurlHttpClient`` before changing
    curl-cffi versions.
    """

    active_curl: Curl | None

    def __init__(self, **options: object) -> None:
        super().__init__(max_clients=1, **options)
        self.active_curl = None

    async def pop_curl(self) -> Curl:
        curl = await super().pop_curl()
        if self.active_curl is not None:
            raise RuntimeError("the single-handle HTTP session is already in use")
        self.active_curl = curl
        return curl

    def release_curl(self, curl: Curl) -> None:
        if self.active_curl is curl:
            self.active_curl = None
        super().release_curl(curl)


# Tests replace this factory with a small deterministic session double. Keeping
# the seam here avoids coupling playlist/parser tests to curl-cffi internals.
_SessionFactory: type[AsyncSession] = _SingleHandleAsyncSession


@dataclass(frozen=True, slots=True)
class StreamBufferStats:
    peak_bytes: int
    peak_items: int
    aborted: bool


class _BoundedBodyBridge:
    """Move response chunks onto a writer thread with strict backpressure.

    The Curl write callback cannot await. If either queue limit is reached it
    returns CURL_WRITEFUNC_PAUSE *without retaining that chunk*. libcurl keeps and
    redelivers the same bytes after the writer makes room and resumes the exact
    active easy handle.
    """

    def __init__(
        self,
        on_chunk: Callable[[bytes], None],
        *,
        loop: asyncio.AbstractEventLoop,
        active_curl: Callable[[], Curl | None],
        max_bytes: int,
        max_items: int,
    ) -> None:
        self._on_chunk = on_chunk
        self._loop = loop
        self._active_curl = active_curl
        self._max_bytes = max_bytes
        self._max_items = max_items
        self._condition = threading.Condition()
        self._pending: deque[bytes] = deque()
        # These counters include the item currently being written. This makes the
        # bounds apply to all Python-owned response bytes, not just deque entries.
        self._buffered_bytes = 0
        self._buffered_items = 0
        self._peak_bytes = 0
        self._peak_items = 0
        self._input_closed = False
        self._aborted = False
        self._paused = False
        self._resume_scheduled = False
        self._writer_error: Exception | None = None
        self._request_task: asyncio.Task[object] | None = None
        self._thread = threading.Thread(
            target=self._writer_main,
            name="hls-segment-writer",
            daemon=False,
        )
        self._thread.start()

    @property
    def writer_error(self) -> Exception | None:
        with self._condition:
            return self._writer_error

    @property
    def stats(self) -> StreamBufferStats:
        with self._condition:
            return StreamBufferStats(
                peak_bytes=self._peak_bytes,
                peak_items=self._peak_items,
                aborted=self._aborted,
            )

    def bind_request(self, task: asyncio.Task[object]) -> None:
        with self._condition:
            self._request_task = task
            failed = self._writer_error is not None
        if failed:
            task.cancel()

    def unbind_request(self, task: asyncio.Task[object]) -> None:
        with self._condition:
            if self._request_task is task:
                self._request_task = None

    def callback(self, chunk: bytes) -> int:
        size = len(chunk)
        with self._condition:
            if self._writer_error is not None:
                raise self._writer_error
            if self._aborted:
                raise RuntimeError("segment stream was aborted")
            if size > self._max_bytes:
                raise ValueError(
                    f"transport chunk exceeds the {self._max_bytes}-byte stream buffer"
                )
            if (
                self._buffered_items >= self._max_items
                or self._buffered_bytes + size > self._max_bytes
            ):
                self._paused = True
                return CURL_WRITEFUNC_PAUSE

            self._pending.append(chunk)
            self._buffered_bytes += size
            self._buffered_items += 1
            self._peak_bytes = max(self._peak_bytes, self._buffered_bytes)
            self._peak_items = max(self._peak_items, self._buffered_items)
            self._condition.notify()
        return size

    def _writer_main(self) -> None:
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: bool(self._pending) or self._input_closed or self._aborted
                )
                if self._aborted:
                    return
                if not self._pending:
                    if self._input_closed:
                        return
                    continue
                chunk = self._pending.popleft()

            try:
                self._on_chunk(chunk)
            except Exception as exc:
                with self._condition:
                    self._writer_error = exc
                    self._pending.clear()
                    self._buffered_bytes = 0
                    self._buffered_items = 0
                    request_task = self._request_task
                    self._condition.notify_all()
                if request_task is not None:
                    self._loop.call_soon_threadsafe(request_task.cancel)
                return

            with self._condition:
                if self._aborted:
                    return
                self._buffered_bytes -= len(chunk)
                self._buffered_items -= 1
                should_resume = (
                    self._paused and not self._resume_scheduled and not self._input_closed
                )
                if should_resume:
                    self._paused = False
                    self._resume_scheduled = True
                self._condition.notify_all()
            if should_resume:
                self._loop.call_soon_threadsafe(self._resume)

    def _resume(self) -> None:
        with self._condition:
            self._resume_scheduled = False
            if self._aborted or self._writer_error is not None:
                return
        curl = self._active_curl()
        if curl is not None:
            curl.pause(CURLPAUSE_CONT)

    def close_input(self) -> None:
        with self._condition:
            self._input_closed = True
            self._condition.notify_all()

    def abort(self) -> None:
        with self._condition:
            self._aborted = True
            self._input_closed = True
            self._pending.clear()
            self._buffered_bytes = 0
            self._buffered_items = 0
            self._condition.notify_all()

    async def join(self) -> None:
        join_task = asyncio.create_task(asyncio.to_thread(self._thread.join))
        try:
            await asyncio.shield(join_task)
        except asyncio.CancelledError:
            # A second cancellation must not let the downloader close/truncate the
            # file descriptor while the writer is still inside os.write.
            await join_task
            raise


class _ResponseHeaders:
    """Small header parser used before the direct body callback runs."""

    def __init__(self) -> None:
        self.status_code = 0
        self.location: str | None = None

    def __call__(self, line: bytes) -> int:
        stripped = line.strip()
        if stripped.upper().startswith(b"HTTP/"):
            parts = stripped.split(None, 2)
            try:
                self.status_code = int(parts[1])
            except (IndexError, ValueError):
                self.status_code = 0
            self.location = None
        elif b":" in stripped:
            name, value = stripped.split(b":", 1)
            if name.strip().lower() == b"location" and len(value) <= 8192:
                self.location = value.strip().decode("latin-1")
        return len(line)


def is_target_origin(origin: str) -> bool:
    hostname = (urlparse(origin).hostname or "").lower()
    return hostname == TARGET_HOST or hostname.endswith(f".{TARGET_HOST}")


def browser_headers(referer: str) -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Referer": referer.rstrip("/") + "/",
        "Origin": referer.rstrip("/"),
    }


class HttpClient(Protocol):
    async def get_text(self, url: str, *, max_bytes: int) -> str: ...

    async def stream(self, url: str, on_chunk: Callable[[bytes], None]) -> None:
        """Invoke ``on_chunk`` serially off-loop and join it before returning."""
        ...

    async def close(self) -> None: ...


class HttpClientFactory(Protocol):
    def __call__(self, referer: str) -> HttpClient: ...


class CurlHttpClient:
    """Per-job curl session with bounded, disk-threaded response streaming.

    The pause bridge relies on curl-cffi 0.16's overridable ``pop_curl`` and
    ``release_curl`` methods plus constants from ``curl_cffi.curl``. Those are
    small private-extension points rather than a documented high-level streaming
    API, so the pinned dependency and transport tests are intentional safeguards.
    """

    def __init__(
        self,
        referer: str,
        *,
        timeout: float = 120.0,
        url_policy: PublicUrlPolicy | None = None,
        max_redirects: int = 5,
        stream_buffer_bytes: int = _DEFAULT_STREAM_BUFFER_BYTES,
        stream_buffer_items: int = _DEFAULT_STREAM_BUFFER_ITEMS,
    ) -> None:
        validate_public_http_url(referer)
        if stream_buffer_bytes < 16 * 1024:
            raise ValueError("stream_buffer_bytes must be at least 16384")
        if stream_buffer_items < 1:
            raise ValueError("stream_buffer_items must be positive")
        options: dict[str, object] = {
            "headers": browser_headers(referer),
            "timeout": timeout,
            "allow_redirects": False,
            "trust_env": False,
            "curl_options": {
                CurlOpt.PROTOCOLS_STR: "http,https",
                CurlOpt.REDIR_PROTOCOLS_STR: "http,https",
            },
        }
        if is_target_origin(referer):
            options["impersonate"] = "chrome"
        self._session = _SessionFactory(**options)
        self._url_policy = url_policy or PublicUrlPolicy()
        self._max_redirects = max_redirects
        self._stream_buffer_bytes = stream_buffer_bytes
        self._stream_buffer_items = stream_buffer_items
        self.last_stream_stats: StreamBufferStats | None = None
        self._closed = False

    def _active_curl(self) -> Curl | None:
        return getattr(self._session, "active_curl", None)

    async def _consume(
        self,
        url: str,
        on_chunk: Callable[[bytes], int | None],
        *,
        bridge: _BoundedBodyBridge | None = None,
    ) -> str:
        current_url = url
        for redirect_count in range(self._max_redirects + 1):
            resolved = await self._url_policy.resolve(current_url)
            # Pin libcurl to the exact public addresses that passed validation.
            # This closes the DNS-rebinding gap between our lookup and connect.
            headers = _ResponseHeaders()
            self._session.curl_options[CurlOpt.RESOLVE] = [resolved.curl_resolve_entry]
            self._session.curl_options[CurlOpt.HEADERFUNCTION] = headers
            callback_error: Exception | None = None

            def callback(chunk: bytes, response_headers: _ResponseHeaders = headers) -> int:
                nonlocal callback_error
                # Redirect/error response bodies must never become video bytes.
                if (
                    response_headers.status_code in _REDIRECT_STATUSES
                    or response_headers.status_code >= 400
                ):
                    return len(chunk)
                try:
                    result = on_chunk(chunk)
                except Exception as exc:
                    callback_error = exc
                    raise
                return len(chunk) if result is None else result

            request_task: asyncio.Task[object] | None = None
            try:
                request_task = asyncio.create_task(
                    self._session.get(
                        current_url,
                        content_callback=callback,
                        allow_redirects=False,
                    )
                )
                if bridge is not None:
                    bridge.bind_request(request_task)
                response = await request_task
            except asyncio.CancelledError:
                writer_error = bridge.writer_error if bridge is not None else None
                current_task = asyncio.current_task()
                # A child request canceled by the writer does not cancel this
                # task. Preserve genuine caller cancellation when both race.
                if (
                    writer_error is not None
                    and current_task is not None
                    and current_task.cancelling() == 0
                ):
                    raise writer_error from None
                raise
            except Exception:
                if callback_error is not None:
                    raise callback_error from None
                raise
            finally:
                if bridge is not None and request_task is not None:
                    bridge.unbind_request(request_task)
            try:
                if response.status_code in _REDIRECT_STATUSES:
                    if redirect_count >= self._max_redirects:
                        raise ValueError(f"request exceeded {self._max_redirects} redirects")
                    location = headers.location
                    if not location:
                        raise ValueError("redirect response is missing Location")
                    current_url = urljoin(current_url, location)
                    validate_public_http_url(current_url)
                    continue
                response.raise_for_status()
                if callback_error is not None:
                    raise callback_error
                return response.encoding or "utf-8"
            finally:
                response.close()
        raise AssertionError("redirect loop terminated unexpectedly")

    async def get_text(self, url: str, *, max_bytes: int) -> str:
        content = bytearray()

        def append(chunk: bytes) -> None:
            if len(content) + len(chunk) > max_bytes:
                raise ValueError(f"playlist exceeds {max_bytes} bytes")
            content.extend(chunk)

        encoding = await self._consume(url, append)
        return bytes(content).decode(encoding, errors="replace")

    async def stream(self, url: str, on_chunk: Callable[[bytes], None]) -> None:
        if self._closed:
            raise RuntimeError("HTTP client is closed")
        loop = asyncio.get_running_loop()
        bridge = _BoundedBodyBridge(
            on_chunk,
            loop=loop,
            active_curl=self._active_curl,
            max_bytes=self._stream_buffer_bytes,
            max_items=self._stream_buffer_items,
        )
        try:
            await self._consume(url, bridge.callback, bridge=bridge)
        except BaseException:
            bridge.abort()
            await bridge.join()
            self.last_stream_stats = bridge.stats
            raise
        else:
            bridge.close_input()
            await bridge.join()
            self.last_stream_stats = bridge.stats
            if bridge.writer_error is not None:
                raise bridge.writer_error

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._session.close()


class CurlHttpClientFactory:
    def __init__(
        self,
        *,
        timeout: float = 120.0,
        url_policy: PublicUrlPolicy | None = None,
    ) -> None:
        self.timeout = timeout
        self.url_policy = url_policy or PublicUrlPolicy()

    def __call__(self, referer: str) -> CurlHttpClient:
        return CurlHttpClient(
            referer,
            timeout=self.timeout,
            url_policy=self.url_policy,
        )
