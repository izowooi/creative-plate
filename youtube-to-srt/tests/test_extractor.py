"""오디오 추출기 단위 테스트 (yt-dlp 모킹)."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from youtube_to_srt.extractor import AudioExtractor, ExtractionError


def _fake_info(video_id: str = "abc123", title: str = "Sample Video") -> dict:
    return {
        "id": video_id,
        "title": title,
        "ext": "m4a",
    }


def test_extract_creates_output_directory(tmp_path: Path):
    extractor = AudioExtractor(audio_dir=tmp_path / "audio")
    assert not (tmp_path / "audio").exists()

    with patch("youtube_to_srt.extractor.YoutubeDL") as mock_ydl_cls:
        ydl = MagicMock()
        info = _fake_info()
        ydl.extract_info.return_value = info
        ydl.prepare_filename.return_value = str(tmp_path / "audio" / "abc123.m4a")
        mock_ydl_cls.return_value.__enter__.return_value = ydl

        # 모킹된 yt-dlp가 파일을 생성했다고 가정하기 위해 실제로 파일을 만들어둔다
        def _create_file(*_args, **_kwargs):
            out = tmp_path / "audio" / "abc123.m4a"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(b"fake audio")
            return info

        ydl.extract_info.side_effect = _create_file

        result = extractor.extract("https://youtu.be/abc123")

    assert (tmp_path / "audio").is_dir()
    assert result.audio_path.exists()
    assert result.video_id == "abc123"
    assert result.title == "Sample Video"


def test_extract_skips_if_already_exists(tmp_path: Path):
    audio_dir = tmp_path / "audio"
    audio_dir.mkdir()
    existing = audio_dir / "abc123.m4a"
    existing.write_bytes(b"already downloaded")

    extractor = AudioExtractor(audio_dir=audio_dir)

    with patch("youtube_to_srt.extractor.YoutubeDL") as mock_ydl_cls:
        ydl = MagicMock()
        ydl.extract_info.return_value = _fake_info()
        mock_ydl_cls.return_value.__enter__.return_value = ydl

        result = extractor.extract("https://youtu.be/abc123")

        # 이미 존재하므로 extract_info(..., download=...) 가 download=False 로 호출되거나
        # 아예 다운로드 인자 없이 메타만 가져와야 한다.
        # 구현에서는 `download=False` 로 한 번 호출해 메타만 확인.
        assert ydl.extract_info.called
        call_kwargs = ydl.extract_info.call_args.kwargs
        assert call_kwargs.get("download") is False

    assert result.audio_path == existing
    assert existing.read_bytes() == b"already downloaded"


def test_extract_raises_on_ydl_error(tmp_path: Path):
    extractor = AudioExtractor(audio_dir=tmp_path / "audio")

    with patch("youtube_to_srt.extractor.YoutubeDL") as mock_ydl_cls:
        ydl = MagicMock()
        ydl.extract_info.side_effect = Exception("network down")
        mock_ydl_cls.return_value.__enter__.return_value = ydl

        with pytest.raises(ExtractionError):
            extractor.extract("https://youtu.be/abc123")
