"""전사 백엔드 및 SRT 파일 기록."""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Protocol

from faster_whisper import WhisperModel

from youtube_to_srt.srt_formatter import Segment, format_srt


class TranscriptionError(RuntimeError):
    pass


class TranscriberBackend(Protocol):
    """전사 백엔드 인터페이스.

    구현체는 오디오 파일 경로를 받아 Segment 리스트를 반환한다.
    현재는 ``LocalWhisperBackend`` 만 존재하지만, 추후 OpenAI Whisper API
    백엔드를 같은 인터페이스로 추가할 수 있다.
    """

    def transcribe(self, audio_path: Path) -> list[Segment]: ...


class LocalWhisperBackend:
    """Mac mini 로컬에서 faster-whisper로 실행하는 백엔드."""

    def __init__(
        self,
        model_name: str = "small",
        language: str = "en",
        device: str = "auto",
        compute_type: str = "auto",
    ):
        self.model_name = model_name
        self.language = language
        self.device = device
        self.compute_type = compute_type
        self._model: WhisperModel | None = None

    def _get_model(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(
                self.model_name,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model

    def transcribe(self, audio_path: Path) -> list[Segment]:
        model = self._get_model()
        segments_iter, _info = model.transcribe(
            str(audio_path),
            language=self.language,
            vad_filter=True,
        )
        return [
            Segment(start=float(s.start), end=float(s.end), text=s.text.strip())
            for s in segments_iter
        ]


def transcribe_to_srt(
    audio_path: Path,
    srt_path: Path,
    *,
    backend: TranscriberBackend,
) -> Path:
    """오디오 파일을 전사하여 SRT 파일로 저장한다."""
    audio_path = Path(audio_path)
    srt_path = Path(srt_path)

    if not audio_path.exists():
        raise TranscriptionError(f"오디오 파일을 찾을 수 없습니다: {audio_path}")

    segments = backend.transcribe(audio_path)
    srt_path.parent.mkdir(parents=True, exist_ok=True)
    srt_path.write_text(format_srt(segments), encoding="utf-8")
    return srt_path


TranscribeFn = Callable[[Path, Path], Path]


def make_transcribe_fn(backend: TranscriberBackend) -> TranscribeFn:
    """백엔드를 감싸서 pipeline이 호출할 수 있는 (audio, srt) -> srt 함수를 만든다."""

    def _fn(audio_path: Path, srt_path: Path) -> Path:
        return transcribe_to_srt(audio_path, srt_path, backend=backend)

    return _fn
