"""SRT 포매터 단위 테스트."""
from __future__ import annotations

from youtube_to_srt.srt_formatter import Segment, format_srt, format_timestamp


def test_format_timestamp_zero():
    assert format_timestamp(0.0) == "00:00:00,000"


def test_format_timestamp_fractional_seconds():
    assert format_timestamp(1.5) == "00:00:01,500"


def test_format_timestamp_hours():
    # 1시간 2분 3.456초
    assert format_timestamp(3723.456) == "01:02:03,456"


def test_format_timestamp_rounds_millis():
    # 부동소수 오차 테스트 (1.2345 -> 밀리초 234 또는 235)
    ts = format_timestamp(1.2345)
    assert ts.startswith("00:00:01,")


def test_format_srt_single_segment():
    segments = [Segment(start=0.0, end=1.0, text="Hello")]
    out = format_srt(segments)
    expected = "1\n00:00:00,000 --> 00:00:01,000\nHello\n"
    assert out == expected


def test_format_srt_multiple_segments():
    segments = [
        Segment(start=0.0, end=1.0, text="Hello"),
        Segment(start=1.0, end=2.5, text="world"),
    ]
    out = format_srt(segments)
    assert "1\n00:00:00,000 --> 00:00:01,000\nHello\n\n" in out
    assert "2\n00:00:00,001" not in out  # index 2 는 다른 타임스탬프여야 함
    assert "2\n00:00:01,000 --> 00:00:02,500\nworld\n" in out


def test_format_srt_strips_whitespace():
    segments = [Segment(start=0.0, end=1.0, text="  padded text  ")]
    out = format_srt(segments)
    assert "padded text" in out
    assert "  padded text" not in out


def test_format_srt_empty():
    assert format_srt([]) == ""
