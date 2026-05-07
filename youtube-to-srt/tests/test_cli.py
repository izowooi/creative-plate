"""CLI 파서 단위 테스트."""
from __future__ import annotations

from pathlib import Path

import pytest

from youtube_to_srt.cli import MAX_URLS, Mode, parse_args


def test_parse_single_url_defaults_to_extract():
    args = parse_args(["https://youtu.be/abc123"])
    assert args.urls == ["https://youtu.be/abc123"]
    assert args.mode is Mode.EXTRACT


def test_parse_multiple_urls():
    urls = [f"https://youtu.be/id{i}" for i in range(3)]
    args = parse_args(urls)
    assert args.urls == urls


def test_mode_flag_transcribe():
    args = parse_args(["--mode", "transcribe", "audio/foo.m4a"])
    assert args.mode is Mode.TRANSCRIBE
    assert args.urls == ["audio/foo.m4a"]


def test_mode_flag_all():
    args = parse_args(["--mode", "all", "https://youtu.be/abc123"])
    assert args.mode is Mode.ALL


def test_urls_file(tmp_path: Path):
    urls_file = tmp_path / "urls.txt"
    urls_file.write_text(
        "\n".join(
            [
                "https://youtu.be/first",
                "  ",  # 공백 줄은 무시
                "# comment",  # 주석 무시
                "https://youtu.be/second",
            ]
        )
    )
    args = parse_args(["--urls-file", str(urls_file)])
    assert args.urls == ["https://youtu.be/first", "https://youtu.be/second"]


def test_urls_file_and_positional_combined(tmp_path: Path):
    urls_file = tmp_path / "urls.txt"
    urls_file.write_text("https://youtu.be/from_file\n")
    args = parse_args(["--urls-file", str(urls_file), "https://youtu.be/positional"])
    assert args.urls == ["https://youtu.be/from_file", "https://youtu.be/positional"]


def test_too_many_urls_raises():
    urls = [f"https://youtu.be/id{i}" for i in range(MAX_URLS + 1)]
    with pytest.raises(SystemExit):
        parse_args(urls)


def test_zero_urls_raises():
    with pytest.raises(SystemExit):
        parse_args([])


def test_output_dirs_default():
    args = parse_args(["https://youtu.be/abc"])
    assert args.audio_dir == Path("audio")
    assert args.srt_dir == Path("srt")


def test_output_dirs_override():
    args = parse_args(
        [
            "--audio-dir",
            "/tmp/a",
            "--srt-dir",
            "/tmp/s",
            "https://youtu.be/abc",
        ]
    )
    assert args.audio_dir == Path("/tmp/a")
    assert args.srt_dir == Path("/tmp/s")


def test_model_default_small():
    args = parse_args(["https://youtu.be/abc"])
    assert args.model == "small"


def test_model_override():
    args = parse_args(["--model", "base", "https://youtu.be/abc"])
    assert args.model == "base"
