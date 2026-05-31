"""비동기 다운로드 큐 매니저.

- Streamlit에 의존하지 않는다 (st.* 호출 없음).
- DownloadQueueManager 는 app.py 에서 @st.cache_resource 로 싱글턴 유지.
- QueueItem 은 평면 값(level_url, referer, height)만 보유한다.
  HlsInfo 객체는 app.py 에서 pick_level 로 해결한 뒤 전달한다.
"""
from __future__ import annotations

import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable


@dataclass
class QueueItem:
    item_id: str          # 중복 방지 키 (slug_heightp)
    url: str              # 원본 페이지 URL (표시용)
    slug: str
    output_path: Path
    level_url: str        # m3u8 URL
    referer: str
    height: int           # 선택된 화질 (px)
    status: str = "pending"   # pending | running | done | error
    done: int = 0
    total: int = 0
    result: dict = field(default_factory=dict)
    error: str = ""


class DownloadQueueManager:
    """스레드 안전 다운로드 큐 + 백그라운드 워커."""

    def __init__(
        self,
        download_fn: Callable | None = None,
        concurrency: int = 4,
    ) -> None:
        from downloader import download_hls  # 순환 import 방지

        self._download_fn = download_fn or download_hls
        self._concurrency = concurrency

        self._lock = threading.Lock()
        self._items: list[QueueItem] = []
        self._work_queue: queue.Queue = queue.Queue()
        self._worker: threading.Thread | None = None

    # ------------------------------------------------------------------ public

    def add_items(self, items: list[QueueItem]) -> int:
        """아이템을 큐에 추가한다. 이미 있는 item_id 는 무시. 추가된 수를 반환."""
        with self._lock:
            existing_ids = {i.item_id for i in self._items}
            new_items = [i for i in items if i.item_id not in existing_ids]
            self._items.extend(new_items)

        for item in new_items:
            self._work_queue.put(item)

        if new_items:
            self._ensure_worker()

        return len(new_items)

    def get_items(self) -> list[QueueItem]:
        """현재 큐의 스냅샷(얕은 복사)을 반환한다."""
        with self._lock:
            return list(self._items)

    def is_running(self) -> bool:
        with self._lock:
            return any(i.status in ("pending", "running") for i in self._items)

    def clear_done(self) -> None:
        """완료·오류 아이템을 목록에서 제거한다. 진행 중인 아이템은 유지."""
        with self._lock:
            self._items = [
                i for i in self._items if i.status in ("pending", "running")
            ]

    def set_concurrency(self, n: int) -> None:
        """다음 워커 시작 시 적용할 동시 처리 수를 설정한다."""
        self._concurrency = n

    # ------------------------------------------------------------------ private

    def _ensure_worker(self) -> None:
        with self._lock:
            if self._worker is not None and self._worker.is_alive():
                return
            self._worker = threading.Thread(
                target=self._run_worker, daemon=True
            )
            self._worker.start()

    def _run_worker(self) -> None:
        """큐에서 아이템을 꺼내 ThreadPoolExecutor 로 처리한다."""
        with ThreadPoolExecutor(max_workers=self._concurrency) as pool:
            active: set = set()

            while True:
                # 대기 중인 아이템을 모두 제출
                while True:
                    try:
                        item = self._work_queue.get_nowait()
                        active.add(pool.submit(self._process_one, item))
                    except queue.Empty:
                        break

                # 완료된 future 정리
                finished = {f for f in active if f.done()}
                active -= finished

                if active or not self._work_queue.empty():
                    time.sleep(0.1)
                    continue

                # 빈 큐 + 활성 작업 없음 → 짧게 대기 후 재확인 (race condition 방지)
                time.sleep(0.2)
                if self._work_queue.empty() and not active:
                    break

    def _process_one(self, item: QueueItem) -> None:
        with self._lock:
            item.status = "running"

        try:
            if item.output_path.exists() and item.output_path.stat().st_size > 0:
                with self._lock:
                    item.status = "done"
                    item.result = {
                        "output": str(item.output_path),
                        "size_mb": item.output_path.stat().st_size / 1024 / 1024,
                        "n": 0,
                        "quality": f"{item.height}p",
                        "skipped": True,
                    }
                return

            def _cb(done: int, total: int) -> None:
                with self._lock:
                    item.done = done
                    item.total = total

            n = self._download_fn(item.level_url, item.output_path, item.referer, _cb)

            with self._lock:
                item.status = "done"
                item.result = {
                    "output": str(item.output_path),
                    "size_mb": item.output_path.stat().st_size / 1024 / 1024,
                    "n": n,
                    "quality": f"{item.height}p",
                    "skipped": False,
                }

        except Exception as exc:
            with self._lock:
                item.status = "error"
                item.error = str(exc)
