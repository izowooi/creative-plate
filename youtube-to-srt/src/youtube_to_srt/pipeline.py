"""배치 오케스트레이터."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterator, Protocol

from youtube_to_srt.core import Mode
from youtube_to_srt.extractor import ExtractionError, ExtractionResult


class _ExtractorLike(Protocol):
    def extract(self, url: str) -> ExtractionResult: ...


TranscribeFn = Callable[[Path, Path], Path]


@dataclass
class JobResult:
    url: str
    ok: bool
    audio_path: Path | None = None
    srt_path: Path | None = None
    message: str = ""


@dataclass
class BatchReport:
    results: list[JobResult] = field(default_factory=list)

    @property
    def success_count(self) -> int:
        return sum(1 for r in self.results if r.ok)

    @property
    def failure_count(self) -> int:
        return sum(1 for r in self.results if not r.ok)


ProgressFn = Callable[[int, int, JobResult], None]


def _srt_path_for(audio_path: Path, srt_dir: Path) -> Path:
    return srt_dir / (audio_path.stem + ".srt")


def _process_one(
    item: str,
    mode: Mode,
    extractor: _ExtractorLike,
    transcribe_fn: TranscribeFn,
    srt_dir: Path,
) -> JobResult:
    audio_path: Path | None = None
    srt_path: Path | None = None

    try:
        if mode in (Mode.EXTRACT, Mode.ALL):
            print(f"[extract] {item}", flush=True)
            result = extractor.extract(item)
            audio_path = result.audio_path
        else:  # Mode.TRANSCRIBE
            audio_path = Path(item)
            if not audio_path.exists():
                raise FileNotFoundError(f"오디오 파일 없음: {audio_path}")

        if mode in (Mode.TRANSCRIBE, Mode.ALL):
            assert audio_path is not None
            srt_path = _srt_path_for(audio_path, srt_dir)
            print(f"[transcribe] {audio_path} -> {srt_path}", flush=True)
            transcribe_fn(audio_path, srt_path)

        return JobResult(
            url=item,
            ok=True,
            audio_path=audio_path,
            srt_path=srt_path,
        )
    except (ExtractionError, FileNotFoundError, Exception) as exc:
        return JobResult(
            url=item,
            ok=False,
            audio_path=audio_path,
            srt_path=srt_path,
            message=str(exc),
        )


def iter_batch(
    *,
    urls: list[str],
    mode: Mode,
    extractor: _ExtractorLike,
    transcribe_fn: TranscribeFn,
    srt_dir: Path,
) -> Iterator[JobResult]:
    """각 URL을 순차 처리하며 JobResult를 하나씩 yield한다.

    UI에서 실시간 갱신을 위해 사용. 실패는 ok=False JobResult로 집계된다.
    """
    srt_dir = Path(srt_dir)
    for item in urls:
        yield _process_one(item, mode, extractor, transcribe_fn, srt_dir)


def run_batch(
    *,
    urls: list[str],
    mode: Mode,
    extractor: _ExtractorLike,
    transcribe_fn: TranscribeFn,
    srt_dir: Path,
    on_progress: ProgressFn | None = None,
) -> BatchReport:
    """URL 리스트를 순차 처리해 BatchReport 로 집계한다.

    `on_progress(index, total, result)` 는 각 작업 완료 직후 호출된다 (1-based index).
    """
    report = BatchReport()
    total = len(urls)

    for idx, result in enumerate(
        iter_batch(
            urls=urls,
            mode=mode,
            extractor=extractor,
            transcribe_fn=transcribe_fn,
            srt_dir=srt_dir,
        ),
        start=1,
    ):
        report.results.append(result)
        if on_progress is not None:
            on_progress(idx, total, result)

    return report
