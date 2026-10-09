import pytest
from bs4 import BeautifulSoup

from conftest import fixture
from namu_crawler.extract import (Blocked, LayoutChanged, NotFound, _main_between_title_and_license,
                                  _main_from_anchors, check_response, extract_document)


@pytest.fixture(scope="module")
def full():
    return extract_document(fixture("article_full.html"), "https://namu.wiki/w/x")


def test_title_sections_and_metadata(full):
    assert full.title == "전생검신"
    assert full.last_modified == "2026-07-27T23:46:13.000Z"
    assert [(s.number, s.title) for s in full.sections[:3]] == [("1", "개요"), ("2", "줄거리"), ("2.1", "회차 정리")]
    assert len(full.categories) == 12 and full.categories[0].title == "전생검신"
    assert full.stylesheets and all(u.startswith("https://namu.wiki/skins/") for u in full.stylesheets)


def test_both_detection_methods_agree_on_real_page():
    soup = BeautifulSoup(fixture("article_full.html"), "html.parser")
    h1 = soup.find("h1")
    assert _main_between_title_and_license(soup, h1) is _main_from_anchors(soup, h1)


def test_ads_edit_links_and_scripts_removed(full):
    for junk in ("sageclinic", "쫑알주사", "<script", "<noscript", "/edit/", "data-src", "onclick"):
        assert junk not in full.html
    assert "개요" in full.html


def test_toc_and_footnotes_survive(full):
    soup = BeautifulSoup(full.html, "html.parser")
    assert soup.find("a", href="#s-1") is not None
    assert soup.find("span", id="fn-1") is not None and soup.find("a", href="#rfn-1") is not None
    assert soup.select_one('[data-namu="toc"]') is not None
    assert soup.select_one('[data-namu="categories"]') is not None
    assert len(soup.select('[data-namu="footnote"]')) >= 3


def test_images_use_real_urls_and_https(full):
    assert full.images and all(u.startswith("https://") and not u.startswith("data:") for u in full.images)
    soup = BeautifulSoup(full.html, "html.parser")
    assert all(not (i.get("src") or "").startswith("//") for i in soup.find_all("img"))


def test_internal_links_are_absolute_and_open_in_new_tab(full):
    assert full.links and all(link.url.startswith("https://namu.wiki/w/") for link in full.links)
    soup = BeautifulSoup(full.html, "html.parser")
    a = soup.find("a", href=full.links[0].url)
    assert a["target"] == "_blank" and "noopener" in a["rel"]


def test_minimal_doc_without_headings():
    doc = extract_document(fixture("article_minimal.html"), "https://namu.wiki/w/짧은문서")
    assert doc.title == "짧은문서" and doc.sections == []
    assert "문단 제목이 없는" in doc.html and "Footer" not in doc.html and "CC BY-NC-SA" not in doc.html
    assert "최근 수정 시각" in doc.html


def test_minimal_doc_is_sanitized():
    doc = extract_document(fixture("article_minimal.html"), "u")
    for junk in ("alert", "onclick", "javascript:", "<script", "<noscript"):
        assert junk not in doc.html
    assert 'src="https://i.namu.wiki/i/real.png"' in doc.html
    assert doc.images == ["https://i.namu.wiki/i/real.png"]
    assert "나쁜 링크" in doc.html  # 링크만 풀고 글자는 남긴다


def test_class_names_are_not_used_for_detection():
    html = fixture("article_full.html")
    for cls in ("_6YZgjHNT", "uWoRuem8", "_9izjyxNu", "YujukE4J"):
        html = html.replace(cls, "ZZ" + cls[::-1])  # 해시 클래스가 전부 바뀐 배포를 흉내
    doc = extract_document(html, "u")
    assert doc.title == "전생검신" and len(doc.sections) == 14


def test_layout_changed_when_no_license_or_h1():
    with pytest.raises(LayoutChanged):
        extract_document("<html><body><div>hi</div></body></html>", "u")


def test_check_response_classification():
    check_response(200, fixture("article_full.html"))
    with pytest.raises(NotFound):
        check_response(404, fixture("not_found.html"))
    with pytest.raises(Blocked):
        check_response(403, fixture("blocked_cloudflare.html"))
    with pytest.raises(Blocked, match="챌린지"):
        check_response(200, fixture("blocked_cloudflare.html"))
    with pytest.raises(Blocked):
        check_response(404, "<html>nginx 404</html>")  # 나무위키 응답이 아닌 404 는 문서 없음이 아니다
    with pytest.raises(Blocked):
        check_response(429, fixture("article_full.html"))
