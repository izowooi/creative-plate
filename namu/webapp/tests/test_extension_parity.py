"""확장(JS)과 웹앱(Python)이 같은 입력에서 같은 결과를 내는지 대조한다.

extension/lib 의 ES 모듈을 로컬 HTTP 로 서빙하고 Playwright(시스템 Chrome)에서 직접 호출한다.
Playwright 나 Chrome 이 없으면 건너뛴다.
"""
import functools
import http.server
import io
import threading
import time
import zipfile
from dataclasses import asdict
from pathlib import Path

import pytest

from conftest import fixture
from namu_crawler.crawler import CrawlResult
from namu_crawler.export import to_markdown
from namu_crawler.extract import extract_document
from namu_crawler.fetch import RawPage
from namu_crawler.targets import parse_targets, title_to_url

sync_api = pytest.importorskip("playwright.sync_api")
EXTENSION_DIR = Path(__file__).resolve().parents[2] / "extension"
FETCHED_AT = 1_790_000_000.0


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def page():
    handler = functools.partial(QuietHandler, directory=str(EXTENSION_DIR))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with sync_api.sync_playwright() as p:
        try:
            browser = p.chromium.launch(channel="chrome", headless=True)
        except Exception as e:  # Chrome 미설치
            server.shutdown()
            pytest.skip(f"Chrome 을 실행할 수 없음: {e}")
        pg = browser.new_page()
        pg.goto(f"http://127.0.0.1:{server.server_address[1]}/manifest.json")
        yield pg
        browser.close()
    server.shutdown()


def js(page, body, arg=None):
    return page.evaluate("async (arg) => {" + body + "}", arg)


def py_doc(name="article_full.html"):
    return extract_document(fixture(name), "https://namu.wiki/w/x")


def py_markdown(doc, title="전생검신"):
    result = CrawlResult("k", title, "ok", doc=doc,
                         page=RawPage(title, doc.url, 200, "", "curl_cffi", FETCHED_AT))
    return to_markdown(result)


def js_result(doc, title="전생검신"):
    return {"key": "k", "title": title, "status": "ok", "doc": doc, "elapsed": 0,
            "page": {"via": "curl_cffi", "note": "", "fetched_at": FETCHED_AT, "status": 200, "url": doc["url"]}}


# ---------- 입력 파서 ----------

TARGET_INPUTS = """
https://namu.wiki/w/%EC%A0%84%EC%83%9D%EA%B2%80%EC%8B%A0
https://namu.wiki/w/전생검신/등장인물?from=전검#개요
namu.wiki/w/전생검신
https://m.namu.wiki/w/C%23
리그 오브 레전드
C#
https://example.com/x
https://namu.wiki/RecentChanges
https://namu.wiki/w/가 https://namu.wiki/w/나
<https://namu.wiki/w/다>
"""


def test_parse_targets_matches_python(page):
    py_targets, py_errors = parse_targets(TARGET_INPUTS)
    got = js(page, "const m = await import('/lib/targets.js'); return m.parseTargets(arg);", TARGET_INPUTS)
    assert [t["title"] for t in got["targets"]] == [t.title for t in py_targets]
    assert [e["entry"] for e in got["errors"]] == [e for e, _ in py_errors]


@pytest.mark.parametrize("title", ["전생검신", "전생검신/등장인물", "C++", "우리말?", "분류:한국 웹소설", "A&B", "100%",
                                    "Hello World!", "it's", "a*b", "조아라(웹사이트)", "~틸다~"])
def test_title_to_url_matches_python(page, title):
    got = js(page, "const m = await import('/lib/targets.js'); return m.titleToUrl(arg);", title)
    assert got == title_to_url(title)


# ---------- 추출 ----------

def js_extract(page, name="article_full.html"):
    return js(page, """const m = await import('/lib/extract.js');
        return m.extractDocument(new DOMParser().parseFromString(arg.html, 'text/html'), arg.url);""",
              {"html": fixture(name), "url": "https://namu.wiki/w/x"})


@pytest.mark.parametrize("name", ["article_full.html", "article_minimal.html"])
def test_extracted_metadata_matches_python(page, name):
    py, got = asdict(py_doc(name)), js_extract(page, name)
    for field in ("title", "url", "last_modified", "stylesheets", "sections", "categories", "links", "images"):
        assert got[field] == py[field], field


@pytest.mark.parametrize("name", ["article_full.html", "article_minimal.html"])
def test_extracted_html_is_equivalent_to_python(page, name):
    summary = """
        const d = new DOMParser().parseFromString(arg, 'text/html');
        const count = (s) => d.querySelectorAll(s).length;
        return {text: d.body.textContent.replace(/\\s+/g, ' ').trim(),
          counts: ['a','img','table','tr','td','h2','h3','details','ul','li','blockquote','[data-namu]'].map(count),
          hrefs: [...d.querySelectorAll('a[href]')].map(a => a.getAttribute('href')),
          srcs: [...d.querySelectorAll('img[src]')].map(i => i.getAttribute('src'))};"""
    assert js(page, summary, py_doc(name).html) == js(page, summary, js_extract(page, name)["html"])


def test_class_names_are_not_used_for_detection_in_js(page):
    html = fixture("article_full.html")
    for cls in ("_6YZgjHNT", "uWoRuem8", "_9izjyxNu", "YujukE4J"):
        html = html.replace(cls, "ZZ" + cls[::-1])
    got = js(page, """const m = await import('/lib/extract.js');
        return m.extractDocument(new DOMParser().parseFromString(arg, 'text/html'), 'u');""", html)
    assert got["title"] == "전생검신" and len(got["sections"]) == 14


def test_both_main_detectors_agree_in_js(page):
    same = js(page, """const m = await import('/lib/extract.js');
        const d = new DOMParser().parseFromString(arg, 'text/html'); const h1 = d.querySelector('h1');
        return m.mainBetweenTitleAndLicense(d, h1) === m.mainFromAnchors(d, h1);""", fixture("article_full.html"))
    assert same is True


def test_js_sanitizes_scripts_and_dangerous_links(page):
    doc = js_extract(page, "article_minimal.html")
    for junk in ("alert", "onclick", "javascript:", "<script", "<noscript"):
        assert junk not in doc["html"]
    assert doc["images"] == ["https://i.namu.wiki/i/real.png"]


@pytest.mark.parametrize("status,name,expect", [
    (200, "article_full.html", None), (404, "not_found.html", "not_found"), (403, "blocked_cloudflare.html", "blocked"),
    (200, "blocked_cloudflare.html", "blocked"), (404, "article_full.html", "not_found"),
    (429, "article_full.html", "blocked"),
])
def test_check_response_matches_python(page, status, name, expect):
    got = js(page, """const m = await import('/lib/extract.js');
        try { m.checkResponse(arg.status, arg.html); return null; } catch (e) { return e.kind; }""",
             {"status": status, "html": fixture(name)})
    assert got == expect


def test_layout_error_when_no_license_or_h1(page):
    got = js(page, """const m = await import('/lib/extract.js');
        try { m.extractDocument(new DOMParser().parseFromString('<html><body><div>hi</div></body></html>', 'text/html'), 'u'); return null; }
        catch (e) { return e.kind; }""")
    assert got == "layout"


# ---------- Markdown ----------

@pytest.mark.parametrize("name,title", [("article_full.html", "전생검신"), ("article_minimal.html", "짧은문서")])
def test_markdown_port_matches_python_on_same_html(page, name, title):
    doc = py_doc(name)
    got = js(page, """const m = await import('/lib/markdown.js'); return m.toMarkdown(arg);""",
             js_result(asdict(doc), title))
    assert got == py_markdown(doc, title)


def test_markdown_end_to_end_matches_python(page):
    doc = js_extract(page)
    got = js(page, """const m = await import('/lib/markdown.js'); return m.toMarkdown(arg);""", js_result(doc))
    assert got == py_markdown(py_doc())


# ---------- ZIP ----------

def test_zip_is_valid_and_roundtrips(page):
    files = [{"name": "전생검신.md", "text": "# 전생검신\n" + "본문 " * 2000}, {"name": "빈 파일.txt", "text": ""},
             {"name": "a/b.json", "text": '{"k": "값"}'}]
    data = bytes(js(page, """const m = await import('/lib/zip.js');
        const blob = await m.buildZip(arg, new Date(2026, 9, 9, 12, 0, 0));
        return Array.from(new Uint8Array(await blob.arrayBuffer()));""", files))
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        assert zf.testzip() is None
        assert sorted(zf.namelist()) == sorted(f["name"] for f in files)
        for f in files:
            assert zf.read(f["name"]).decode("utf-8") == f["text"]


# ---------- 수집기 (가짜 fetch/저장소) ----------

CRAWLER_SETUP = """
const m = await import('/lib/crawler.js');
const mem = {};
const store = { get: async (k) => (typeof k === 'string' ? {[k]: mem[k]} : {}), set: async (o) => { Object.assign(mem, o); } };
const clockState = {t: 0}; const slept = [];
const sleep = async (ms) => { slept.push(ms); clockState.t += ms; };
const mkResponse = (status, text, headers = {}) => ({ status, ok: status >= 200 && status < 300, url: 'https://namu.wiki/w/x',
  headers: { get: (k) => headers[k] ?? null }, text: async () => text, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
"""


def run_crawler(page, scenario, arg=None):
    return js(page, CRAWLER_SETUP + scenario, arg)


def test_crawler_caches_and_uses_interval(page):
    got = run_crawler(page, """
        const calls = []; 
        const fetchImpl = async (url) => { calls.push(url); return url.endsWith('.css') ? mkResponse(200, 'body{margin:0}') : mkResponse(200, arg); };
        const c = new m.Crawler({store, fetchImpl, sleep, clock: () => clockState.t, minInterval: 3000, now: () => 1000});
        const a = await c.crawl('전생검신'); const b = await c.crawl('전생검신'); const r = await c.crawl('전생검신', {refresh: true});
        return {status: [a.status, b.status, r.status], cached: [!!a.page.cached, !!b.page.cached, !!r.page.cached],
                docCalls: calls.filter(u => u.includes('/w/')).length, sections: a.doc.sections.length, slept,
                history: (await c.history()).map(h => h.title)};
        """, fixture("article_full.html"))
    assert got["status"] == ["ok", "ok", "ok"] and got["cached"] == [False, True, False]
    assert got["docCalls"] == 2 and got["sections"] == 14 and got["history"] == ["전생검신"]
    assert sum(got["slept"]) >= 3000  # 두 번째 문서 요청은 직전 요청으로부터 최소 간격(3초)을 둔다


def test_crawler_backs_off_on_429_then_succeeds(page):
    got = run_crawler(page, """
        let n = 0;
        const fetchImpl = async (url) => url.endsWith('.css') ? mkResponse(200, 'x{}') : (++n <= 2 ? mkResponse(429, '', {'Retry-After': '0'}) : mkResponse(200, arg));
        const c = new m.Crawler({store, fetchImpl, sleep, clock: () => clockState.t, minInterval: 0, now: () => 1000});
        const r = await c.crawl('가'); return {status: r.status, attempts: n, slept};
        """, fixture("article_full.html"))
    assert got["status"] == "ok" and got["attempts"] == 3 and got["slept"][:2] == [2000, 4000]


def test_crawler_falls_back_to_tab_when_blocked(page):
    got = run_crawler(page, """
        const fetchImpl = async (url) => url.endsWith('.css') ? mkResponse(200, 'x{}') : mkResponse(403, arg.blocked);
        let tabCalls = 0;
        const tabFetch = async (url) => { tabCalls++; return {status: 200, html: arg.article, url}; };
        const c = new m.Crawler({store, fetchImpl, tabFetch, sleep, clock: () => clockState.t, minInterval: 0, retries: 0, now: () => 1000});
        const r = await c.crawl('가'); return {status: r.status, via: r.page.via, tabCalls};
        """, {"blocked": fixture("blocked_cloudflare.html"), "article": fixture("article_full.html")})
    assert got == {"status": "ok", "via": "브라우저 탭", "tabCalls": 1}


def test_crawler_reports_all_failures_and_not_found(page):
    got = run_crawler(page, """
        const blocked = async () => mkResponse(403, arg.blocked);
        const c1 = new m.Crawler({store, fetchImpl: blocked, sleep, clock: () => clockState.t, minInterval: 0, retries: 0, now: () => 1000});
        const r1 = await c1.crawl('가');
        const c2 = new m.Crawler({store: {get: async () => ({}), set: async () => {}}, fetchImpl: async () => mkResponse(404, arg.notFound),
                                  sleep, clock: () => clockState.t, minInterval: 0, now: () => 1000});
        const r2 = await c2.crawl('없는문서');
        return {r1: [r1.status, r1.error], r2: r2.status};
        """, {"blocked": fixture("blocked_cloudflare.html"), "notFound": fixture("not_found.html")})
    assert got["r1"][0] == "error" and "fetch:" in got["r1"][1] and got["r2"] == "not_found"


def test_crawler_css_and_font_embedding(page):
    got = run_crawler(page, """
        const css = "@font-face{font-family:Ionicons;src:url(/skins/espejo/i.woff2?v=1) format('woff2')}"
                  + "@font-face{font-family:KaTeX_Main;src:url(/skins/espejo/k.woff2) format('woff2')}";
        const fetchImpl = async (url) => url.endsWith('.css') ? mkResponse(200, css) : url.endsWith('.woff2') ? mkResponse(200, 'FONT') : mkResponse(200, arg);
        const c = new m.Crawler({store, fetchImpl, sleep, clock: () => clockState.t, minInterval: 0, now: () => 1000});
        const r = await c.crawl('가'); const key = Object.values(r.css)[0];
        return {plain: await c.exportCss(key, '<p>x</p>'), math: await c.exportCss(key, '<span class="katex"></span>'),
                evil: await c.ensureCss(['https://evil.example/x.css'])};
        """, fixture("article_full.html"))
    assert "data:font/woff2;base64,Rk9OVA==" in got["plain"] and "namu.wiki/skins/espejo/k.woff2" in got["plain"]
    assert got["math"].count("data:font/woff2;base64") == 2 and got["evil"] == {}


def test_follow_targets_matches_python(page):
    from namu_crawler.crawler import follow_targets
    doc = py_doc()
    result = CrawlResult("k", "전생검신", "ok", doc=doc)
    for scope in ("subdocs", "links"):
        got = js(page, "const m = await import('/lib/crawler.js'); return m.followTargets(arg.result, arg.scope);",
                 {"result": {"doc": asdict(doc)}, "scope": scope})
        assert [t["title"] for t in got] == [t.title for t in follow_targets(result, scope)]
