import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable
from urllib.parse import urlparse

import httpx
from playwright.sync_api import sync_playwright


@dataclass
class HlsLevel:
    height: int
    url: str


@dataclass
class HlsInfo:
    master_url: str
    levels: list[HlsLevel]
    referer: str  # CDN 이 요구하는 Referer (페이지 origin, 예: https://missav.ws)


_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

_UUID_RE = re.compile(
    r"surrit\.com/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
)

_TAIL_NUM_RE = re.compile(r"^(.*?)(\d+)$")


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
    """Playwright(headless) 로 페이지를 렌더해 HLS 정보를 추출.

    추출 우선순위:
      1) `window.hls` 객체에서 직접 — missav.ws 등 HTML 에 UUID 가 박히지 않는 사이트
      2) HTML 내 `surrit.com/<uuid>` regex — legacy missav.ai 형식
    """
    referer = _origin_from_page_url(page_url)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"],
        )
        ctx = browser.new_context(
            user_agent=_UA,
            viewport={"width": 1280, "height": 720},
        )
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
    resp = httpx.get(master_url, headers=_surrit_headers(referer), timeout=15)
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
    resp = httpx.get(m3u8_url, headers=headers, follow_redirects=True, timeout=30)
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
    with httpx.Client(headers=headers, timeout=30) as client:
        with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
            futures = {ex.submit(client.get, url): i for i, url in enumerate(segments)}
            done = 0
            for fut in as_completed(futures):
                idx = futures[fut]
                buffers[idx] = fut.result().content
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
