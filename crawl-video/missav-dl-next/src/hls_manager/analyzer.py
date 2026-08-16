from __future__ import annotations

import re
from pathlib import Path
from typing import Protocol
from urllib.parse import urljoin

from .browser import SharedBrowser
from .hls import (
    build_output_filename,
    origin_from_url,
    parse_master_playlist,
    pick_level,
    slug_from_url,
)
from .http_client import HttpClientFactory
from .models import HlsInfo, HlsLevel
from .security import PublicUrlPolicy, validate_public_http_url

_UUID_RE = re.compile(
    r"surrit\.com/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


class Analyzer(Protocol):
    async def analyze(
        self, page_url: str, preferred_quality: str, output_dir: str
    ) -> dict[str, str]: ...

    async def close(self) -> None: ...


class HlsAnalyzer:
    def __init__(
        self,
        browser: SharedBrowser,
        http_factory: HttpClientFactory,
        *,
        max_playlist_bytes: int,
        url_policy: PublicUrlPolicy | None = None,
    ) -> None:
        self.browser = browser
        self.http_factory = http_factory
        self.max_playlist_bytes = max_playlist_bytes
        self.url_policy = url_policy

    async def analyze(
        self,
        page_url: str,
        preferred_quality: str,
        output_dir: str,
    ) -> dict[str, str]:
        validate_public_http_url(page_url)
        if self.url_policy is not None:
            # The browser must not be allowed to navigate to a hostname that
            # resolves onto the local network.
            await self.url_policy.resolve(page_url)
        discovery = await self.browser.discover(page_url)
        final_page_url = discovery.final_url or page_url
        validate_public_http_url(final_page_url)
        if self.url_policy is not None and final_page_url != page_url:
            await self.url_policy.resolve(final_page_url)
        referer = origin_from_url(final_page_url)
        absolute_master_url = (
            urljoin(final_page_url, discovery.master_url) if discovery.master_url else None
        )
        if absolute_master_url is not None:
            validate_public_http_url(absolute_master_url)
        resolved_levels: list[HlsLevel] = []
        for level in discovery.levels:
            level_url = urljoin(absolute_master_url or final_page_url, level.url)
            validate_public_http_url(level_url)
            resolved_levels.append(HlsLevel(level.height, level_url))
        levels = tuple(resolved_levels)
        master_url = absolute_master_url

        candidates: list[str] = []
        if master_url:
            candidates.append(master_url)
        uuid_match = _UUID_RE.search(discovery.html)
        if uuid_match:
            candidates.append(f"https://surrit.com/{uuid_match.group(1)}/playlist.m3u8")
        candidates.extend(reversed(discovery.observed_playlists))
        candidates = list(dict.fromkeys(candidates))
        for candidate in candidates:
            validate_public_http_url(candidate)

        if not levels:
            client = self.http_factory(referer)
            errors: list[str] = []
            try:
                for candidate in candidates:
                    try:
                        text = await client.get_text(candidate, max_bytes=self.max_playlist_bytes)
                        parsed = parse_master_playlist(text, candidate)
                        if parsed:
                            levels = parsed
                            master_url = candidate
                            break
                        if "#EXTM3U" in text:
                            levels = (HlsLevel(0, candidate),)
                            master_url = candidate
                            break
                    except Exception as exc:
                        errors.append(str(exc))
            finally:
                await client.close()
            if not levels:
                detail = f": {errors[-1]}" if errors else ""
                raise ValueError(f"page did not expose a usable HLS playlist{detail}")

        selected = pick_level(levels, preferred_quality)
        quality = selected.quality
        output_path = Path(output_dir) / build_output_filename(page_url, quality)
        info = HlsInfo(
            master_url=master_url or selected.url,
            levels=levels,
            referer=referer,
        )
        return {
            "slug": slug_from_url(page_url),
            "selected_quality": quality,
            "playlist_url": selected.url,
            "referer": info.referer,
            "output_path": str(output_path),
        }

    async def close(self) -> None:
        await self.browser.close()
