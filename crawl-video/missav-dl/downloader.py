import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from playwright.sync_api import sync_playwright


@dataclass
class HlsLevel:
    height: int
    url: str


@dataclass
class HlsInfo:
    master_url: str
    levels: list[HlsLevel]


_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_SURRIT_HEADERS = {
    "User-Agent": _UA,
    "Referer": "https://missav.ai/",
    "Origin": "https://missav.ai",
}

_UUID_RE = re.compile(
    r"surrit\.com/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"
)


def get_hls_info(page_url: str) -> HlsInfo:
    """Playwright(headless)로 페이지를 렌더링해 UUID를 추출한 뒤
    master playlist를 fetch해 품질 목록을 반환한다."""
    # 1. 페이지 렌더링 — window.hls는 headless에서 초기화 안 됨.
    #    대신 서버가 HTML에 surrit.com UUID를 직접 삽입하므로 page.content()로 추출.
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
        page.wait_for_timeout(2000)
        html = page.content()
        browser.close()

    # 2. UUID 추출
    m = _UUID_RE.search(html)
    if not m:
        raise ValueError("페이지에서 surrit.com UUID를 찾을 수 없습니다")
    uuid = m.group(1)

    # 3. Master playlist fetch → 품질 목록
    master_url = f"https://surrit.com/{uuid}/playlist.m3u8"
    resp = httpx.get(master_url, headers=_SURRIT_HEADERS, timeout=15)
    resp.raise_for_status()

    levels = _parse_master(resp.text, uuid)
    if not levels:
        raise ValueError("master playlist에서 품질 정보를 파싱할 수 없습니다")

    return HlsInfo(master_url=master_url, levels=levels)


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
    progress_cb: Callable[[int, int], None] | None = None,
) -> int:
    """m3u8 세그먼트를 병렬로 다운로드하고 output_path에 .ts 파일로 저장한다.
    반환값: 다운로드한 세그먼트 수."""
    resp = httpx.get(m3u8_url, headers=_SURRIT_HEADERS, follow_redirects=True, timeout=30)
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
    with httpx.Client(headers=_SURRIT_HEADERS, timeout=30) as client:
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
