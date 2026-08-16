from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from playwright.async_api import Browser, Playwright, async_playwright

from .http_client import USER_AGENT
from .models import BrowserInterruptedError, HlsLevel


@dataclass(frozen=True, slots=True)
class PageDiscovery:
    master_url: str | None
    levels: tuple[HlsLevel, ...]
    html: str
    observed_playlists: tuple[str, ...]
    final_url: str | None = None


class SharedBrowser:
    """One installed Chrome process, with an isolated context for each analysis."""

    def __init__(
        self,
        *,
        concurrency: int = 2,
        channel: str = "chrome",
        headless: bool = False,
        idle_seconds: float = 30.0,
    ) -> None:
        self._semaphore = asyncio.Semaphore(concurrency)
        self._channel = channel
        self._headless = headless
        self._idle_seconds = idle_seconds
        self._lock = asyncio.Lock()
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._active_contexts = 0
        self._idle_task: asyncio.Task[None] | None = None
        self._closed = False

    async def _get_browser(self) -> Browser:
        async with self._lock:
            if self._closed:
                raise RuntimeError("browser manager is closed")
            if self._idle_task:
                self._idle_task.cancel()
                self._idle_task = None
            if self._browser and self._browser.is_connected():
                return self._browser
            if self._browser or self._playwright:
                await self._close_locked()
            self._playwright = await async_playwright().start()
            try:
                self._browser = await self._playwright.chromium.launch(
                    channel=self._channel,
                    headless=self._headless,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--window-position=-10000,-10000",
                        "--window-size=1,1",
                    ],
                )
            except Exception:
                await self._playwright.stop()
                self._playwright = None
                raise
            return self._browser

    async def discover(self, page_url: str) -> PageDiscovery:
        async with self._semaphore:
            browser = await self._get_browser()
            async with self._lock:
                self._active_contexts += 1
            context = None
            observed: list[str] = []

            def observe(request: Any) -> None:
                if ".m3u8" in request.url.lower() and request.url not in observed:
                    observed.append(request.url)

            try:
                context = await browser.new_context(
                    viewport={"width": 1280, "height": 720},
                    user_agent=USER_AGENT,
                )
                page = await context.new_page()
                page.on("request", observe)
                await page.goto(page_url, wait_until="domcontentloaded", timeout=20_000)
                js_info: dict[str, Any] | None = None
                try:
                    await page.wait_for_function(
                        "() => window.hls && window.hls.url",
                        timeout=12_000,
                    )
                    js_info = await page.evaluate(
                        """() => ({
                            masterUrl: window.hls && window.hls.url,
                            levels: ((window.hls && window.hls.levels) || []).map(level => ({
                                height: Number(level.height || 0),
                                url: Array.isArray(level.url) ? level.url[0] : level.url,
                            })),
                        })"""
                    )
                except Exception:
                    js_info = None
                # Return only the fallback CDN hint instead of copying the whole DOM
                # into Python. The live page remains isolated in its short-lived context.
                html = await page.evaluate(
                    r"""() => {
                        const match = document.documentElement.innerHTML.match(
                            /surrit\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
                        );
                        return match ? match[0] : "";
                    }"""
                )
                levels = tuple(
                    HlsLevel(int(item.get("height") or 0), str(item["url"]))
                    for item in (js_info or {}).get("levels", [])
                    if item.get("url")
                )
                return PageDiscovery(
                    master_url=(js_info or {}).get("masterUrl"),
                    levels=levels,
                    html=html,
                    observed_playlists=tuple(observed),
                    final_url=page.url,
                )
            except Exception as exc:
                message = str(exc)
                if (
                    type(exc).__name__ == "TargetClosedError"
                    or "Target page, context or browser has been closed" in message
                ):
                    raise BrowserInterruptedError(
                        "Chrome closed while the page was being analyzed"
                    ) from exc
                raise
            finally:
                try:
                    if context is not None:
                        await context.close()
                finally:
                    async with self._lock:
                        self._active_contexts -= 1
                        if not self._active_contexts and not self._closed:
                            self._idle_task = asyncio.create_task(self._close_after_idle())

    async def _close_after_idle(self) -> None:
        try:
            await asyncio.sleep(self._idle_seconds)
            async with self._lock:
                if not self._active_contexts:
                    await self._close_locked()
        except asyncio.CancelledError:
            return

    async def _close_locked(self) -> None:
        browser, playwright = self._browser, self._playwright
        self._browser = None
        self._playwright = None
        try:
            if browser:
                await browser.close()
        finally:
            if playwright:
                await playwright.stop()

    async def close(self) -> None:
        async with self._lock:
            self._closed = True
            if self._idle_task:
                self._idle_task.cancel()
                self._idle_task = None
            await self._close_locked()
