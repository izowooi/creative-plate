"""전사 모듈 단위 테스트 (faster-whisper 모킹)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from youtube_to_srt.srt_formatter import Segment
from youtube_to_srt.transcriber import (
    LocalWhisperBackend,
    TranscriberBackend,
    TranscriptionError,
    transcribe_to_srt,
)


class _FakeSeg:
    def __init__(self, start: float, end: float, text: str):
        self.start = start
        self.end = end
        self.text = text


class StubBackend(TranscriberBackend):
    """테스트용 백엔드 — 백엔드 교체 가능성을 검증."""

    def __init__(self, segments: list[Segment]):
        self._segments = segments
        self.calls: list[Path] = []

    def transcribe(self, audio_path: Path) -> list[Segment]:
        self.calls.append(audio_path)
        return list(self._segments)


def test_transcribe_to_srt_uses_backend_and_writes_file(tmp_path: Path):
    audio = tmp_path / "x.m4a"
    audio.write_bytes(b"dummy")
    out = tmp_path / "out.srt"

    backend = StubBackend([Segment(start=0.0, end=1.0, text="hello")])
    transcribe_to_srt(audio, out, backend=backend)

    assert backend.calls == [audio]
    content = out.read_text()
    assert "1\n00:00:00,000 --> 00:00:01,000\nhello" in content


def test_transcribe_to_srt_creates_parent_dir(tmp_path: Path):
    audio = tmp_path / "x.m4a"
    audio.write_bytes(b"dummy")
    out = tmp_path / "nested" / "dir" / "out.srt"

    backend = StubBackend([Segment(start=0.0, end=0.5, text="hi")])
    transcribe_to_srt(audio, out, backend=backend)

    assert out.exists()


def test_transcribe_raises_if_audio_missing(tmp_path: Path):
    missing = tmp_path / "missing.m4a"
    backend = StubBackend([])
    with pytest.raises(TranscriptionError):
        transcribe_to_srt(missing, tmp_path / "out.srt", backend=backend)


def test_local_whisper_backend_wraps_faster_whisper(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"dummy")

    fake_segments = [
        _FakeSeg(0.0, 1.0, " hello"),
        _FakeSeg(1.0, 2.0, " world"),
    ]
    fake_info = MagicMock()
    fake_info.language = "en"

    with patch("youtube_to_srt.transcriber.WhisperModel") as mock_model_cls:
        model = MagicMock()
        model.transcribe.return_value = (iter(fake_segments), fake_info)
        mock_model_cls.return_value = model

        backend = LocalWhisperBackend(model_name="small", language="en")
        segments = backend.transcribe(audio)

        mock_model_cls.assert_called_once()
        # 언어 인자 전달 확인
        _, kwargs = model.transcribe.call_args
        assert kwargs.get("language") == "en"

    assert [s.text for s in segments] == ["hello", "world"]
    assert segments[0].start == 0.0
    assert segments[1].end == 2.0


def test_local_whisper_backend_caches_model(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"dummy")

    fake_info = MagicMock()
    fake_info.language = "en"

    with patch("youtube_to_srt.transcriber.WhisperModel") as mock_model_cls:
        model = MagicMock()
        model.transcribe.return_value = (iter([]), fake_info)
        mock_model_cls.return_value = model

        backend = LocalWhisperBackend(model_name="small", language="en")
        backend.transcribe(audio)
        backend.transcribe(audio)

        # 모델은 한 번만 로드되어야 한다
        assert mock_model_cls.call_count == 1
        assert model.transcribe.call_count == 2
