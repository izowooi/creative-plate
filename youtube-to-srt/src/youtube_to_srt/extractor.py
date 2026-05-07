"""yt-dlp 기반 오디오 추출."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from yt_dlp import YoutubeDL


class ExtractionError(RuntimeError):
    pass


@dataclass
class ExtractionResult:
    video_id: str
    title: str
    audio_path: Path


class AudioExtractor:
    """YouTube URL을 받아 오디오 파일을 ``audio_dir`` 에 저장한다.

    파일명은 ``<video_id>.m4a`` 형태. 이미 파일이 존재하면 다시 받지 않는다.
    """

    def __init__(self, audio_dir: Path):
        self.audio_dir = Path(audio_dir)

    def _existing_file(self, video_id: str) -> Path | None:
        for ext in ("m4a", "webm", "mp3", "opus"):
            candidate = self.audio_dir / f"{video_id}.{ext}"
            if candidate.exists():
                return candidate
        return None

    def extract(self, url: str) -> ExtractionResult:
        self.audio_dir.mkdir(parents=True, exist_ok=True)

        # 1) 메타데이터만 먼저 조회해 video_id 를 얻는다 (이미 있으면 skip)
        meta_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        try:
            with YoutubeDL(meta_opts) as ydl:
                info = ydl.extract_info(url, download=False)
        except Exception as exc:
            raise ExtractionError(f"메타데이터 조회 실패: {url} ({exc})") from exc

        video_id = info.get("id") or ""
        title = info.get("title") or video_id
        if not video_id:
            raise ExtractionError(f"video id를 확인할 수 없습니다: {url}")

        existing = self._existing_file(video_id)
        if existing is not None:
            return ExtractionResult(video_id=video_id, title=title, audio_path=existing)

        # 2) 실제 다운로드 — m4a 우선, 없으면 bestaudio 로 떨어진다
        outtmpl = str(self.audio_dir / "%(id)s.%(ext)s")
        download_opts = {
            "quiet": True,
            "no_warnings": True,
            "format": "bestaudio[ext=m4a]/bestaudio/best",
            "outtmpl": outtmpl,
            # 재인코딩 없이 원본 컨테이너로 저장
        }
        try:
            with YoutubeDL(download_opts) as ydl:
                ydl.extract_info(url, download=True)
        except Exception as exc:
            raise ExtractionError(f"다운로드 실패: {url} ({exc})") from exc

        saved = self._existing_file(video_id)
        if saved is None:
            raise ExtractionError(
                f"다운로드 후 파일을 찾을 수 없습니다: {self.audio_dir}/{video_id}.*"
            )
        return ExtractionResult(video_id=video_id, title=title, audio_path=saved)
