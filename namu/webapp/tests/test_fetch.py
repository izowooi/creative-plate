import time

import pytest

from conftest import fixture
from namu_crawler.fetch import FetchFailed, Fetcher, Response, TierUnavailable, Transient, absolutize_css_urls


class FakeClock:
    def __init__(self):
        self.now = 1000.0
        self.slept: list[float] = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.slept.append(seconds)
        self.now += seconds


def make_fetcher(tmp_path, tiers, order=None, **kw):
    fake = FakeClock()
    kw.setdefault("min_interval", 0)
    fetcher = Fetcher(tmp_path, tiers=tiers, order=order or tuple(tiers), sleep=fake.sleep, clock=fake.clock, **kw)
    return fetcher, fake


def ok_tier(calls):
    def tier(url, timeout):
        calls.append(url)
        return Response(200, fixture("article_full.html"), url)
    return tier


def test_success_is_cached(tmp_path):
    calls = []
    fetcher, _ = make_fetcher(tmp_path, {"a": ok_tier(calls)})
    first = fetcher.get("전생검신")
    second = fetcher.get("전생검신")
    assert first.via == "a" and not first.cached
    assert second.cached and second.html == first.html
    assert len(calls) == 1
    fetcher.get("전생검신", refresh=True)
    assert len(calls) == 2


def test_expired_cache_is_refetched(tmp_path):
    calls = []
    fetcher, _ = make_fetcher(tmp_path, {"a": ok_tier(calls)}, ttl=0)
    fetcher.get("가")
    fetcher.get("가")
    assert len(calls) == 2


def test_blocked_tier_falls_back_to_next(tmp_path):
    calls = []
    blocked = lambda url, timeout: Response(403, fixture("blocked_cloudflare.html"), url)
    fetcher, _ = make_fetcher(tmp_path, {"a": blocked, "b": ok_tier(calls)})
    page = fetcher.get("전생검신")
    assert page.via == "b" and len(calls) == 1


def test_unavailable_tier_is_skipped(tmp_path):
    def missing(url, timeout):
        raise TierUnavailable("미설치")
    fetcher, _ = make_fetcher(tmp_path, {"a": missing, "b": ok_tier([])})
    assert fetcher.get("가").via == "b"


def test_all_tiers_failing_reports_each_reason(tmp_path):
    blocked = lambda url, timeout: Response(403, "", url)
    fetcher, _ = make_fetcher(tmp_path, {"a": blocked, "b": blocked})
    with pytest.raises(FetchFailed) as e:
        fetcher.get("가")
    assert len(e.value.failures) == 2 and e.value.failures[0].startswith("a:")


def test_not_found_is_not_retried_and_cached_briefly(tmp_path):
    calls = []

    def tier(url, timeout):
        calls.append(url)
        return Response(404, fixture("not_found.html"), url)
    fetcher, _ = make_fetcher(tmp_path, {"a": tier, "b": ok_tier([])})
    page = fetcher.get("없는문서")
    assert page.status == 404 and page.via == "a" and len(calls) == 1
    assert fetcher.get("없는문서").cached and len(calls) == 1


def test_rate_limit_backs_off_exponentially_then_succeeds(tmp_path):
    answers = [Response(429, "", "u"), Response(429, "", "u"), Response(200, fixture("article_full.html"), "u")]
    calls = []

    def tier(url, timeout):
        calls.append(1)
        return answers[len(calls) - 1]
    fetcher, fake = make_fetcher(tmp_path, {"a": tier})
    assert fetcher.get("가").status == 200
    assert len(calls) == 3 and fake.slept == [2.0, 4.0]


def test_retry_after_header_wins(tmp_path):
    answers = [Response(429, "", "u", retry_after=30), Response(200, fixture("article_full.html"), "u")]
    calls = []

    def tier(url, timeout):
        calls.append(1)
        return answers[len(calls) - 1]
    fetcher, fake = make_fetcher(tmp_path, {"a": tier})
    fetcher.get("가")
    assert fake.slept == [30]


def test_retries_exhausted_escalates_to_next_tier(tmp_path):
    def flaky(url, timeout):
        raise Transient("timeout")
    fetcher, _ = make_fetcher(tmp_path, {"a": flaky, "b": ok_tier([])}, retries=1)
    assert fetcher.get("가").via == "b"


def test_requests_are_spaced_by_min_interval_and_slow_responses_widen_it(tmp_path):
    fake = FakeClock()

    def slow(url, timeout):
        fake.now += 12  # 느린 응답
        return Response(200, fixture("article_full.html"), url)
    fetcher = Fetcher(tmp_path, tiers={"a": slow}, order=("a",), min_interval=3, sleep=fake.sleep, clock=fake.clock)
    fetcher.get("가")
    fetcher.get("나")
    assert fake.slept == [12]  # 두 번째 요청은 직전 응답 시간(12초)만큼 쉰 뒤 나간다


def test_unreadable_layout_is_reported_not_cached_as_success(tmp_path):
    broken = lambda url, timeout: Response(200, '<html><head><meta name="generator" content="the seed"></head>'
                                                '<body>다른 구조</body></html>', url)
    fetcher, _ = make_fetcher(tmp_path, {"a": broken})
    with pytest.raises(FetchFailed):
        fetcher.get("가")
    assert fetcher.read_cache("가") is None


def test_css_is_cached_with_absolute_font_urls_and_only_skins_allowed(tmp_path):
    calls = []

    def tier(url, timeout):
        calls.append(url)
        return Response(200, "@font-face{src:url(/skins/espejo/a.woff2)} .x{background:url(data:image/png;base64,AA)}",
                        url)
    fetcher, _ = make_fetcher(tmp_path, {"curl_cffi": tier})
    mapping = fetcher.ensure_css(["https://namu.wiki/skins/espejo/a.css", "https://evil.example/x.css"])
    assert list(mapping) == ["https://namu.wiki/skins/espejo/a.css"]
    text = fetcher.read_css(mapping["https://namu.wiki/skins/espejo/a.css"])
    assert "url(https://namu.wiki/skins/espejo/a.woff2)" in text and "data:image/png" in text
    fetcher.ensure_css(["https://namu.wiki/skins/espejo/a.css"])
    assert len(calls) == 1


def test_read_css_rejects_path_traversal(tmp_path):
    fetcher, _ = make_fetcher(tmp_path, {})
    assert fetcher.read_css("../../etc/passwd") is None


def test_absolutize_css_urls_leaves_protocol_relative_alone():
    css = "a{background:url('/x.png')} b{background:url(//cdn.example/y.png)} c{background:url(\"https://z/w.png\")}"
    out = absolutize_css_urls(css)
    assert "url('https://namu.wiki/x.png')" in out and "url(//cdn.example/y.png)" in out and 'url("https://z/w.png")' in out


def test_list_cached_orders_by_recency(tmp_path):
    fetcher, _ = make_fetcher(tmp_path, {"a": ok_tier([])})
    fetcher.get("먼저")
    time.sleep(0.01)
    fetcher.get("나중")
    assert [i["title"] for i in fetcher.list_cached()] == ["나중", "먼저"]


def css_fetcher(tmp_path):
    def tier(url, timeout):
        if url.endswith(".css"):
            return Response(200, "@font-face{font-family:Ionicons;src:url(/skins/espejo/i.woff2?v=1) format('woff2'),"
                                 "url(/skins/espejo/i.ttf) format('truetype')}"
                                 "@font-face{font-family:KaTeX_Main;src:url(/skins/espejo/k.woff2) format('woff2')}"
                                 "@font-face{font-family:Other;src:url(/skins/espejo/o.woff2) format('woff2')}", url)
        return Response(200, "", url, body=b"BIN-" + url.rsplit("/", 1)[-1].encode())
    fetcher, _ = make_fetcher(tmp_path, {"curl_cffi": tier})
    key = fetcher.ensure_css(["https://namu.wiki/skins/espejo/a.css"])["https://namu.wiki/skins/espejo/a.css"]
    return fetcher, key


def test_web_css_points_fonts_to_local_proxy(tmp_path):
    fetcher, key = css_fetcher(tmp_path)
    css = fetcher.web_css(key)
    assert "url(/asset/espejo/i.woff2)" in css and "url(/asset/espejo/i.ttf)" in css and "namu.wiki/skins" not in css


def test_export_css_embeds_icon_font_always_and_katex_only_for_math(tmp_path):
    fetcher, key = css_fetcher(tmp_path)
    plain = fetcher.export_css(key, "<p>수식 없음</p>")
    assert "base64," + "QklOLWkud29mZjI=" in plain          # BIN-i.woff2
    assert "url(https://namu.wiki/skins/espejo/k.woff2)" in plain   # KaTeX 는 수식 문서에서만 내장
    assert "url(https://namu.wiki/skins/espejo/i.ttf)" in plain     # woff2 외 형식은 그대로 둔다
    assert "url(https://namu.wiki/skins/espejo/o.woff2)" in plain   # 쓰지 않는 폰트는 내장하지 않는다
    math = fetcher.export_css(key, '<span class="katex">x</span>')
    assert "url(https://namu.wiki/skins/espejo/k.woff2)" not in math


def test_fetch_asset_validates_path_and_caches(tmp_path):
    calls = []

    def tier(url, timeout):
        calls.append(url)
        return Response(200, "", url, body=b"X")
    fetcher, _ = make_fetcher(tmp_path, {"curl_cffi": tier})
    assert fetcher.fetch_asset("espejo/a.woff2") == b"X" and fetcher.fetch_asset("espejo/a.woff2") == b"X"
    assert len(calls) == 1
    for bad in ("../x.woff2", "espejo/a.php", "/etc/passwd.ttf", "espejo/a.woff2?x=1", ""):
        assert fetcher.fetch_asset(bad) is None


def test_static_requests_use_their_own_short_interval(tmp_path):
    fake = FakeClock()
    tier = lambda url, timeout: Response(200, "body{}", url, body=b"x")
    fetcher = Fetcher(tmp_path, tiers={"curl_cffi": tier}, order=("curl_cffi",), min_interval=3, static_interval=0.3,
                      sleep=fake.sleep, clock=fake.clock)
    fetcher.ensure_css(["https://namu.wiki/skins/a.css", "https://namu.wiki/skins/b.css"])
    assert fake.slept == pytest.approx([0.3])


def test_read_cache_by_key_rejects_non_hash_keys(tmp_path):
    fetcher, _ = make_fetcher(tmp_path, {"a": ok_tier([])})
    (tmp_path / "secret.json").write_text("{}", encoding="utf-8")
    for bad in ("../secret", "..", "", "ZZZZZZZZZZZZZZZZ", "0" * 15):
        assert fetcher.read_cache_by_key(bad) is None
