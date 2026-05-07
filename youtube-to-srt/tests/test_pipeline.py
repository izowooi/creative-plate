"""배치 오케스트레이터 단위 테스트."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from unittest.mock import MagicMock

from youtube_to_srt.cli import Mode
from youtube_to_srt.extractor import ExtractionError, ExtractionResult
from youtube_to_srt.pipeline import run_batch


@dataclass
class _Job:
    url: str


def _make_extractor(tmp_path: Path, fail_for: set[str] | None = None):
    fail_for = fail_for or set()

    def extract(url: str) -> ExtractionResult:
        if url in fail_for:
            raise ExtractionError(f"boom {url}")
        vid = url.rsplit("/", 1)[-1]
        path = tmp_path / "audio" / f"{vid}.m4a"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"dummy")
        return ExtractionResult(video_id=vid, title=f"title {vid}", audio_path=path)

    ex = MagicMock()
    ex.extract.side_effect = extract
    return ex


def test_extract_mode_runs_extractor_only(tmp_path: Path):
    extractor = _make_extractor(tmp_path)
    transcribe = MagicMock()

    report = run_batch(
        urls=["https://youtu.be/a", "https://youtu.be/b"],
        mode=Mode.EXTRACT,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )

    assert extractor.extract.call_count == 2
    transcribe.assert_not_called()
    assert [r.ok for r in report.results] == [True, True]


def test_transcribe_mode_skips_extractor(tmp_path: Path):
    audio1 = tmp_path / "one.m4a"
    audio1.write_bytes(b"a")
    audio2 = tmp_path / "two.m4a"
    audio2.write_bytes(b"b")

    extractor = MagicMock()
    transcribe = MagicMock()

    run_batch(
        urls=[str(audio1), str(audio2)],
        mode=Mode.TRANSCRIBE,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )

    extractor.extract.assert_not_called()
    assert transcribe.call_count == 2
    for call in transcribe.call_args_list:
        audio_arg, srt_arg = call.args
        assert audio_arg.exists()
        assert srt_arg.parent == tmp_path / "srt"


def test_all_mode_runs_both(tmp_path: Path):
    extractor = _make_extractor(tmp_path)
    transcribe = MagicMock()

    run_batch(
        urls=["https://youtu.be/a"],
        mode=Mode.ALL,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )

    extractor.extract.assert_called_once()
    transcribe.assert_called_once()
    audio_arg, srt_arg = transcribe.call_args.args
    assert audio_arg.name == "a.m4a"
    assert srt_arg == tmp_path / "srt" / "a.srt"


def test_failures_dont_stop_batch(tmp_path: Path):
    extractor = _make_extractor(tmp_path, fail_for={"https://youtu.be/bad"})
    transcribe = MagicMock()

    report = run_batch(
        urls=[
            "https://youtu.be/good1",
            "https://youtu.be/bad",
            "https://youtu.be/good2",
        ],
        mode=Mode.EXTRACT,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )

    assert [r.ok for r in report.results] == [True, False, True]
    assert report.success_count == 2
    assert report.failure_count == 1


def test_on_progress_called_per_job(tmp_path: Path):
    extractor = _make_extractor(tmp_path, fail_for={"https://youtu.be/bad"})
    transcribe = MagicMock()

    events: list[tuple[int, int, bool, str]] = []

    def on_progress(index: int, total: int, result) -> None:
        events.append((index, total, result.ok, result.url))

    run_batch(
        urls=["https://youtu.be/good", "https://youtu.be/bad", "https://youtu.be/good2"],
        mode=Mode.EXTRACT,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
        on_progress=on_progress,
    )

    # 각 작업이 끝날 때마다 호출, total은 항상 동일, index는 1부터 증가
    assert [e[0] for e in events] == [1, 2, 3]
    assert all(e[1] == 3 for e in events)
    assert [e[2] for e in events] == [True, False, True]
    assert [e[3] for e in events] == [
        "https://youtu.be/good",
        "https://youtu.be/bad",
        "https://youtu.be/good2",
    ]


def test_on_progress_optional_backward_compat(tmp_path: Path):
    # on_progress 미지정 시 기존 호출과 동일하게 동작해야 한다
    extractor = _make_extractor(tmp_path)
    transcribe = MagicMock()

    report = run_batch(
        urls=["https://youtu.be/a"],
        mode=Mode.EXTRACT,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )
    assert report.success_count == 1


def test_all_mode_skips_transcribe_when_extract_fails(tmp_path: Path):
    extractor = _make_extractor(tmp_path, fail_for={"https://youtu.be/bad"})
    transcribe = MagicMock()

    run_batch(
        urls=["https://youtu.be/bad", "https://youtu.be/good"],
        mode=Mode.ALL,
        extractor=extractor,
        transcribe_fn=transcribe,
        srt_dir=tmp_path / "srt",
    )

    # 실패한 URL은 전사 호출 안 함, 성공한 것만 호출
    assert transcribe.call_count == 1
