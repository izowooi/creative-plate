"""나무위키 문서를 받아오는 계층. 막히면 다음 방법으로 넘어간다.

방법 순서: curl_cffi(Chrome TLS 위장) -> playwright(실제 Chrome) -> wayback(보관본).
  * httpx/requests 는 TLS 지문 때문에 연결이 자주 끊겨 기본 목록에서 뺐다(실측: ConnectError).
  * 모든 외부 요청은 락으로 직렬화하고, 응답이 느릴수록 다음 요청까지의 간격을 늘린다.
  * robots.txt 가 허용하는 /w/ 문서와 /skins/ 정적 파일만 받는다.
"""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import logging
import re
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from .extract import BASE_URL, Blocked, LayoutChanged, NotFound, check_response
from .targets import title_to_url

log = logging.getLogger("namu_crawler")

USER_AGENT = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
}
DEFAULT_ORDER = ("curl_cffi", "playwright", "wayback")
SKIN_PREFIX = f"{BASE_URL}/skins/"
_FONT_PATH = re.compile(r"[A-Za-z0-9_\-]+(?:/[A-Za-z0-9_\-]+)*\.(?:woff2|woff|ttf|otf|eot|svg)")
_FONT_URL = re.compile(
    r"url\((['\"]?)(?:https://namu\.wiki/skins/)([A-Za-z0-9_\-/]+\.(?:woff2|woff|ttf|otf|eot|svg))(?:\?[^)'\"]*)?(?:#[^)'\"]*)?\1\)")
_WOFF2_URL = re.compile(r"url\((['\"]?)(?:https://namu\.wiki/skins/)([A-Za-z0-9_\-/]+\.woff2)(?:\?[^)'\"]*)?\1\)")
_TRANSIENT_STATUSES = {429, 502, 504}
_NOT_FOUND_TTL = 600.0


class TierUnavailable(Exception):
    """이 방법을 쓸 수 없음(패키지 미설치 등)."""


class Transient(Exception):
    """잠시 후 재시도하면 될 수 있는 오류(타임아웃, 429 등)."""

    def __init__(self, message: str, retry_after: float | None = None):
        super().__init__(message)
        self.retry_after = retry_after


class FetchFailed(Exception):
    """모든 방법이 실패함. failures 에 방법별 사유가 들어 있다."""

    def __init__(self, failures: list[str]):
        super().__init__(" / ".join(failures))
        self.failures = failures


@dataclass
class Response:
    status: int
    html: str
    url: str
    retry_after: float | None = None
    note: str = ""
    body: bytes | None = None       # 폰트 같은 바이너리 응답용


@dataclass
class RawPage:
    title: str
    url: str
    status: int
    html: str
    via: str
    fetched_at: float
    note: str = ""
    cached: bool = False


Tier = Callable[[str, "tuple[float, float]"], Response]


# ---------- 방법별 구현 ----------

def fetch_curl_cffi(url: str, timeout: tuple[float, float]) -> Response:
    try:
        from curl_cffi import requests
        from curl_cffi.requests.exceptions import RequestException
    except ImportError as e:
        raise TierUnavailable("curl_cffi 미설치 (pip install curl_cffi)") from e
    try:
        r = requests.get(url, headers=HEADERS, impersonate="chrome", timeout=timeout, allow_redirects=True)
    except RequestException as e:
        raise Transient(f"{type(e).__name__}: {e}") from e
    retry_after = r.headers.get("Retry-After", "")
    return Response(r.status_code, r.text, str(r.url), float(retry_after) if retry_after.isdigit() else None,
                    body=r.content)


def make_playwright_tier(profile_dir: Path, headed: bool = False) -> Tier:
    """실제 Chrome 으로 연다. headed 면 사람이 챌린지를 풀 때까지 최대 3분 기다린다."""

    def fetch(url: str, timeout: tuple[float, float]) -> Response:
        try:
            from playwright.sync_api import TimeoutError as PlaywrightTimeout
            from playwright.sync_api import sync_playwright
        except ImportError as e:
            raise TierUnavailable("playwright 미설치 (pip install playwright)") from e
        wait_ms = 180_000 if headed else 30_000
        with sync_playwright() as p:
            options = dict(user_data_dir=str(profile_dir), headless=not headed, locale="ko-KR",
                           args=["--disable-blink-features=AutomationControlled"],
                           ignore_default_args=["--enable-automation"])
            try:
                ctx = p.chromium.launch_persistent_context(channel="chrome", **options)
            except Exception:
                try:
                    ctx = p.chromium.launch_persistent_context(**options)  # 번들 Chromium
                except Exception as e:
                    raise TierUnavailable(f"브라우저를 시작하지 못함: {e}") from e
            try:
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                resp = page.goto(url, wait_until="domcontentloaded", timeout=timeout[1] * 1000)
                try:
                    page.wait_for_selector('h1, a[href*="creativecommons.org/licenses"]',
                                           state="attached", timeout=wait_ms)
                except PlaywrightTimeout:
                    pass  # 챌린지에 막힌 것이므로 아래 check_response 가 판정한다
                page.wait_for_timeout(500)
                return Response(resp.status if resp else 200, page.content(), page.url)
            except PlaywrightTimeout as e:
                raise Transient(f"playwright 타임아웃: {e}") from e
            finally:
                ctx.close()

    return fetch


def fetch_wayback(url: str, timeout: tuple[float, float]) -> Response:
    """Internet Archive 보관본(id_ = 원본 HTML 그대로). 최신본이 아닐 수 있어 note 로 시점을 남긴다."""
    r = fetch_curl_cffi(f"https://web.archive.org/web/2id_/{url}", timeout)
    snapshot = re.search(r"/web/(\d{14})", r.url)
    if snapshot:
        s = snapshot.group(1)
        r.note = f"Wayback 보관본 {s[:4]}-{s[4:6]}-{s[6:8]}"
    return r


# ---------- 조율 ----------

class Fetcher:
    def __init__(self, cache_dir: str | Path, *, min_interval: float = 3.0, ttl: float = 86400.0,
                 timeout: tuple[float, float] = (20.0, 90.0), retries: int = 3,
                 order: tuple[str, ...] = DEFAULT_ORDER, headed: bool = False,
                 static_interval: float = 0.3, tiers: dict[str, Tier] | None = None,
                 sleep=time.sleep, clock=time.monotonic):
        self.cache_dir = Path(cache_dir)
        self.pages_dir = self.cache_dir / "pages"
        self.css_dir = self.cache_dir / "css"
        self.assets_dir = self.cache_dir / "assets"
        for d in (self.pages_dir, self.css_dir, self.assets_dir):
            d.mkdir(parents=True, exist_ok=True)
        self.min_interval = min_interval
        self.static_interval = static_interval
        self.ttl = ttl
        self.timeout = timeout
        self.retries = retries
        self.order = order
        self.tiers = tiers if tiers is not None else {
            "curl_cffi": fetch_curl_cffi,
            "playwright": make_playwright_tier(self.cache_dir / "browser-profile", headed),
            "wayback": fetch_wayback,
        }
        self._sleep = sleep
        self._clock = clock
        self._lock = threading.Lock()
        self._not_before = {"doc": 0.0, "static": 0.0}

    # ----- 캐시 -----

    @staticmethod
    def key(title: str) -> str:
        return hashlib.sha1(title.encode("utf-8")).hexdigest()[:16]

    def read_cache(self, title: str) -> RawPage | None:
        return self.read_cache_by_key(self.key(title))

    def read_cache_by_key(self, key: str) -> RawPage | None:
        if not re.fullmatch(r"[0-9a-f]{16}", key):
            return None  # URL 에서 온 값으로 캐시 폴더 밖을 읽지 못하게 한다
        meta_path = self.pages_dir / f"{key}.json"
        if not meta_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        html_path = self.pages_dir / f"{key}.html.gz"
        html = gzip.decompress(html_path.read_bytes()).decode("utf-8") if html_path.exists() else ""
        return RawPage(html=html, cached=True, **meta)

    def list_cached(self, limit: int = 100) -> list[dict]:
        """캐시에 있는 문서를 최근 수집 순으로 나열한다(본문은 읽지 않는다)."""
        items = []
        for path in self.pages_dir.glob("*.json"):
            meta = json.loads(path.read_text(encoding="utf-8"))
            items.append({"key": path.stem, "title": meta["title"], "status": meta["status"], "via": meta["via"],
                          "fetched_at": meta["fetched_at"]})
        items.sort(key=lambda i: i["fetched_at"], reverse=True)
        return items[:limit]

    def _write_cache(self, page: RawPage) -> None:
        key = self.key(page.title)
        meta = asdict(page)
        meta.pop("html")
        meta.pop("cached")
        if page.html:
            (self.pages_dir / f"{key}.html.gz").write_bytes(gzip.compress(page.html.encode("utf-8")))
        (self.pages_dir / f"{key}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

    def _fresh(self, page: RawPage) -> bool:
        limit = _NOT_FOUND_TTL if page.status == 404 else self.ttl
        return time.time() - page.fetched_at < limit

    # ----- 문서 -----

    def get(self, title: str, *, refresh: bool = False) -> RawPage:
        if not refresh:
            cached = self.read_cache(title)
            if cached and self._fresh(cached):
                return cached
        page = self._download(title)
        self._write_cache(page)
        return page

    def _download(self, title: str) -> RawPage:
        url = title_to_url(title)
        failures: list[str] = []
        for name in self.order:
            tier = self.tiers.get(name)
            if tier is None:
                continue
            try:
                resp = self._try_tier(name, tier, url)
            except NotFound:
                return RawPage(title, url, 404, "", name, time.time())
            except TierUnavailable as e:
                failures.append(f"{name}: {e}")
                continue
            except (Blocked, LayoutChanged) as e:
                log.warning("%s 실패, 다음 방법으로 전환: %s", name, e)
                failures.append(f"{name}: {e}")
                continue
            return RawPage(title, resp.url, resp.status, resp.html, name, time.time(), resp.note)
        raise FetchFailed(failures)

    def _try_tier(self, name: str, tier: Tier, url: str) -> Response:
        backoff = 2.0
        for attempt in range(self.retries + 1):
            try:
                resp = self._request(tier, url)
                if resp.status in _TRANSIENT_STATUSES:
                    raise Transient(f"HTTP {resp.status}", resp.retry_after)
            except Transient as e:
                if attempt == self.retries:
                    raise Blocked(f"재시도 {self.retries}회 초과 ({e})") from e
                wait = e.retry_after or backoff
                log.info("%s 일시 오류(%s), %.0f초 후 재시도", name, e, wait)
                self._penalize(wait)
                backoff *= 2
                continue
            check_response(resp.status, resp.html)
            return resp
        raise AssertionError("unreachable")

    # ----- 스킨 CSS / 폰트 -----

    def ensure_css(self, urls: list[str]) -> dict[str, str]:
        """스킨 CSS 를 내려받아 캐시하고 {원본 URL: 캐시 파일 키} 를 돌려준다.

        해시가 배포마다 바뀌어 옛 문서의 CSS 가 사라질 수 있으므로, 문서와 같은 시점의 CSS 를 보관한다.
        """
        result: dict[str, str] = {}
        for url in urls:
            if not url.startswith(SKIN_PREFIX):
                continue  # robots.txt 가 허용하고 우리가 기대하는 경로만 받는다(보관본 등에서 온 임의 주소 차단)
            key = hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]
            path = self.css_dir / f"{key}.css"
            if not path.exists():
                resp = self._get_static(url)
                if resp is None:
                    continue
                path.write_text(absolutize_css_urls(resp.html), encoding="utf-8")
            result[url] = key
        return result

    def read_css(self, key: str) -> str | None:
        if not re.fullmatch(r"[0-9a-f]{16}", key):
            return None
        path = self.css_dir / f"{key}.css"
        return path.read_text(encoding="utf-8") if path.exists() else None

    def web_css(self, key: str) -> str | None:
        """웹앱용 CSS. 폰트는 CORS 때문에 나무위키에서 직접 못 불러오므로 로컬 /asset 프록시로 바꾼다."""
        css = self.read_css(key)
        return None if css is None else _FONT_URL.sub(lambda m: f"url({m[1]}/asset/{m[2]}{m[1]})", css)

    def export_css(self, key: str, html: str) -> str | None:
        """저장용 CSS. 아이콘 폰트(Ionicons)와, 수식이 있는 문서의 KaTeX 폰트를 data URI 로 내장한다."""
        css = self.read_css(key)
        if css is None:
            return None
        has_math = "katex" in html

        def embed_face(face: re.Match) -> str:
            family = re.search(r"font-family:\s*[\"']?([^;\"']+)", face[0])
            name = family[1].strip() if family else ""
            if not (name == "Ionicons" or (has_math and name.startswith("KaTeX"))):
                return face[0]

            def embed(url: re.Match) -> str:
                data = self.fetch_asset(url[2])
                if data is None:
                    return url[0]
                return f"url(data:font/woff2;base64,{base64.b64encode(data).decode()})"
            return _WOFF2_URL.sub(embed, face[0])

        return re.sub(r"@font-face\s*\{[^}]*\}", embed_face, css)

    def fetch_asset(self, rel_path: str) -> bytes | None:
        """/skins/ 아래 폰트 파일을 받아 캐시한다. rel_path 는 'espejo/abc.woff2' 형태."""
        if not _FONT_PATH.fullmatch(rel_path):
            return None
        path = self.assets_dir / hashlib.sha1(rel_path.encode("utf-8")).hexdigest()[:16]
        if path.exists():
            return path.read_bytes()
        resp = self._get_static(f"{SKIN_PREFIX}{rel_path}")
        if resp is None:
            return None
        data = resp.body if resp.body is not None else resp.html.encode("utf-8")
        path.write_bytes(data)
        return data

    def _get_static(self, url: str) -> Response | None:
        try:
            resp = self._request(self.tiers.get("curl_cffi", fetch_curl_cffi), url, kind="static")
        except (Transient, TierUnavailable) as e:
            log.warning("정적 파일 수집 실패 %s: %s", url, e)
            return None
        if resp.status != 200:
            log.warning("정적 파일 수집 실패 %s: HTTP %s", url, resp.status)
            return None
        return resp

    # ----- 외부 요청 직렬화 -----

    def _request(self, tier: Tier, url: str, kind: str = "doc") -> Response:
        with self._lock:
            wait = self._not_before[kind] - self._clock()
            if wait > 0:
                self._sleep(wait)
            started = self._clock()
            try:
                return tier(url, self.timeout)
            finally:
                elapsed = self._clock() - started
                interval = self.min_interval if kind == "doc" else self.static_interval
                # 응답이 느리다는 건 서버가 힘들어한다는 신호라 그만큼 더 쉰다
                self._not_before[kind] = self._clock() + max(interval, elapsed)

    def _penalize(self, seconds: float) -> None:
        with self._lock:
            self._not_before["doc"] = max(self._not_before["doc"], self._clock() + seconds)


def absolutize_css_urls(css: str) -> str:
    """url(/skins/...) 처럼 루트 상대 경로인 폰트·이미지를 절대 주소로 바꾼다."""
    return re.sub(r"url\((['\"]?)(/(?!/)[^)'\"]*)\1\)", lambda m: f"url({m[1]}{BASE_URL}{m[2]}{m[1]})", css)
