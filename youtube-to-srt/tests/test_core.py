"""core 모듈 단위 테스트 — URL 텍스트 파싱 공용 로직."""
from __future__ import annotations

import pytest

from youtube_to_srt.core import MAX_URLS, Mode, parse_urls_text


def test_mode_values():
    assert Mode.EXTRACT.value == "extract"
    assert Mode.TRANSCRIBE.value == "transcribe"
    assert Mode.ALL.value == "all"


def test_parse_urls_text_basic():
    text = "https://youtu.be/a\nhttps://youtu.be/b\nhttps://youtu.be/c"
    assert parse_urls_text(text) == [
        "https://youtu.be/a",
        "https://youtu.be/b",
        "https://youtu.be/c",
    ]


def test_parse_urls_text_ignores_blank_and_comment():
    text = "\n".join(
        [
            "https://youtu.be/a",
            "",
            "   ",
            "# comment",
            "  # indented comment",
            "https://youtu.be/b",
        ]
    )
    assert parse_urls_text(text) == [
        "https://youtu.be/a",
        "https://youtu.be/b",
    ]


def test_parse_urls_text_strips_whitespace():
    text = "   https://youtu.be/a   \n\thttps://youtu.be/b\t"
    assert parse_urls_text(text) == [
        "https://youtu.be/a",
        "https://youtu.be/b",
    ]


def test_parse_urls_text_empty_raises():
    with pytest.raises(ValueError):
        parse_urls_text("")


def test_parse_urls_text_whitespace_only_raises():
    with pytest.raises(ValueError):
        parse_urls_text("  \n\n  \n# only comments\n")


def test_parse_urls_text_too_many_raises():
    urls = "\n".join(f"https://youtu.be/id{i}" for i in range(MAX_URLS + 1))
    with pytest.raises(ValueError):
        parse_urls_text(urls)


def test_parse_urls_text_exactly_max_ok():
    urls_text = "\n".join(f"https://youtu.be/id{i}" for i in range(MAX_URLS))
    result = parse_urls_text(urls_text)
    assert len(result) == MAX_URLS
