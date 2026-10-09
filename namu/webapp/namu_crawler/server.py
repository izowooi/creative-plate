"""로컬 웹앱. `python -m namu_crawler.server` 로 실행한다."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from urllib.parse import quote

from flask import Flask, Response, abort, jsonify, request, send_from_directory

from . import export
from .crawler import CrawlResult, Crawler, follow_targets
from .fetch import DEFAULT_ORDER, Fetcher
from .targets import Target, parse_targets

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / "cache"
_FORMATS = {"html": "text/html", "md": "text/markdown", "json": "application/json"}
_ASSET_TYPES = {"woff2": "font/woff2", "woff": "font/woff", "ttf": "font/ttf", "otf": "font/otf",
                "eot": "application/vnd.ms-fontobject", "svg": "image/svg+xml"}
# 위키 콘텐츠는 신뢰하지 않는다: 스크립트·폼·프레임을 막고 문서 자체를 sandbox 로 격리한다
_DOC_CSP = ("default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https: 'self'; "
            "font-src 'self' https: data:; sandbox allow-popups allow-popups-to-escape-sandbox; base-uri 'none'")


def create_app(crawler: Crawler) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.json.ensure_ascii = False
    fetcher = crawler.fetcher

    @app.before_request
    def guard_host():
        # 로컬 서버를 외부 웹페이지가 DNS rebinding 으로 호출하지 못하게 한다
        host = (request.host or "").rsplit(":", 1)[0].strip("[]")
        if host not in ("127.0.0.1", "localhost", "::1"):
            abort(403)
        if request.method == "POST" and not request.is_json:
            abort(415)

    @app.get("/")
    def index():
        return send_from_directory(STATIC_DIR, "index.html")

    @app.get("/static/<path:name>")
    def static_files(name: str):
        return send_from_directory(STATIC_DIR, name)

    @app.post("/api/parse")
    def parse():
        targets, errors = parse_targets((request.get_json(silent=True) or {}).get("text", ""))
        return jsonify(targets=[{"title": t.title, "url": t.url} for t in targets],
                       errors=[{"entry": e, "message": m} for e, m in errors])

    @app.post("/api/crawl/one")
    def crawl_one():
        body = request.get_json(silent=True) or {}
        title = (body.get("title") or "").strip()
        if not title:
            abort(400)
        if body.get("cache_only"):  # 이전 수집 기록을 네트워크 없이 다시 열 때
            result = crawler.load(fetcher.key(title))
            if result is None:
                abort(404)
        else:
            result = crawler.crawl(Target(title, title), refresh=bool(body.get("refresh")))
        return jsonify(summarize(result))

    @app.post("/api/follow")
    def follow():
        body = request.get_json(silent=True) or {}
        scope = body.get("scope", "subdocs")
        if scope not in ("subdocs", "links"):
            abort(400)
        result = crawler.load(str(body.get("key", "")))
        if result is None:
            abort(404)
        return jsonify(targets=[{"title": t.title, "url": t.url} for t in follow_targets(result, scope)])

    @app.get("/api/history")
    def history():
        return jsonify(items=fetcher.list_cached(limit=100))

    @app.get("/doc/<key>")
    def doc(key: str):
        result = crawler.load(key)
        if result is None:
            abort(404)
        html = export.render_page(result, css_href=lambda k: f"/css/{k}.css")
        return Response(html, mimetype="text/html", headers={"Content-Security-Policy": _DOC_CSP})

    @app.get("/css/<key>.css")
    def css(key: str):
        text = fetcher.web_css(key)
        if text is None:
            abort(404)
        return Response(text, mimetype="text/css", headers={"Cache-Control": "public, max-age=31536000, immutable"})

    @app.get("/asset/<path:rel>")
    def asset(rel: str):
        # 폰트는 나무위키가 CORS 를 허용하지 않아, sandbox(origin null) 문서가 쓰려면 여기서 대신 내려줘야 한다
        data = fetcher.fetch_asset(rel)
        if data is None:
            abort(404)
        return Response(data, mimetype=_ASSET_TYPES[rel.rsplit(".", 1)[-1]], headers={
            "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=31536000, immutable"})

    @app.get("/api/export/<key>.<fmt>")
    def export_one(key: str, fmt: str):
        if fmt not in _FORMATS:
            abort(404)
        result = crawler.load(key)
        if result is None:
            abort(404)
        body = export.render_one(result, fmt, fetcher.export_css)
        filename = f"{export.safe_filename(result.doc.title if result.doc else result.title)}.{fmt}"
        disposition = "inline" if request.args.get("inline") else "attachment"
        return Response(body, mimetype=f"{_FORMATS[fmt]}; charset=utf-8", headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            "Content-Security-Policy": _DOC_CSP,
        })

    @app.post("/api/export.zip")
    def export_zip():
        body = request.get_json(silent=True) or {}
        fmt = body.get("format", "html")
        if fmt not in _FORMATS:
            abort(400)
        results = [r for r in (crawler.load(str(k)) for k in body.get("keys", [])) if r]
        if not results:
            abort(404)
        data = export.build_zip(results, fmt, fetcher.export_css)
        return Response(data, mimetype="application/zip", headers={
            "Content-Disposition": f"attachment; filename=namu-{fmt}.zip"})

    return app


def summarize(result: CrawlResult) -> dict:
    data = {"key": result.key, "title": result.title, "status": result.status, "error": result.error,
            "elapsed": round(result.elapsed, 1)}
    if result.page:
        data.update(via=result.page.via, note=result.page.note, cached=result.page.cached,
                    fetched_at=export.kst(result.page.fetched_at))
    if result.doc:
        d = result.doc
        data["doc"] = {
            "title": d.title, "url": d.url, "last_modified": d.last_modified,
            "redirected_from": result.redirected_from,
            "sections": [{"level": s.level, "number": s.number, "title": s.title, "anchor": s.anchor}
                         for s in d.sections],
            "counts": {"links": len(d.links), "images": len(d.images), "categories": len(d.categories),
                       "sections": len(d.sections), "chars": len(d.html)},
        }
    return data


def build_fetcher(args: argparse.Namespace) -> Fetcher:
    order = tuple(t for t in DEFAULT_ORDER if t not in (args.skip or []))
    return Fetcher(args.cache_dir, min_interval=args.interval, ttl=args.ttl * 3600, order=order,
                   headed=args.headed)


def add_fetch_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE_DIR, help="캐시 폴더 (기본: webapp/cache)")
    parser.add_argument("--interval", type=float, default=3.0, help="나무위키 요청 사이 최소 간격(초)")
    parser.add_argument("--ttl", type=float, default=24.0, help="캐시 유효 시간(시간)")
    parser.add_argument("--skip", action="append", choices=DEFAULT_ORDER, metavar="METHOD",
                        help=f"쓰지 않을 수집 방법 ({', '.join(DEFAULT_ORDER)}), 여러 번 지정 가능")
    parser.add_argument("--headed", action="store_true",
                        help="playwright 를 창이 보이는 모드로 실행(챌린지를 직접 풀 수 있음)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="나무위키 크롤러 웹앱")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    add_fetch_arguments(parser)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.setrecursionlimit(5000)  # 나무위키 표는 중첩이 깊다
    app = create_app(Crawler(build_fetcher(args)))
    print(f"http://{args.host}:{args.port}  (cache: {args.cache_dir})")
    app.run(host=args.host, port=args.port, threaded=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
