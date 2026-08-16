from __future__ import annotations

from pathlib import Path

import pytest

from hls_manager.analyzer import HlsAnalyzer
from hls_manager.browser import PageDiscovery
from hls_manager.models import HlsLevel


class FakeBrowser:
    def __init__(self, discovery: PageDiscovery) -> None:
        self.discovery = discovery
        self.closed = False

    async def discover(self, page_url: str) -> PageDiscovery:
        return self.discovery

    async def close(self) -> None:
        self.closed = True


class FakeClient:
    def __init__(self, text: str) -> None:
        self.text = text
        self.urls: list[str] = []
        self.closed = False

    async def get_text(self, url: str, *, max_bytes: int) -> str:
        self.urls.append(url)
        return self.text

    async def stream(self, url: str, on_chunk: object) -> None:
        raise AssertionError("not used")

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_js_relative_master_is_resolved_before_relative_level(tmp_path: Path) -> None:
    browser = FakeBrowser(
        PageDiscovery(
            master_url="/hls/master.m3u8",
            levels=(HlsLevel(720, "video/720.m3u8"),),
            html="",
            observed_playlists=(),
        )
    )
    analyzer = HlsAnalyzer(browser, lambda _: FakeClient(""), max_playlist_bytes=1024)
    result = await analyzer.analyze("https://example.com/page/video", "720p", str(tmp_path))
    assert result["playlist_url"] == "https://example.com/hls/video/720.m3u8"
    assert result["referer"] == "https://example.com"


@pytest.mark.asyncio
async def test_observed_master_playlist_is_parsed_and_client_closed(tmp_path: Path) -> None:
    browser = FakeBrowser(
        PageDiscovery(
            master_url=None,
            levels=(),
            html="",
            observed_playlists=("https://cdn.example/master.m3u8",),
        )
    )
    client = FakeClient("#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\n720/media.m3u8\n")
    analyzer = HlsAnalyzer(browser, lambda _: client, max_playlist_bytes=1024)
    result = await analyzer.analyze("https://example.com/page/video", "720", str(tmp_path))
    assert result["playlist_url"] == "https://cdn.example/720/media.m3u8"
    assert client.closed


@pytest.mark.asyncio
async def test_redirected_page_is_used_as_relative_base_and_referer(tmp_path: Path) -> None:
    browser = FakeBrowser(
        PageDiscovery(
            master_url="streams/master.m3u8",
            levels=(HlsLevel(720, "720/media.m3u8"),),
            html="",
            observed_playlists=(),
            final_url="https://redirected.example/watch/item/",
        )
    )
    analyzer = HlsAnalyzer(browser, lambda _: FakeClient(""), max_playlist_bytes=1024)
    result = await analyzer.analyze("https://example.com/item", "720p", str(tmp_path))
    assert result["playlist_url"] == (
        "https://redirected.example/watch/item/streams/720/media.m3u8"
    )
    assert result["referer"] == "https://redirected.example"
