import io
import zipfile
from urllib.parse import unquote

import pytest

from conftest import fixture
from namu_crawler.crawler import Crawler
from namu_crawler.fetch import Fetcher, Response
from namu_crawler.server import create_app


@pytest.fixture
def client(tmp_path):
    def tier(url, timeout):
        if url.endswith(".css"):
            return Response(200, "@font-face{font-family:Ionicons;src:url(/skins/espejo/ion.woff2?v=1) format('woff2')}"
                                 "body{margin:0}", url)
        if url.endswith(".woff2"):
            return Response(200, "", url, body=b"FONTDATA")
        if "없는문서" in unquote(url):
            return Response(404, fixture("not_found.html"), url)
        return Response(200, fixture("article_full.html"), url)

    fetcher = Fetcher(tmp_path, tiers={"curl_cffi": tier}, order=("curl_cffi",), min_interval=0,
                      sleep=lambda s: None)
    app = create_app(Crawler(fetcher))
    app.testing = True
    return app.test_client()


def crawl(client, title="전생검신", **kw):
    return client.post("/api/crawl/one", json={"title": title, **kw}).get_json()


def test_index_and_static(client):
    assert "나무위키 크롤러" in client.get("/").get_data(as_text=True)
    assert client.get("/static/app.js").status_code == 200
    assert client.get("/static/../namu_crawler/server.py").status_code == 404


def test_rejects_foreign_host_and_non_json_post(client):
    assert client.get("/", base_url="http://evil.example").status_code == 403
    assert client.post("/api/parse", data="text=x").status_code == 415


def test_parse_endpoint(client):
    data = client.post("/api/parse", json={"text": "https://namu.wiki/w/전생검신\nhttps://example.com/x"}).get_json()
    assert data["targets"][0]["title"] == "전생검신" and len(data["errors"]) == 1


def test_crawl_summary_and_document_view(client):
    s = crawl(client)
    assert s["status"] == "ok" and s["doc"]["title"] == "전생검신" and s["doc"]["counts"]["sections"] == 14
    assert s["via"] == "curl_cffi" and s["cached"] is False
    assert crawl(client)["cached"] is True

    page = client.get(f"/doc/{s['key']}")
    assert page.status_code == 200
    csp = page.headers["Content-Security-Policy"]
    assert "sandbox" in csp and "default-src 'none'" in csp and "script-src" not in csp
    body = page.get_data(as_text=True)
    assert "/css/" in body and "<script" not in body
    css_href = body.split('href="/css/')[1].split('"')[0]
    served = client.get(f"/css/{css_href}").get_data(as_text=True)
    assert "url(/asset/espejo/ion.woff2)" in served and "namu.wiki/skins" not in served
    font = client.get("/asset/espejo/ion.woff2")
    assert font.data == b"FONTDATA" and font.mimetype == "font/woff2"
    assert font.headers["Access-Control-Allow-Origin"] == "*"
    assert client.get("/asset/espejo/evil.php").status_code == 404
    assert client.get("/asset/../etc/passwd.ttf").status_code == 404


def test_not_found_document(client):
    s = crawl(client, "없는문서")
    assert s["status"] == "not_found"
    assert "문서가 없습니다" in client.get(f"/doc/{s['key']}").get_data(as_text=True)


def test_cache_only_does_not_hit_network(client):
    assert client.post("/api/crawl/one", json={"title": "처음보는문서", "cache_only": True}).status_code == 404
    crawl(client)
    assert client.post("/api/crawl/one", json={"title": "전생검신", "cache_only": True}).get_json()["status"] == "ok"


def test_exports(client):
    key = crawl(client)["key"]
    md = client.get(f"/api/export/{key}.md")
    assert md.get_data(as_text=True).startswith("# 전생검신")
    assert "attachment" in md.headers["Content-Disposition"] and "UTF-8''" in md.headers["Content-Disposition"]
    assert client.get(f"/api/export/{key}.md?inline=1").headers["Content-Disposition"].startswith("inline")
    assert client.get(f"/api/export/{key}.json").get_json()["document"]["title"] == "전생검신"
    html = client.get(f"/api/export/{key}.html").get_data(as_text=True)
    assert "body{margin:0}" in html and "<link rel=\"stylesheet\"" not in html  # 저장본은 CSS 를 인라인
    assert "data:font/woff2;base64," in html and "/skins/espejo/ion.woff2" not in html  # 아이콘 폰트는 내장
    assert client.get(f"/api/export/{key}.exe").status_code == 404
    assert client.get("/api/export/0000000000000000.md").status_code == 404


def test_zip_export(client):
    keys = [crawl(client)["key"], crawl(client, "다른 문서")["key"]]
    res = client.post("/api/export.zip", json={"keys": keys, "format": "md"})
    names = zipfile.ZipFile(io.BytesIO(res.data)).namelist()
    assert res.mimetype == "application/zip" and len(names) == 2
    assert client.post("/api/export.zip", json={"keys": keys, "format": "exe"}).status_code == 400
    assert client.post("/api/export.zip", json={"keys": ["nope"], "format": "md"}).status_code == 404


def test_follow_candidates(client):
    key = crawl(client)["key"]
    subdocs = client.post("/api/follow", json={"key": key, "scope": "subdocs"}).get_json()["targets"]
    assert subdocs and all(t["title"].startswith("전생검신/") for t in subdocs)
    links = client.post("/api/follow", json={"key": key, "scope": "links"}).get_json()["targets"]
    assert len(links) > len(subdocs) and all(not t["title"].startswith("분류:") for t in links)
    assert client.post("/api/follow", json={"key": key, "scope": "x"}).status_code == 400


def test_history_lists_cached_documents(client):
    crawl(client)
    items = client.get("/api/history").get_json()["items"]
    assert items and items[0]["title"] == "전생검신"
