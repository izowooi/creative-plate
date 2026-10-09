import json
from pathlib import Path

import pytest

from conftest import fixture
from namu_crawler import cli
from namu_crawler.crawler import Crawler
from namu_crawler.fetch import Fetcher, Response
from namu_crawler.targets import Target


def fake_tier(url, timeout):
    if url.endswith(".css"):
        return Response(200, "@font-face{font-family:Ionicons;src:url(/skins/espejo/i.woff2) format('woff2')}", url)
    if url.endswith(".woff2"):
        return Response(200, "", url, body=b"FONT")
    if "%EC%97%86%EB%8A%94" in url:  # '없는'
        return Response(404, fixture("not_found.html"), url)
    return Response(200, fixture("article_full.html"), url)


def make_crawler(tmp_path):
    return Crawler(Fetcher(tmp_path, tiers={"curl_cffi": fake_tier}, order=("curl_cffi",), min_interval=0,
                           static_interval=0, sleep=lambda s: None))


def test_crawl_many_follows_subdocuments_once(tmp_path):
    crawler = make_crawler(tmp_path)
    results = crawler.crawl_many([Target("전생검신", "")], follow="subdocs", depth=1, limit=50)
    titles = [r.title for r in results]
    assert titles[0] == "전생검신" and len(titles) > 1 and len(set(titles)) == len(titles)
    assert all(t.startswith("전생검신/") for t in titles[1:])


def test_crawl_many_respects_limit_depth_and_dedup(tmp_path):
    crawler = make_crawler(tmp_path)
    limited = crawler.crawl_many([Target("전생검신", "")], follow="links", depth=2, limit=5)
    assert len(limited) == 5 and len({r.title for r in limited}) == 5
    no_follow = crawler.crawl_many([Target("전생검신", "")], follow=None)
    assert len(no_follow) == 1
    shallow = crawler.crawl_many([Target("전생검신", "")], follow="subdocs", depth=1, limit=50)
    deeper = crawler.crawl_many([Target("전생검신", "")], follow="subdocs", depth=2, limit=50)
    assert len(deeper) >= len(shallow)


def test_crawl_many_reports_each_result_via_callback(tmp_path):
    seen = []
    make_crawler(tmp_path).crawl_many([Target("전생검신", ""), Target("없는문서", "")], on_result=seen.append)
    assert [r.status for r in seen] == ["ok", "not_found"]


@pytest.fixture(autouse=True)
def offline_fetcher(monkeypatch):
    """CLI 가 실제 나무위키로 나가지 않도록, 항상 가짜 수집 계층으로 Fetcher 를 만든다."""
    def build(args):
        order = tuple(t for t in ("curl_cffi",) if t not in (args.skip or []))
        return Fetcher(args.cache_dir, tiers={"curl_cffi": fake_tier}, order=order, min_interval=0,
                       static_interval=0, sleep=lambda s: None)
    monkeypatch.setattr(cli, "build_fetcher", build)


def run_cli(tmp_path, *args):
    out = tmp_path / "out"
    code = cli.main([*args, "--cache-dir", str(tmp_path / "cache"), "-o", str(out)])
    return code, out


def test_cli_writes_requested_formats_and_index(tmp_path):
    code, out = run_cli(tmp_path, "전생검신", "https://example.com/x", "--format", "html,md,json")
    assert code == 0
    assert sorted(p.name for p in out.iterdir()) == ["index.json", "전생검신.html", "전생검신.json", "전생검신.md"]
    html = (out / "전생검신.html").read_text(encoding="utf-8")
    assert "data:font/woff2;base64" in html and "<script" not in html
    assert (out / "전생검신.md").read_text(encoding="utf-8").startswith("# 전생검신")
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index[0]["status"] == "ok" and index[0]["file"] == "전생검신"


def test_cli_reads_targets_from_file_and_handles_missing_documents(tmp_path):
    listing = tmp_path / "list.txt"
    listing.write_text("https://namu.wiki/w/전생검신\n없는문서\n", encoding="utf-8")
    code, out = run_cli(tmp_path, "-f", str(listing), "--format", "md")
    assert code == 0 and (out / "전생검신.md").exists() and not (out / "없는문서.md").exists()
    statuses = {i["title"]: i["status"] for i in json.loads((out / "index.json").read_text(encoding="utf-8"))}
    assert statuses == {"전생검신": "ok", "없는문서": "not_found"}


def test_cli_exit_code_is_1_when_a_document_cannot_be_fetched(tmp_path, capsys):
    code, out = run_cli(tmp_path, "아무도없는문서", "--skip", "curl_cffi")
    assert code == 1
    assert "실패" in capsys.readouterr().out
    assert json.loads((out / "index.json").read_text(encoding="utf-8"))[0]["status"] == "error"


def test_cli_rejects_bad_arguments(tmp_path):
    with pytest.raises(SystemExit) as e:
        cli.main(["전생검신", "--format", "pdf", "--cache-dir", str(tmp_path)])
    assert e.value.code == 2
    with pytest.raises(SystemExit) as e:
        cli.main(["https://example.com/x", "--cache-dir", str(tmp_path)])
    assert e.value.code == 2
