"""DownloadQueueManager 단위 테스트.

기본 실행: `uv run pytest` (실제 네트워크 미사용).
"""
import time
from pathlib import Path

import pytest

from queue_manager import DownloadQueueManager, QueueItem


# =================== Fixtures / Helpers ===================


def fake_download(m3u8_url: str, output_path: Path, referer: str, progress_cb=None) -> int:
    """네트워크 없이 동작하는 가짜 다운로드 함수."""
    if progress_cb:
        progress_cb(5, 10)
        progress_cb(10, 10)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"fake-segment-data")
    return 10


def slow_download(m3u8_url: str, output_path: Path, referer: str, progress_cb=None) -> int:
    """0.3초 지연 다운로드 — 큐 추가 타이밍 테스트용."""
    time.sleep(0.3)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(b"slow")
    return 1


def failing_download(m3u8_url: str, output_path: Path, referer: str, progress_cb=None) -> int:
    raise RuntimeError("network error")


def make_item(tmp_path: Path, slug: str = "test", n: int = 0) -> QueueItem:
    return QueueItem(
        item_id=f"{slug}_720p",
        url=f"https://example.com/{slug}",
        slug=slug,
        output_path=tmp_path / f"{slug}.ts",
        level_url="https://cdn.example.com/stream.m3u8",
        referer="https://example.com",
        height=720,
    )


def wait_for(predicate, timeout: float = 5.0, interval: float = 0.05) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


# =================== 상태 전이 테스트 ===================


def test_item_transitions_to_done(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download)
    item = make_item(tmp_path)
    assert item.status == "pending"

    manager.add_items([item])
    assert wait_for(lambda: item.status == "done"), f"status={item.status}"

    assert item.result["skipped"] is False
    assert item.result["n"] == 10
    assert item.result["size_mb"] > 0


def test_item_running_before_done(tmp_path):
    seen_running = []

    def tracked_download(m3u8_url, output_path, referer, progress_cb=None):
        seen_running.append(True)
        return fake_download(m3u8_url, output_path, referer, progress_cb)

    manager = DownloadQueueManager(download_fn=tracked_download)
    item = make_item(tmp_path)
    manager.add_items([item])

    assert wait_for(lambda: item.status == "done")
    assert seen_running, "download_fn should have been called"


def test_error_captured_per_item(tmp_path):
    manager = DownloadQueueManager(download_fn=failing_download)
    item = make_item(tmp_path)
    manager.add_items([item])

    assert wait_for(lambda: item.status == "error"), f"status={item.status}"
    assert "network error" in item.error


def test_skip_existing_nonempty_file(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download)
    item = make_item(tmp_path)
    item.output_path.write_bytes(b"already downloaded")

    manager.add_items([item])
    assert wait_for(lambda: item.status == "done")

    assert item.result["skipped"] is True
    assert item.result["n"] == 0


# =================== 큐 추가 테스트 ===================


def test_adding_items_while_worker_running(tmp_path):
    """다운로드 진행 중 새 아이템 추가 → 두 아이템 모두 완료."""
    manager = DownloadQueueManager(download_fn=slow_download, concurrency=1)
    item1 = make_item(tmp_path, "item1")
    item2 = make_item(tmp_path, "item2")

    manager.add_items([item1])
    # item1 이 running 상태에 들어간 직후 item2 추가
    assert wait_for(lambda: item1.status == "running")
    manager.add_items([item2])

    assert wait_for(lambda: item2.status == "done", timeout=8)
    assert item1.status == "done"


def test_duplicate_item_id_not_added_twice(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download)
    item = make_item(tmp_path)

    manager.add_items([item])
    added = manager.add_items([item])  # 동일 item_id 재추가

    assert added == 0  # 중복은 추가되지 않아야 함
    assert wait_for(lambda: item.status == "done")
    assert len(manager.get_items()) == 1


def test_multiple_items_all_complete(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download, concurrency=4)
    items = [make_item(tmp_path, f"v{i}", i) for i in range(5)]
    manager.add_items(items)

    assert wait_for(lambda: all(i.status == "done" for i in items), timeout=10)


# =================== 상태 조회 테스트 ===================


def test_is_running_false_initially():
    manager = DownloadQueueManager(download_fn=fake_download)
    assert not manager.is_running()


def test_is_running_true_while_active(tmp_path):
    manager = DownloadQueueManager(download_fn=slow_download)
    item = make_item(tmp_path)
    manager.add_items([item])

    assert wait_for(manager.is_running)
    assert wait_for(lambda: not manager.is_running(), timeout=8)


def test_get_items_returns_copy(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download)
    item = make_item(tmp_path)
    manager.add_items([item])

    snapshot = manager.get_items()
    assert snapshot is not manager.get_items()  # 매번 새 리스트


# =================== clear_done 테스트 ===================


def test_clear_done_removes_finished_items(tmp_path):
    manager = DownloadQueueManager(download_fn=fake_download)
    items = [make_item(tmp_path, f"v{i}", i) for i in range(3)]
    manager.add_items(items)

    assert wait_for(lambda: all(i.status == "done" for i in items))

    manager.clear_done()
    assert manager.get_items() == []


def test_clear_done_keeps_pending_and_running(tmp_path):
    manager = DownloadQueueManager(download_fn=slow_download, concurrency=1)
    done_item = make_item(tmp_path, "done_v")
    running_item = make_item(tmp_path, "running_v")

    # done_item 먼저 처리
    manager.add_items([done_item])
    assert wait_for(lambda: done_item.status == "done")

    manager.add_items([running_item])
    assert wait_for(lambda: running_item.status == "running")

    manager.clear_done()
    remaining = manager.get_items()
    assert done_item not in remaining
    assert running_item in remaining


# =================== progress 콜백 테스트 ===================


def test_progress_fields_updated(tmp_path):
    progress_calls = []

    def tracking_download(m3u8_url, output_path, referer, progress_cb=None):
        for i in range(1, 6):
            if progress_cb:
                progress_cb(i, 5)
                progress_calls.append((i, 5))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"x")
        return 5

    manager = DownloadQueueManager(download_fn=tracking_download)
    item = make_item(tmp_path)
    manager.add_items([item])

    assert wait_for(lambda: item.status == "done")
    assert item.done == 5
    assert item.total == 5
    assert len(progress_calls) == 5
