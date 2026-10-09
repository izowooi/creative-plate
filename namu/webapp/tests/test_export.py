import io
import json
import time
import zipfile

from conftest import fixture
from namu_crawler.crawler import CrawlResult
from namu_crawler.export import build_zip, render_page, safe_filename, to_json, to_markdown
from namu_crawler.extract import extract_document
from namu_crawler.fetch import RawPage


def make_result(name="article_full.html", title="전생검신"):
    html = fixture(name)
    doc = extract_document(html, "https://namu.wiki/w/x")
    page = RawPage(title, doc.url, 200, html, "curl_cffi", time.time())
    return CrawlResult("k" * 16, title, "ok", doc=doc, page=page, css={u: "c" * 16 for u in doc.stylesheets})


def test_markdown_structure():
    md = to_markdown(make_result())
    lines = md.splitlines()
    assert lines[0] == "# 전생검신"
    assert "## 1. 개요" in md and "### 2.1. 회차 정리" in md
    assert "분류: 전생검신, 웹소설/목록" in md
    assert md.count("[웹소설/목록]") == 0            # 분류는 머리말 한 번만
    assert "1. 개요 2. 줄거리" not in md             # 목차는 제목으로 대체
    assert "\n[1] " in md and "\n[2] " in md         # 각주는 줄 단위
    assert "sageclinic" not in md and "![전생검신 표지1](https://i.namu.wiki/" in md
    assert "CC BY-NC-SA 2.0 KR" in md


def test_markdown_minimal_document():
    md = to_markdown(make_result("article_minimal.html", "짧은문서"))
    assert "문단 제목이 없는 아주 짧은 문서입니다. [나무위키](https://namu.wiki/w/" in md
    assert "![그림](https://i.namu.wiki/i/real.png)" in md


def test_render_page_links_css_and_keeps_source_and_license():
    html = render_page(make_result(), css_href=lambda k: f"/css/{k}.css")
    assert html.count('<link rel="stylesheet" href="/css/cccccccccccccccc.css">') == 2
    assert 'class="theseed-light-mode"' in html and "CC BY-NC-SA 2.0 KR" in html
    assert "https://namu.wiki/w/x" in html


def test_render_page_inlines_css_for_offline_files():
    html = render_page(make_result(), css_text=lambda k, html: "body{color:red}</style><script>x</script>")
    assert html.count("body{color:red}") == 2 and "</style><script>" not in html
    assert '<link rel="stylesheet"' not in html


def test_render_page_falls_back_to_original_css_url_when_not_cached():
    result = make_result()
    result.css = {}
    assert "https://namu.wiki/skins/espejo/" in render_page(result, css_href=lambda k: k)


def test_not_found_and_error_pages():
    r = CrawlResult("k", "없는문서", "not_found")
    assert "문서가 없습니다" in render_page(r) and "없는문서" in to_markdown(r)
    r = CrawlResult("k", "x", "error", error="<b>차단</b>")
    assert "&lt;b&gt;" in render_page(r)


def test_json_has_document_and_markdown():
    data = json.loads(to_json(make_result()))
    assert data["status"] == "ok" and data["document"]["title"] == "전생검신"
    assert data["markdown"].startswith("# 전생검신") and data["fetch"]["via"] == "curl_cffi"


def test_zip_contains_one_file_per_result_with_unique_names():
    a, b = make_result(), make_result()
    b.key = "z" * 16
    names = zipfile.ZipFile(io.BytesIO(build_zip([a, b], "md", lambda k, html: None))).namelist()
    assert len(names) == 2 and len(set(names)) == 2 and all(n.endswith(".md") for n in names)


def test_safe_filename():
    assert safe_filename('a/b:c*?"d') == "a_b_c___d"
    assert safe_filename("...") == "untitled"
