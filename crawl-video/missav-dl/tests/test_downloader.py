"""missav-dl downloader 단위/통합 테스트.

기본 실행: 단위 테스트만 (`uv run pytest`).
통합 테스트 포함: `uv run pytest -m integration` 또는 `-m ''` 로 마커 제거.
"""
import pytest

from downloader import (
    HlsInfo,
    HlsLevel,
    _origin_from_page_url,
    _parse_master,
    build_filename,
)


# =================== 단위 테스트 ===================


def test_origin_from_missav_ai():
    assert _origin_from_page_url("https://missav.ai/ko/h_1724a141g00017") == "https://missav.ai"


def test_origin_from_missav_ws():
    assert _origin_from_page_url("https://missav.ws/hmn-730") == "https://missav.ws"


def test_origin_strips_path_and_query():
    assert _origin_from_page_url("https://example.com/foo/bar?x=1#y") == "https://example.com"


def test_parse_master_picks_resolutions():
    uuid = "294e7af2-52d1-4947-8d27-e6a982f03136"
    text = (
        "#EXTM3U\n"
        "#EXT-X-STREAM-INF:RESOLUTION=640x360\n"
        "360p/video.m3u8\n"
        "#EXT-X-STREAM-INF:RESOLUTION=1280x720\n"
        f"https://surrit.com/{uuid}/720p/video.m3u8\n"
    )
    levels = _parse_master(text, uuid)
    assert {l.height for l in levels} == {360, 720}
    by_h = {l.height: l.url for l in levels}
    assert by_h[360] == f"https://surrit.com/{uuid}/360p/video.m3u8"
    assert by_h[720] == f"https://surrit.com/{uuid}/720p/video.m3u8"


def test_build_filename_ascii_only():
    assert build_filename("h_1724a141g00017", "720p") == "missav_h_1724a141g00017_720p.ts"


def test_build_filename_strips_non_ascii():
    name = build_filename("hmn-730 한글제목", "480p")
    assert name == "missav_hmn-730_480p.ts"


def test_build_filename_replaces_forbidden_chars():
    name = build_filename('foo<bar>:"baz/qux\\|?*', "1080p")
    # 금지 문자가 _ 로 치환되고 3개 이상 연속은 __ 로 줄어듦
    assert name.endswith("_1080p.ts")
    forbidden = '<>:"/\\|?*'
    assert all(ch not in name for ch in forbidden)


# =================== 통합 테스트 (실제 네트워크) ===================


@pytest.mark.integration
def test_get_hls_info_missav_ws_returns_levels():
    """missav.ws 도메인에서도 master URL + levels 를 추출해야 한다.

    이 테스트가 실패하는 것이 사용자 보고된 회귀의 본질.
    """
    from downloader import get_hls_info

    info = get_hls_info("https://missav.ws/hmn-730")
    assert isinstance(info, HlsInfo)
    assert info.master_url.startswith("https://surrit.com/")
    assert info.master_url.endswith("playlist.m3u8")
    assert len(info.levels) > 0
    assert all(isinstance(l, HlsLevel) for l in info.levels)
    assert all(l.height in {240, 360, 480, 720, 1080} for l in info.levels)
    assert info.referer == "https://missav.ws"


@pytest.mark.integration
def test_get_hls_info_missav_ai_still_works():
    """기존 missav.ai 도메인도 깨지지 않아야 한다 (회귀 방지)."""
    from downloader import get_hls_info

    info = get_hls_info("https://missav.ai/ko/h_1724a141g00017")
    assert info.master_url.startswith("https://surrit.com/")
    assert len(info.levels) > 0
    assert info.referer == "https://missav.ai"
