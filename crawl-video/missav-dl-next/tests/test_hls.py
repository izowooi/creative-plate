from __future__ import annotations

import pytest

from hls_manager.hls import (
    build_output_filename,
    expand_range_urls,
    parse_master_playlist,
    parse_media_playlist,
    pick_level,
)
from hls_manager.models import HlsLevel, PlaylistError


def test_expand_range_preserves_equal_width_padding() -> None:
    assert expand_range_urls("https://example.com/v007", "https://example.com/v010") == [
        "https://example.com/v007",
        "https://example.com/v008",
        "https://example.com/v009",
        "https://example.com/v010",
    ]


def test_expand_range_rejects_mismatch_reverse_and_cap() -> None:
    with pytest.raises(ValueError, match="prefix"):
        expand_range_urls("https://example.com/a1", "https://example.com/b2")
    with pytest.raises(ValueError, match="start"):
        expand_range_urls("https://example.com/a2", "https://example.com/a1")
    with pytest.raises(ValueError, match="more than"):
        expand_range_urls("https://example.com/a1", "https://example.com/a3", maximum=2)


def test_parse_master_resolves_relative_uri_after_comment() -> None:
    playlist = """#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=1280x720
# an allowed intervening comment
video/720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=640x360
https://cdn.example/360.m3u8
"""
    levels = parse_master_playlist(playlist, "https://cdn.example/root/master.m3u8")
    assert levels == (
        HlsLevel(720, "https://cdn.example/root/video/720.m3u8"),
        HlsLevel(360, "https://cdn.example/360.m3u8"),
    )


def test_media_playlist_resolves_map_and_segments_in_order() -> None:
    playlist = """#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:4,
one.m4s
#EXTINF:4,
../two.m4s?token=x
"""
    parsed = parse_media_playlist(playlist, "https://cdn.example/a/media.m3u8")
    assert [(item.url, item.is_init) for item in parsed.segments] == [
        ("https://cdn.example/a/init.mp4", True),
        ("https://cdn.example/a/one.m4s", False),
        ("https://cdn.example/two.m4s?token=x", False),
    ]


@pytest.mark.parametrize(
    "line, message",
    [
        ('#EXT-X-KEY:METHOD=AES-128,URI="key"', "encrypted"),
        ("#EXT-X-BYTERANGE:1000@0", "byte-range"),
        ('#EXT-X-MAP:URI="init",BYTERANGE="10@0"', "byte-range"),
    ],
)
def test_media_playlist_rejects_unsupported_profiles(line: str, message: str) -> None:
    with pytest.raises(PlaylistError, match=message):
        parse_media_playlist(f"#EXTM3U\n{line}\nsegment.ts\n", "https://cdn/x.m3u8")


def test_media_playlist_enforces_segment_cap() -> None:
    with pytest.raises(PlaylistError, match="more than 2"):
        parse_media_playlist(
            "#EXTM3U\na.ts\nb.ts\nc.ts\n",
            "https://cdn/x.m3u8",
            max_segments=2,
        )


def test_pick_level_uses_exact_then_closest_lower() -> None:
    levels = (
        HlsLevel(360, "360"),
        HlsLevel(720, "720"),
        HlsLevel(1080, "1080"),
    )
    assert pick_level(levels, "720p").height == 720
    assert pick_level(levels, "900").height == 720
    assert pick_level(levels, "auto").height == 1080


def test_filename_has_url_hash_to_avoid_slug_collision() -> None:
    first = build_output_filename("https://example.com/a/video", "720p")
    second = build_output_filename("https://example.net/b/video", "720p")
    assert first != second
    assert first.startswith("video_") and first.endswith("_720p.ts")
