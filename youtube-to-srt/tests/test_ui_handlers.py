"""UI 핸들러 단위 테스트 — Gradio 위젯 바인딩 없이 순수 함수만 검증."""
from __future__ import annotations

from pathlib import Path

import pytest

from youtube_to_srt.core import Mode
from youtube_to_srt.pipeline import BatchReport, JobResult
from youtube_to_srt.ui_handlers import (
    collect_download_paths,
    format_status_rows,
    handle_submit,
)


# ---------- format_status_rows ----------


def test_format_status_rows_empty():
    assert format_status_rows([]) == []


def test_format_status_rows_pending_only():
    # pending = ok/fail 이 아직 안 붙은 placeholder (url + "pending" 상태)
    rows = format_status_rows(
        [
            {"url": "https://youtu.be/a", "status": "pending", "message": ""},
            {"url": "https://youtu.be/b", "status": "pending", "message": ""},
        ]
    )
    assert rows == [
        ["1", "https://youtu.be/a", "pending", ""],
        ["2", "https://youtu.be/b", "pending", ""],
    ]


def test_format_status_rows_mixed_from_jobresults():
    results: list[JobResult] = [
        JobResult(url="https://youtu.be/a", ok=True, audio_path=Path("audio/a.m4a")),
        JobResult(url="https://youtu.be/b", ok=False, message="network down"),
    ]
    rows = format_status_rows(results)
    assert rows == [
        ["1", "https://youtu.be/a", "OK", ""],
        ["2", "https://youtu.be/b", "FAIL", "network down"],
    ]


# ---------- collect_download_paths ----------


def _make_report(*jobs: JobResult) -> BatchReport:
    return BatchReport(results=list(jobs))


def test_collect_download_paths_extract_returns_audio_only(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"x")
    report = _make_report(
        JobResult(url="u1", ok=True, audio_path=audio, srt_path=None),
    )
    assert collect_download_paths(report, Mode.EXTRACT) == [str(audio)]


def test_collect_download_paths_transcribe_returns_srt_only(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"x")
    srt = tmp_path / "a.srt"
    srt.write_text("1\n")
    report = _make_report(
        JobResult(url="u1", ok=True, audio_path=audio, srt_path=srt),
    )
    assert collect_download_paths(report, Mode.TRANSCRIBE) == [str(srt)]


def test_collect_download_paths_all_returns_both(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"x")
    srt = tmp_path / "a.srt"
    srt.write_text("1\n")
    report = _make_report(
        JobResult(url="u1", ok=True, audio_path=audio, srt_path=srt),
    )
    paths = collect_download_paths(report, Mode.ALL)
    assert set(paths) == {str(audio), str(srt)}


def test_collect_download_paths_skips_failed(tmp_path: Path):
    audio = tmp_path / "a.m4a"
    audio.write_bytes(b"x")
    report = _make_report(
        JobResult(url="u1", ok=True, audio_path=audio),
        JobResult(url="u2", ok=False, message="boom"),
    )
    assert collect_download_paths(report, Mode.EXTRACT) == [str(audio)]


def test_collect_download_paths_skips_missing_files(tmp_path: Path):
    # 파일이 디스크에 실제로 없으면 내려주지 않는다
    phantom = tmp_path / "ghost.m4a"
    report = _make_report(JobResult(url="u1", ok=True, audio_path=phantom))
    assert collect_download_paths(report, Mode.EXTRACT) == []


# ---------- handle_submit (generator) ----------


class _FakeExtractor:
    def __init__(self, tmp_path: Path, fail_for: set[str] | None = None):
        self._tmp = tmp_path
        self._fail = fail_for or set()

    def extract(self, url: str):
        from youtube_to_srt.extractor import ExtractionError, ExtractionResult

        if url in self._fail:
            raise ExtractionError(f"boom {url}")
        vid = url.rsplit("/", 1)[-1]
        p = self._tmp / "audio" / f"{vid}.m4a"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(b"dummy")
        return ExtractionResult(video_id=vid, title=f"t-{vid}", audio_path=p)


def test_handle_submit_empty_input_raises():
    fake_ex = _FakeExtractor(Path("/tmp"))
    with pytest.raises(ValueError):
        list(
            handle_submit(
                urls_text="",
                mode_value="extract",
                audio_dir="audio",
                srt_dir="srt",
                extractor=fake_ex,
                transcribe_fn=lambda a, s: s,
            )
        )


def test_handle_submit_too_many_urls_raises(tmp_path: Path):
    urls = "\n".join(f"https://youtu.be/id{i}" for i in range(11))
    with pytest.raises(ValueError):
        list(
            handle_submit(
                urls_text=urls,
                mode_value="extract",
                audio_dir=str(tmp_path / "audio"),
                srt_dir=str(tmp_path / "srt"),
                extractor=_FakeExtractor(tmp_path),
                transcribe_fn=lambda a, s: s,
            )
        )


def test_handle_submit_yields_initial_pending_then_progress(tmp_path: Path):
    fake_ex = _FakeExtractor(tmp_path)
    urls = "https://youtu.be/a\nhttps://youtu.be/b"

    gen = handle_submit(
        urls_text=urls,
        mode_value="extract",
        audio_dir=str(tmp_path / "audio"),
        srt_dir=str(tmp_path / "srt"),
        extractor=fake_ex,
        transcribe_fn=lambda a, s: s,
    )

    updates = list(gen)

    # 초기 pending + 각 작업당 1개 + 최종 = 최소 4개 이상
    assert len(updates) >= 4

    # 첫 번째 yield: 모두 pending, 파일 목록 비어 있음
    first = updates[0]
    assert first.rows == [
        ["1", "https://youtu.be/a", "pending", ""],
        ["2", "https://youtu.be/b", "pending", ""],
    ]
    assert first.files == []
    assert first.running is True

    # 마지막 yield: 모두 OK, 파일 2개, 실행 종료 상태
    last = updates[-1]
    assert [r[2] for r in last.rows] == ["OK", "OK"]
    assert len(last.files) == 2
    assert last.running is False


def test_handle_submit_handles_failure_and_continues(tmp_path: Path):
    fake_ex = _FakeExtractor(tmp_path, fail_for={"https://youtu.be/bad"})
    urls = "https://youtu.be/good\nhttps://youtu.be/bad\nhttps://youtu.be/good2"

    gen = handle_submit(
        urls_text=urls,
        mode_value="extract",
        audio_dir=str(tmp_path / "audio"),
        srt_dir=str(tmp_path / "srt"),
        extractor=fake_ex,
        transcribe_fn=lambda a, s: s,
    )
    updates = list(gen)
    last = updates[-1]

    assert [r[2] for r in last.rows] == ["OK", "FAIL", "OK"]
    assert last.rows[1][3].startswith("boom")
    # 실패 건은 파일 목록에서 제외
    assert len(last.files) == 2
    assert last.running is False
