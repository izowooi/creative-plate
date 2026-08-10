import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import httpx
from curl_cffi import requests as curl_requests
from playwright.sync_api import sync_playwright


@dataclass
class HlsLevel:
    height: int
    url: str


@dataclass
class HlsInfo:
    master_url: str
    levels: list[HlsLevel]
    referer: str  # CDN 이 요구하는 Referer (페이지 origin, 예: https://missav123.com)


_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_UUID_RE = re.compile(
    r"surrit\.com/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
)

_TAIL_NUM_RE = re.compile(r"^(.*?)(\d+)$")
_TARGET_HOST = "missav123.com"


def _is_target_site(url: str) -> bool:
    hostname = (urlparse(url).hostname or "").lower()
    return hostname == _TARGET_HOST or hostname.endswith(f".{_TARGET_HOST}")


def _uses_browser_http(referer: str) -> bool:
    """CDN 요청에 browser TLS fingerprint가 필요한 대상 사이트인지 확인한다."""
    return _is_target_site(referer)


def _playwright_launch_options(page_url: str) -> dict:
    """사이트별 Playwright browser launch 옵션을 반환한다.

    대상 사이트는 headless Chromium의 TLS/browser fingerprint 연결을 reset하므로
    설치된 Google Chrome을 headed 모드로 화면 밖에서 실행해야 한다.
    """
    args = ["--disable-blink-features=AutomationControlled"]
    if _is_target_site(page_url):
        return {
            "channel": "chrome",
            "headless": False,
            "args": args
            + ["--window-position=-10000,-10000", "--window-size=1,1"],
        }
    return {"headless": True, "args": args}


def expand_range_urls(start_url: str, end_url: str) -> list[str]:
    """두 URL 의 끝 숫자 부분을 inclusive 범위로 확장한다.

    숫자 이전의 prefix 가 동일해야 하며, 자릿수가 같으면 zero-padding 을 유지하고
    다르면 padding 없이 정수 그대로 출력한다.
    """
    m1 = _TAIL_NUM_RE.match(start_url.strip())
    m2 = _TAIL_NUM_RE.match(end_url.strip())
    if not m1 or not m2:
        raise ValueError("두 URL 모두 끝이 숫자여야 합니다")
    p1, n1 = m1.group(1), m1.group(2)
    p2, n2 = m2.group(1), m2.group(2)
    if p1 != p2:
        raise ValueError(f"두 URL 의 prefix 가 다릅니다:\n  '{p1}'\n  '{p2}'")
    s, e = int(n1), int(n2)
    if s > e:
        raise ValueError(f"시작 번호({s})가 끝 번호({e})보다 큽니다")
    digits = len(n1) if len(n1) == len(n2) else 0
    if digits:
        return [f"{p1}{n:0{digits}d}" for n in range(s, e + 1)]
    return [f"{p1}{n}" for n in range(s, e + 1)]


def _origin_from_page_url(page_url: str) -> str:
    """page_url 에서 'scheme://host' 형식의 origin 만 추출."""
    p = urlparse(page_url)
    return f"{p.scheme}://{p.netloc}"


def _surrit_headers(referer: str) -> dict[str, str]:
    return {
        "User-Agent": _UA,
        "Referer": referer.rstrip("/") + "/",
        "Origin": referer,
    }


def get_hls_info(page_url: str) -> HlsInfo:
    """Playwright로 페이지를 렌더해 HLS 정보를 추출.

    추출 우선순위:
      1) `window.hls` 객체에서 직접 — missav123.com 등 HTML 에 UUID 가 박히지 않는 사이트
      2) HTML 내 `surrit.com/<uuid>` regex — legacy HTML 형식
    """
    referer = _origin_from_page_url(page_url)
    launch_options = _playwright_launch_options(page_url)

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(**launch_options)
        except Exception as exc:
            if launch_options.get("channel") == "chrome":
                raise RuntimeError(
                    "대상 사이트 분석에는 데스크톱용 Google Chrome이 필요합니다"
                ) from exc
            raise

        try:
            context_options = {"viewport": {"width": 1280, "height": 720}}
            if launch_options["headless"]:
                context_options["user_agent"] = _UA
            ctx = browser.new_context(**context_options)
            page = ctx.new_page()
            page.goto(page_url, wait_until="domcontentloaded", timeout=20000)

            info_from_js = None
            try:
                page.wait_for_function(
                    "() => window.hls && window.hls.url && (window.hls.levels||[]).length > 0",
                    timeout=12000,
                )
                info_from_js = page.evaluate(
                    """() => ({
                        masterUrl: window.hls.url,
                        levels: window.hls.levels.map(l => ({
                            height: l.height,
                            url: Array.isArray(l.url) ? l.url[0] : l.url,
                        })),
                    })"""
                )
            except Exception:
                info_from_js = None

            html = None if info_from_js else page.content()
        finally:
            browser.close()

    if info_from_js:
        levels = [
            HlsLevel(int(l["height"]), l["url"])
            for l in info_from_js["levels"]
            if l.get("url")
        ]
        if levels:
            return HlsInfo(
                master_url=info_from_js["masterUrl"],
                levels=levels,
                referer=referer,
            )

    m = _UUID_RE.search(html or "")
    if not m:
        raise ValueError(
            "페이지에서 HLS 정보를 찾을 수 없습니다 (window.hls 비어 있고 surrit UUID 도 없음)"
        )
    uuid = m.group(1)

    master_url = f"https://surrit.com/{uuid}/playlist.m3u8"
    if _uses_browser_http(referer):
        resp = curl_requests.get(
            master_url,
            headers=_surrit_headers(referer),
            impersonate="chrome",
            allow_redirects=True,
            timeout=15,
        )
    else:
        resp = httpx.get(
            master_url,
            headers=_surrit_headers(referer),
            follow_redirects=True,
            timeout=15,
        )
    resp.raise_for_status()
    levels = _parse_master(resp.text, uuid)
    if not levels:
        raise ValueError("master playlist 에서 품질 정보를 파싱할 수 없습니다")

    return HlsInfo(master_url=master_url, levels=levels, referer=referer)


def _parse_master(text: str, uuid: str) -> list[HlsLevel]:
    levels: list[HlsLevel] = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.startswith("#EXT-X-STREAM-INF"):
            continue
        res = re.search(r"RESOLUTION=\d+x(\d+)", line)
        if i + 1 >= len(lines):
            continue
        url_line = lines[i + 1].strip()
        if not url_line or url_line.startswith("#"):
            continue
        if not url_line.startswith("http"):
            url_line = f"https://surrit.com/{uuid}/{url_line}"
        height = int(res.group(1)) if res else 0
        levels.append(HlsLevel(height, url_line))
    return levels


def download_hls(
    m3u8_url: str,
    output_path: Path,
    referer: str,
    progress_cb: Callable[[int, int], None] | None = None,
) -> int:
    """m3u8 세그먼트를 병렬로 다운로드하고 output_path 에 .ts 로 저장한다.
    반환값: 다운로드한 세그먼트 수."""
    headers = _surrit_headers(referer)
    if _uses_browser_http(referer):
        client = curl_requests.Session(headers=headers, impersonate="chrome")
        request_options = {"allow_redirects": True, "timeout": 30}
    else:
        client = httpx.Client(headers=headers, follow_redirects=True, timeout=30)
        request_options = {}

    with client:
        resp = client.get(m3u8_url, **request_options)
        resp.raise_for_status()

        base = m3u8_url.rsplit("/", 1)[0] + "/"
        segments = [
            line if line.startswith("http") else base + line
            for line in resp.text.splitlines()
            if line.strip() and not line.startswith("#")
        ]
        if not segments:
            raise ValueError("세그먼트를 찾을 수 없습니다")

        total = len(segments)
        buffers: list[bytes | None] = [None] * total

        CONCURRENCY = 8
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            futures = {
                ex.submit(client.get, url, **request_options): i
                for i, url in enumerate(segments)
            }
            done = 0
            for fut in as_completed(futures):
                idx = futures[fut]
                segment_resp = fut.result()
                segment_resp.raise_for_status()
                buffers[idx] = segment_resp.content
                done += 1
                if progress_cb:
                    progress_cb(done, total)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        for chunk in buffers:
            f.write(chunk)

    return total


def build_filename(slug: str, quality: str) -> str:
    """URL 슬러그에서 안전한 파일명을 생성한다."""
    ascii_part = re.sub(r"[^\x00-\x7F].*", "", slug).rstrip()
    sanitized = re.sub(r'[<>:"/\\|?* ]', "_", ascii_part)
    sanitized = re.sub(r"_{3,}", "__", sanitized)[:60]
    return f"missav_{sanitized}_{quality}.ts"
