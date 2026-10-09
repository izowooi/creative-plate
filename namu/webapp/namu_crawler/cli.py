"""명령줄 크롤러. `python -m namu_crawler.cli <URL 또는 문서명> ...`"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from . import export
from .crawler import Crawler, CrawlResult
from .fetch import Fetcher
from .server import add_fetch_arguments, build_fetcher
from .targets import parse_targets

DEFAULT_OUTPUT_DIR = Path("output")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="나무위키 문서를 수집해 HTML/Markdown/JSON 으로 저장한다.")
    parser.add_argument("targets", nargs="*", help="문서 URL 또는 문서명")
    parser.add_argument("-f", "--file", help="한 줄에 하나씩 적은 목록 파일 (- 이면 표준 입력)")
    parser.add_argument("-o", "--out", type=Path, default=DEFAULT_OUTPUT_DIR, help="저장 폴더 (기본: ./output)")
    parser.add_argument("--format", default="html,md", help="저장 형식, 쉼표로 구분: html,md,json (기본: html,md)")
    parser.add_argument("--refresh", action="store_true", help="캐시를 무시하고 새로 받기")
    parser.add_argument("--follow", choices=("subdocs", "links"),
                        help="수집한 문서의 링크를 따라가기: subdocs=하위 문서만, links=본문 링크 전체")
    parser.add_argument("--depth", type=int, default=1, help="링크를 따라갈 단계 수 (기본 1)")
    parser.add_argument("--limit", type=int, default=50, help="수집할 문서 수 상한 (기본 50)")
    add_fetch_arguments(parser)
    args = parser.parse_args(argv)

    formats = [f.strip() for f in args.format.split(",") if f.strip()]
    if not formats or any(f not in ("html", "md", "json") for f in formats):
        parser.error("--format 은 html, md, json 중에서 쉼표로 고르세요")

    text = "\n".join(args.targets)
    if args.file:
        text += "\n" + (sys.stdin.read() if args.file == "-" else Path(args.file).read_text(encoding="utf-8"))
    targets, errors = parse_targets(text)
    for entry, message in errors:
        print(f"건너뜀: {entry} ({message})", file=sys.stderr)
    if not targets:
        parser.error("수집할 문서가 없습니다")

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    sys.setrecursionlimit(5000)
    fetcher = build_fetcher(args)
    crawler = Crawler(fetcher)
    args.out.mkdir(parents=True, exist_ok=True)

    def report(result: CrawlResult) -> None:
        label = {"ok": "완료", "not_found": "문서 없음", "error": "실패"}[result.status]
        via = f" ({'캐시' if result.page.cached else result.page.via}, {result.elapsed:.1f}s)" if result.page else ""
        print(f"[{len(done) + 1}] {result.title} … {label}{via}" + (f"\n    {result.error}" if result.error else ""),
              flush=True)
        done.append(result)
        if result.status == "ok":
            save(result, fetcher, args.out, formats)

    done: list[CrawlResult] = []
    crawler.crawl_many(targets, follow=args.follow, depth=args.depth, limit=args.limit,
                       refresh=args.refresh, on_result=report)

    index = [{"title": r.title, "status": r.status, "error": r.error, "url": r.doc.url if r.doc else None,
              "file": export.safe_filename(r.doc.title) if r.doc else None} for r in done]
    (args.out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(r.status == "ok" for r in done)
    print(f"\n{ok}/{len(done)}건 저장 → {args.out.resolve()}")
    return 1 if any(r.status == "error" for r in done) else 0


def save(result: CrawlResult, fetcher: Fetcher, out: Path, formats: list[str]) -> None:
    name = export.safe_filename(result.doc.title)
    for fmt in formats:
        (out / f"{name}.{fmt}").write_text(export.render_one(result, fmt, fetcher.export_css), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
