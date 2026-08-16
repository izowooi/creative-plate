from __future__ import annotations

from pathlib import Path

import pytest

from hls_manager.db import JobStore
from hls_manager.models import DuplicateJobError, InvalidTransitionError, partial_output_path


@pytest.fixture
def store(tmp_path: Path) -> JobStore:
    value = JobStore(tmp_path / "jobs.sqlite3")
    yield value
    value.close()


def create(store: JobStore, tmp_path: Path, suffix: str = "1") -> dict:
    return store.create_job(
        url=f"https://example.com/video{suffix}",
        output_dir=str(tmp_path),
        preferred_quality="720p",
        overwrite=False,
    )


def ready_for_download(store: JobStore, job_id: str, tmp_path: Path) -> dict:
    analysis = store.claim_for_analysis(1)[0]
    assert analysis["id"] == job_id
    assert store.save_analysis(
        job_id,
        slug="video",
        selected_quality="720p",
        playlist_url="https://cdn.example/media.m3u8?secret=1",
        referer="https://example.com",
        output_path=str(tmp_path / "video.ts"),
    )
    return store.claim_for_download(1)[0]


def test_duplicate_is_blocked_only_while_active(store: JobStore, tmp_path: Path) -> None:
    first = create(store, tmp_path)
    with pytest.raises(DuplicateJobError) as duplicate:
        create(store, tmp_path)
    assert duplicate.value.existing_job_id == first["id"]

    store.cancel(first["id"])
    second = create(store, tmp_path)
    assert second["id"] != first["id"]


def test_equivalent_quality_spellings_share_the_active_key(store: JobStore, tmp_path: Path) -> None:
    store.create_job(
        url="https://example.com/video",
        output_dir=str(tmp_path),
        preferred_quality="720",
        overwrite=False,
    )
    with pytest.raises(DuplicateJobError):
        store.create_job(
            url="https://example.com/video",
            output_dir=str(tmp_path),
            preferred_quality="720p",
            overwrite=False,
        )


def test_failure_history_survives_retry_and_retry_forces_reanalysis(
    store: JobStore, tmp_path: Path
) -> None:
    job = create(store, tmp_path)
    ready_for_download(store, job["id"], tmp_path)
    store.update_progress(job["id"], completed_segments=3, total_segments=10, bytes_written=123)
    assert store.fail_job(job["id"], "downloading", "network secret detail")

    public = store.get_job(job["id"])
    assert public["status"] == "failed"
    assert "playlistUrl" not in public and "referer" not in public
    assert public["attempts"] == 1
    assert store.attempt_history(job["id"])[0]["error"] == "network secret detail"

    retried = store.retry(job["id"])
    record = store.get_record(job["id"])
    assert retried["status"] == "queued"
    assert record["playlist_url"] is None
    assert record["referer"] is None
    assert record["output_path"] is None
    assert retried["completedSegments"] == 0
    assert store.attempt_history(job["id"])[0]["error"] == "network secret detail"


def test_recovery_requeues_running_and_clears_resolved_urls(
    store: JobStore, tmp_path: Path
) -> None:
    job = create(store, tmp_path)
    ready_for_download(store, job["id"], tmp_path)
    record_before = store.get_record(job["id"])
    stale_part = partial_output_path(record_before["output_path"], job["id"])
    stale_part.write_bytes(b"partial")
    assert store.recover_interrupted() == 1
    record = store.get_record(job["id"])
    assert record["status"] == "queued"
    assert record["playlist_url"] is None
    assert record["referer"] is None
    assert record["completed_segments"] == 0
    assert store.attempt_history(job["id"])[0]["outcome"] == "interrupted"
    assert not stale_part.exists()


def test_transient_interruption_requeues_and_closes_attempt(
    store: JobStore, tmp_path: Path
) -> None:
    job = create(store, tmp_path)
    claimed = store.claim_for_analysis(1)[0]
    assert claimed["attempts"] == 1
    assert store.requeue_interrupted(job["id"], "analyzing")
    assert store.get_job(job["id"])["status"] == "queued"
    assert store.attempt_history(job["id"])[0]["outcome"] == "interrupted"


def test_terminal_only_delete(store: JobStore, tmp_path: Path) -> None:
    job = create(store, tmp_path)
    with pytest.raises(InvalidTransitionError):
        store.delete_terminal(job["id"])
    store.cancel(job["id"])
    store.delete_terminal(job["id"])
    with pytest.raises(LookupError):
        store.get_job(job["id"])


def test_dashboard_summary_does_not_count_queued_as_active(store: JobStore, tmp_path: Path) -> None:
    create(store, tmp_path, "1")
    paused = create(store, tmp_path, "2")
    store.pause(paused["id"])
    summary, jobs, total = store.dashboard(limit=10)
    assert total == 2 and len(jobs) == 2
    assert summary["queued"] == 1
    assert summary["paused"] == 1
    assert summary["active"] == 1
