"""CLI 진입점 및 인자 파싱."""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

from youtube_to_srt.core import MAX_URLS, Mode, parse_urls_text

__all__ = ["MAX_URLS", "Mode", "parse_args", "main"]


@dataclass
class Args:
    urls: list[str]
    mode: Mode
    audio_dir: Path
    srt_dir: Path
    model: str
    language: str


def _read_urls_file(path: Path) -> list[str]:
    # parse_urls_text가 0개일 때 ValueError를 던지지만,
    # 여기서는 파일이 비어 있어도 CLI 인자와 합쳐 total 검사하므로 빈 리스트 허용.
    urls: list[str] = []
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line)
    return urls


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="youtube-to-srt",
        description=(
            "YouTube URL(최대 10개)을 받아 오디오를 추출하거나 SRT 자막을 생성합니다. "
            "기본 동작은 오디오 추출(extract)입니다."
        ),
    )
    parser.add_argument(
        "urls",
        nargs="*",
        help="유튜브 URL들 (transcribe 모드에서는 오디오 파일 경로)",
    )
    parser.add_argument(
        "--urls-file",
        type=Path,
        help="한 줄에 하나씩 URL이 적힌 텍스트 파일. 빈 줄과 '#' 주석은 무시됩니다.",
    )
    parser.add_argument(
        "--mode",
        choices=[m.value for m in Mode],
        default=Mode.EXTRACT.value,
        help="extract: 음성 추출만 | transcribe: 음성→SRT만 | all: 둘 다",
    )
    parser.add_argument(
        "--audio-dir",
        type=Path,
        default=Path("audio"),
        help="추출된 오디오 저장 폴더 (기본: audio/)",
    )
    parser.add_argument(
        "--srt-dir",
        type=Path,
        default=Path("srt"),
        help="생성된 SRT 저장 폴더 (기본: srt/)",
    )
    parser.add_argument(
        "--model",
        default="small",
        help="faster-whisper 모델 이름 (기본: small)",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="전사 언어 코드 (기본: en)",
    )
    return parser


def parse_args(argv: list[str]) -> Args:
    parser = _build_parser()
    ns = parser.parse_args(argv)

    urls: list[str] = []
    if ns.urls_file:
        urls.extend(_read_urls_file(ns.urls_file))
    urls.extend(ns.urls)

    if not urls:
        parser.error("URL이 하나도 제공되지 않았습니다. 인자로 넘기거나 --urls-file을 사용하세요.")
    if len(urls) > MAX_URLS:
        parser.error(f"URL 개수는 최대 {MAX_URLS}개까지 허용됩니다 (받은 개수: {len(urls)}).")

    return Args(
        urls=urls,
        mode=Mode(ns.mode),
        audio_dir=ns.audio_dir,
        srt_dir=ns.srt_dir,
        model=ns.model,
        language=ns.language,
    )


# parse_urls_text 재노출 (UI·테스트에서 일관된 import 지점 제공)
__all__.append("parse_urls_text")
_ = parse_urls_text  # 참조 유지


def main(argv: list[str] | None = None) -> int:
    from youtube_to_srt.extractor import AudioExtractor
    from youtube_to_srt.pipeline import run_batch
    from youtube_to_srt.transcriber import LocalWhisperBackend, make_transcribe_fn

    args = parse_args(list(sys.argv[1:] if argv is None else argv))

    extractor = AudioExtractor(audio_dir=args.audio_dir)
    backend = LocalWhisperBackend(model_name=args.model, language=args.language)
    transcribe_fn = make_transcribe_fn(backend)

    report = run_batch(
        urls=args.urls,
        mode=args.mode,
        extractor=extractor,
        transcribe_fn=transcribe_fn,
        srt_dir=args.srt_dir,
    )

    print(
        f"\n완료: 성공 {report.success_count} / 실패 {report.failure_count}",
        file=sys.stderr,
    )
    for r in report.results:
        status = "OK" if r.ok else "FAIL"
        detail = r.message or ""
        print(f"  [{status}] {r.url} {detail}", file=sys.stderr)

    return 0 if report.failure_count == 0 else 1
