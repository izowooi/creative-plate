"""대상 한 건을 받아 추출하고 결과를 묶는다. CLI 와 웹앱이 공유한다."""
from __future__ import annotations

import threading
import time
from collections import OrderedDict, deque
from dataclasses import dataclass, field
from typing import Callable, Iterable
from urllib.parse import unquote, urlsplit

from .extract import Document, ExtractError, extract_document
from .fetch import FetchFailed, Fetcher, RawPage
from .targets import Target

# 링크를 따라갈 때 건너뛰는 이름공간 (문서가 아닌 분류·파일·틀 등)
_SKIP_NAMESPACES = {"분류", "파일", "틀", "사용자", "나무위키", "휴지통"}


@dataclass
class CrawlResult:
    key: str
    title: str                                  # 요청한 문서명
    status: str                                 # ok | not_found | error
    doc: Document | None = None
    page: RawPage | None = None
    css: dict[str, str] = field(default_factory=dict)   # 스킨 CSS URL -> 캐시 키
    error: str | None = None
    elapsed: float = 0.0

    @property
    def redirected_from(self) -> str | None:
        return self.title if self.doc and self.doc.title != self.title else None


class Crawler:
    def __init__(self, fetcher: Fetcher, memo_size: int = 32):
        self.fetcher = fetcher
        self._memo: OrderedDict[tuple[str, float], Document] = OrderedDict()
        self._memo_size = memo_size
        self._memo_lock = threading.Lock()

    def crawl(self, target: Target, *, refresh: bool = False) -> CrawlResult:
        started = time.monotonic()
        key = self.fetcher.key(target.title)
        try:
            page = self.fetcher.get(target.title, refresh=refresh)
        except FetchFailed as e:
            return CrawlResult(key, target.title, "error", error=f"모든 수집 방법이 실패했습니다: {e}",
                               elapsed=time.monotonic() - started)
        return self._finish(key, target.title, page, started)

    def load(self, key: str) -> CrawlResult | None:
        """캐시에 있는 문서를 네트워크 없이 다시 연다(만료 여부는 보지 않는다)."""
        page = self.fetcher.read_cache_by_key(key)
        return self._finish(key, page.title, page, time.monotonic()) if page else None

    def _finish(self, key: str, title: str, page: RawPage, started: float) -> CrawlResult:
        if page.status == 404:
            return CrawlResult(key, title, "not_found", page=page, elapsed=time.monotonic() - started)
        try:
            doc = self._extract(key, page)
        except ExtractError as e:
            return CrawlResult(key, title, "error", page=page, error=str(e), elapsed=time.monotonic() - started)
        css = self.fetcher.ensure_css(doc.stylesheets)
        return CrawlResult(key, title, "ok", doc=doc, page=page, css=css, elapsed=time.monotonic() - started)

    def _extract(self, key: str, page: RawPage) -> Document:
        memo_key = (key, page.fetched_at)
        with self._memo_lock:
            if memo_key in self._memo:
                self._memo.move_to_end(memo_key)
                return self._memo[memo_key]
        doc = extract_document(page.html, page.url)
        with self._memo_lock:
            self._memo[memo_key] = doc
            while len(self._memo) > self._memo_size:
                self._memo.popitem(last=False)
        return doc

    def crawl_many(self, targets: Iterable[Target], *, follow: str | None = None, depth: int = 1,
                   limit: int = 50, refresh: bool = False,
                   on_result: Callable[[CrawlResult], None] | None = None) -> list[CrawlResult]:
        """follow 가 "subdocs"/"links" 면 수집한 문서의 링크를 depth 단계까지 따라간다. limit 은 전체 문서 수 상한."""
        queue = deque((t, 0) for t in targets)
        seen = {t.title for t, _ in queue}
        results: list[CrawlResult] = []
        while queue and len(results) < limit:
            target, level = queue.popleft()
            result = self.crawl(target, refresh=refresh)
            results.append(result)
            if on_result:
                on_result(result)
            if follow and level < depth and result.status == "ok":
                for nxt in follow_targets(result, follow):
                    if nxt.title not in seen:
                        seen.add(nxt.title)
                        queue.append((nxt, level + 1))
        return results


def follow_targets(result: CrawlResult, scope: str) -> list[Target]:
    """수집한 문서에서 이어서 수집할 후보. subdocs 는 '문서명/...' 하위 문서만, links 는 본문 내 모든 문서 링크."""
    if result.doc is None:
        return []
    prefix = result.doc.title + "/"
    found: list[Target] = []
    for link in result.doc.links:
        title = unquote(urlsplit(link.url).path[len("/w/"):])
        if not title or title == result.doc.title:
            continue
        if title.split(":", 1)[0] in _SKIP_NAMESPACES and ":" in title:
            continue
        if scope == "subdocs" and not title.startswith(prefix):
            continue
        found.append(Target(title, link.url))
    return found
