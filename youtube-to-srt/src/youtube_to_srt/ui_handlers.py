"""Gradio UI에서 사용하는 순수 핸들러 함수들.

`gradio` 모듈에 의존하지 않아 단위 테스트가 가능하다.
`ui.py`가 이 함수들을 Gradio 위젯 이벤트에 바인딩한다.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator

from youtube_to_srt.core import Mode, parse_urls_text
from youtube_to_srt.pipeline import BatchReport, JobResult, iter_batch


StatusRow = list[str]  # ["#", "URL", "상태", "메시지"]


@dataclass
class SubmitUpdate:
    """handle_submit가 yield하는 단일 스냅샷."""

    rows: list[StatusRow]
    files: list[str]
    running: bool
    progress: tuple[int, int]  # (완료, 전체)
    message: str = ""


def format_status_rows(items: list[Any]) -> list[StatusRow]:
    """JobResult 또는 {"url","status","message"} dict 리스트를 테이블 행으로 변환."""
    rows: list[StatusRow] = []
    for idx, item in enumerate(items, start=1):
        if isinstance(item, JobResult):
            status = "OK" if item.ok else "FAIL"
            rows.append([str(idx), item.url, status, item.message])
        elif isinstance(item, dict):
            rows.append(
                [
                    str(idx),
                    str(item.get("url", "")),
                    str(item.get("status", "")),
                    str(item.get("message", "")),
                ]
            )
        else:  # pragma: no cover
            raise TypeError(f"지원하지 않는 행 타입: {type(item).__name__}")
    return rows


def collect_download_paths(report: BatchReport, mode: Mode) -> list[str]:
    """배치 결과에서 다운로드용 파일 경로 리스트를 생성한다.

    - extract: audio 파일만
    - transcribe: srt 파일만
    - all: 둘 다
    - 실패 건, 존재하지 않는 파일은 제외
    """
    paths: list[str] = []
    for r in report.results:
        if not r.ok:
            continue
        if mode in (Mode.EXTRACT, Mode.ALL) and r.audio_path and r.audio_path.exists():
            paths.append(str(r.audio_path))
        if mode in (Mode.TRANSCRIBE, Mode.ALL) and r.srt_path and r.srt_path.exists():
            paths.append(str(r.srt_path))
    return paths


def _pending_row(idx: int, url: str) -> StatusRow:
    return [str(idx), url, "pending", ""]


def handle_submit(
    *,
    urls_text: str,
    mode_value: str,
    audio_dir: str,
    srt_dir: str,
    extractor: Any,
    transcribe_fn: Callable[[Path, Path], Path],
) -> Iterator[SubmitUpdate]:
    """제출 핸들러 제너레이터.

    yield 순서:
      1. 파싱 직후 모든 URL이 pending 상태인 초기 스냅샷 (running=True)
      2. 각 URL 처리 완료 시마다 갱신 스냅샷
      3. 최종 스냅샷 (running=False, files 채움)
    """
    mode = Mode(mode_value)
    urls = parse_urls_text(urls_text)  # 0개/초과 시 ValueError
    total = len(urls)

    # 1) 초기 pending
    yield SubmitUpdate(
        rows=[_pending_row(i, u) for i, u in enumerate(urls, start=1)],
        files=[],
        running=True,
        progress=(0, total),
    )

    # 2) 진행 업데이트
    report = BatchReport()
    for idx, result in enumerate(
        iter_batch(
            urls=urls,
            mode=mode,
            extractor=extractor,
            transcribe_fn=transcribe_fn,
            srt_dir=Path(srt_dir),
        ),
        start=1,
    ):
        report.results.append(result)
        done_rows = format_status_rows(report.results)
        remaining_rows = [
            _pending_row(idx + k + 1, u)
            for k, u in enumerate(urls[idx:])
        ]
        yield SubmitUpdate(
            rows=done_rows + remaining_rows,
            files=[],
            running=True,
            progress=(idx, total),
        )

    # 3) 최종 스냅샷
    yield SubmitUpdate(
        rows=format_status_rows(report.results),
        files=collect_download_paths(report, mode),
        running=False,
        progress=(total, total),
        message=f"완료: 성공 {report.success_count} / 실패 {report.failure_count}",
    )
