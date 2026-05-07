"""실제 YouTube URL을 사용한 통합 테스트.

기본 pytest 실행에서는 `-m 'not integration'` 으로 비활성.
실행하려면:  uv run pytest -m integration
"""
from __future__ import annotations

from pathlib import Path

import pytest

from youtube_to_srt.extractor import AudioExtractor
from youtube_to_srt.transcriber import LocalWhisperBackend, transcribe_to_srt

# 최초의 YouTube 영상 "Me at the zoo" — 약 18초, 영어
SHORT_EN_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw"
EXPECTED_ID = "jNQXAC9IVRw"


@pytest.mark.integration
def test_extract_short_english_video(tmp_path: Path):
    extractor = AudioExtractor(audio_dir=tmp_path / "audio")
    result = extractor.extract(SHORT_EN_URL)

    assert result.video_id == EXPECTED_ID
    assert result.audio_path.exists()
    assert result.audio_path.stat().st_size > 1024  # 1KB 이상
    assert result.audio_path.suffix in {".m4a", ".webm", ".mp3", ".opus"}


@pytest.mark.integration
def test_extract_is_idempotent(tmp_path: Path):
    extractor = AudioExtractor(audio_dir=tmp_path / "audio")
    first = extractor.extract(SHORT_EN_URL)
    mtime1 = first.audio_path.stat().st_mtime
    second = extractor.extract(SHORT_EN_URL)
    mtime2 = second.audio_path.stat().st_mtime

    assert first.audio_path == second.audio_path
    assert mtime1 == mtime2  # 재다운로드되지 않음


@pytest.mark.integration
def test_extract_then_transcribe_produces_srt(tmp_path: Path):
    audio_dir = tmp_path / "audio"
    srt_dir = tmp_path / "srt"

    extractor = AudioExtractor(audio_dir=audio_dir)
    ext_result = extractor.extract(SHORT_EN_URL)

    backend = LocalWhisperBackend(model_name="small", language="en")
    srt_path = srt_dir / f"{ext_result.video_id}.srt"
    transcribe_to_srt(ext_result.audio_path, srt_path, backend=backend)

    assert srt_path.exists()
    content = srt_path.read_text()
    # SRT 포맷 헤더 확인
    assert "1\n" in content
    assert "-->" in content
    # "Me at the zoo" 영상에는 'elephant' 또는 'trunks' 단어가 나옴
    lowered = content.lower()
    assert any(word in lowered for word in ("elephant", "trunk", "zoo", "really"))
