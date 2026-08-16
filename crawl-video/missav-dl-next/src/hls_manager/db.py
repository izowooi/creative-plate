from __future__ import annotations

import hashlib
import re
import sqlite3
import threading
import uuid
from collections.abc import Iterable
from contextlib import suppress
from pathlib import Path
from typing import Any

from .events import utc_now
from .hls import normalized_output_dir
from .models import (
    ACTIVE_STATUSES,
    ALL_STATUSES,
    RUNNING_STATUSES,
    TERMINAL_STATUSES,
    DuplicateJobError,
    InvalidTransitionError,
    JobNotFoundError,
    JobStatus,
    partial_output_path,
)


def _active_key(url: str, output_dir: str, preferred_quality: str) -> str:
    value = "\0".join((url, output_dir, preferred_quality)).encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _normalize_preferred_quality(value: str) -> str:
    preferred = value.strip().lower() or "auto"
    if preferred in {"auto", "best", "source", "original"}:
        return "auto"
    match = re.fullmatch(r"(\d{2,5})p?", preferred)
    return f"{int(match.group(1))}p" if match else preferred


def _safe_error(error: str) -> str:
    without_urls = re.sub(r"https?://[^\s<>\"']+", "<redacted-url>", error)
    return " ".join(without_urls.split())[:4_000]


class JobStore:
    """Synchronous SQLite repository used only for short, committed operations."""

    def __init__(self, path: str | Path, *, default_concurrency: int = 4) -> None:
        self.path = str(path)
        if self.path != ":memory:":
            database_path = Path(self.path)
            database_path.parent.mkdir(parents=True, exist_ok=True)
            with suppress(OSError):
                database_path.parent.chmod(0o700)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            self.path,
            timeout=5,
            isolation_level=None,
            check_same_thread=False,
        )
        self._connection.row_factory = sqlite3.Row
        if self.path != ":memory:":
            with suppress(OSError):
                Path(self.path).chmod(0o600)
        with self._lock:
            self._connection.execute("PRAGMA busy_timeout = 5000")
            self._connection.execute("PRAGMA foreign_keys = ON")
            if self.path != ":memory:":
                self._connection.execute("PRAGMA journal_mode = WAL")
                self._connection.execute("PRAGMA synchronous = NORMAL")
            self._migrate(default_concurrency)

    def _migrate(self, default_concurrency: int) -> None:
        self._connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                output_dir TEXT NOT NULL,
                preferred_quality TEXT NOT NULL,
                overwrite INTEGER NOT NULL DEFAULT 0,
                active_key TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN (
                    'queued','analyzing','downloading','paused',
                    'completed','failed','cancelled'
                )),
                slug TEXT,
                selected_quality TEXT,
                playlist_url TEXT,
                referer TEXT,
                output_path TEXT,
                completed_segments INTEGER NOT NULL DEFAULT 0,
                total_segments INTEGER NOT NULL DEFAULT 0,
                bytes_written INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                error TEXT,
                skipped INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active_key
                ON jobs(active_key)
                WHERE status IN ('queued','analyzing','downloading','paused');
            CREATE INDEX IF NOT EXISTS jobs_status_created
                ON jobs(status, created_at);
            CREATE INDEX IF NOT EXISTS jobs_updated
                ON jobs(updated_at DESC);

            CREATE TABLE IF NOT EXISTS job_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                outcome TEXT,
                error TEXT,
                completed_segments INTEGER NOT NULL DEFAULT 0,
                bytes_written INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS job_attempts_job
                ON job_attempts(job_id, id DESC);

            CREATE TABLE IF NOT EXISTS settings (
                singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
                concurrency INTEGER NOT NULL CHECK(concurrency BETWEEN 1 AND 8),
                updated_at TEXT NOT NULL
            );
            """
        )
        self._connection.execute(
            "INSERT OR IGNORE INTO settings(singleton, concurrency, updated_at) VALUES(1, ?, ?)",
            (default_concurrency, utc_now()),
        )
        self._connection.execute("PRAGMA user_version = 1")

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def ping(self) -> bool:
        with self._lock:
            return self._connection.execute("SELECT 1").fetchone()[0] == 1

    def recover_interrupted(self) -> int:
        now = utc_now()
        with self._transaction():
            rows = self._connection.execute(
                """SELECT id, output_path FROM jobs
                   WHERE status IN ('queued','analyzing','downloading','paused')"""
            ).fetchall()
            interrupted_count = int(
                self._connection.execute(
                    "SELECT COUNT(*) FROM jobs WHERE status IN ('analyzing','downloading')"
                ).fetchone()[0]
            )
            open_rows = self._connection.execute(
                """SELECT DISTINCT attempts.job_id AS id
                   FROM job_attempts AS attempts
                   JOIN jobs ON jobs.id=attempts.job_id
                   WHERE attempts.finished_at IS NULL
                     AND jobs.status IN ('queued','analyzing','downloading','paused')"""
            ).fetchall()
            for row in open_rows:
                self._finish_open_attempt(row["id"], "interrupted", None, now)
            self._connection.execute(
                """UPDATE jobs
                   SET status=CASE
                         WHEN status IN ('analyzing','downloading') THEN 'queued'
                         ELSE status END,
                       slug=NULL, selected_quality=NULL, playlist_url=NULL,
                       referer=NULL, output_path=NULL,
                       completed_segments=0, total_segments=0, bytes_written=0,
                       updated_at=?, error=NULL
                   WHERE status IN ('queued','analyzing','downloading','paused')""",
                (now,),
            )
        for row in rows:
            self._discard_partial(row["id"], row["output_path"])
        return interrupted_count

    def requeue_interrupted(self, job_id: str, expected_status: JobStatus) -> bool:
        """Retry a transient runtime interruption while preserving its attempt history."""

        now = utc_now()
        with self._transaction():
            row = self._connection.execute(
                "SELECT output_path FROM jobs WHERE id=? AND status=?",
                (job_id, expected_status),
            ).fetchone()
            changed = self._connection.execute(
                """UPDATE jobs SET status='queued', slug=NULL,
                   selected_quality=NULL, playlist_url=NULL, referer=NULL,
                   output_path=NULL, completed_segments=0, total_segments=0,
                   bytes_written=0, error=NULL, completed_at=NULL, updated_at=?
                   WHERE id=? AND status=?""",
                (now, job_id, expected_status),
            ).rowcount
            if changed:
                self._finish_open_attempt(job_id, "interrupted", None, now)
        if changed and row is not None:
            self._discard_partial(job_id, row["output_path"])
        return bool(changed)

    def create_job(
        self,
        *,
        url: str,
        output_dir: str,
        preferred_quality: str,
        overwrite: bool,
    ) -> dict[str, Any]:
        url = url.strip()
        output_dir = normalized_output_dir(output_dir)
        preferred_quality = _normalize_preferred_quality(preferred_quality)
        key = _active_key(url, output_dir, preferred_quality)
        now = utc_now()
        job_id = str(uuid.uuid4())
        try:
            with self._transaction():
                self._connection.execute(
                    """INSERT INTO jobs(
                        id,url,output_dir,preferred_quality,overwrite,active_key,status,
                        created_at,updated_at
                    ) VALUES(?,?,?,?,?,?,'queued',?,?)""",
                    (
                        job_id,
                        url,
                        output_dir,
                        preferred_quality,
                        int(overwrite),
                        key,
                        now,
                        now,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            with self._lock:
                existing = self._connection.execute(
                    """SELECT id FROM jobs
                       WHERE active_key=?
                         AND status IN ('queued','analyzing','downloading','paused')""",
                    (key,),
                ).fetchone()
            if existing:
                raise DuplicateJobError(existing["id"]) from exc
            raise
        return self.get_job(job_id)

    def get_record(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            row = self._connection.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None:
            raise JobNotFoundError(job_id)
        return dict(row)

    def get_job(self, job_id: str) -> dict[str, Any]:
        return self.serialize(self.get_record(job_id))

    def dashboard(
        self,
        *,
        status: str | None = None,
        search: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[dict[str, int], list[dict[str, Any]], int]:
        if status is not None and status not in ALL_STATUSES:
            raise ValueError("unknown status")
        clauses: list[str] = []
        parameters: list[Any] = []
        if status:
            clauses.append("status=?")
            parameters.append(status)
        if search.strip():
            clauses.append("(url LIKE ? ESCAPE '\\' OR output_dir LIKE ? ESCAPE '\\')")
            escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            parameters.extend((pattern, pattern))
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        with self._lock:
            count = self._connection.execute(
                f"SELECT COUNT(*) FROM jobs{where}", parameters
            ).fetchone()[0]
            rows = self._connection.execute(
                f"SELECT * FROM jobs{where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (*parameters, limit, offset),
            ).fetchall()
            status_rows = self._connection.execute(
                "SELECT status, COUNT(*) AS count FROM jobs GROUP BY status"
            ).fetchall()
        summary = {name: 0 for name in ALL_STATUSES}
        for row in status_rows:
            summary[row["status"]] = row["count"]
        summary["total"] = sum(summary.values())
        summary["active"] = sum(summary[name] for name in ("analyzing", "downloading", "paused"))
        return summary, [self.serialize(dict(row)) for row in rows], count

    def get_settings(self) -> dict[str, Any]:
        with self._lock:
            row = self._connection.execute(
                "SELECT concurrency, updated_at FROM settings WHERE singleton=1"
            ).fetchone()
        return {"concurrency": row["concurrency"], "updatedAt": row["updated_at"]}

    def set_concurrency(self, concurrency: int) -> dict[str, Any]:
        if not 1 <= concurrency <= 8:
            raise ValueError("concurrency must be between 1 and 8")
        now = utc_now()
        with self._lock:
            self._connection.execute(
                "UPDATE settings SET concurrency=?, updated_at=? WHERE singleton=1",
                (concurrency, now),
            )
        return {"concurrency": concurrency, "updatedAt": now}

    def recent_output_dirs(self, limit: int = 5) -> list[str]:
        with self._lock:
            rows = self._connection.execute(
                """SELECT output_dir, MAX(updated_at) AS recent
                   FROM jobs GROUP BY output_dir ORDER BY recent DESC LIMIT ?""",
                (limit,),
            ).fetchall()
        return [row["output_dir"] for row in rows]

    def claim_for_analysis(self, limit: int) -> list[dict[str, Any]]:
        return self._claim(
            "playlist_url IS NULL",
            "analyzing",
            limit,
        )

    def claim_for_download(self, limit: int) -> list[dict[str, Any]]:
        return self._claim(
            "playlist_url IS NOT NULL",
            "downloading",
            limit,
        )

    def count_ready_for_download(self) -> int:
        with self._lock:
            return int(
                self._connection.execute(
                    """SELECT COUNT(*) FROM jobs
                       WHERE status='queued' AND playlist_url IS NOT NULL"""
                ).fetchone()[0]
            )

    def _claim(self, extra_where: str, status: JobStatus, limit: int) -> list[dict[str, Any]]:
        if limit <= 0:
            return []
        now = utc_now()
        claimed: list[dict[str, Any]] = []
        with self._transaction():
            rows = self._connection.execute(
                f"""SELECT * FROM jobs
                    WHERE status='queued' AND {extra_where}
                    ORDER BY created_at ASC LIMIT ?""",
                (limit,),
            ).fetchall()
            for row in rows:
                changed = self._connection.execute(
                    """UPDATE jobs SET status=?, updated_at=?,
                       started_at=COALESCE(started_at, ?)
                       WHERE id=? AND status='queued'""",
                    (status, now, now, row["id"]),
                ).rowcount
                if not changed:
                    continue
                if self._open_attempt_id(row["id"]) is None:
                    self._connection.execute(
                        "INSERT INTO job_attempts(job_id, started_at) VALUES(?,?)",
                        (row["id"], now),
                    )
                    self._connection.execute(
                        "UPDATE jobs SET attempts=attempts+1 WHERE id=?", (row["id"],)
                    )
                claimed.append(self.get_record(row["id"]))
        return claimed

    def save_analysis(
        self,
        job_id: str,
        *,
        slug: str,
        selected_quality: str,
        playlist_url: str,
        referer: str,
        output_path: str,
    ) -> bool:
        with self._lock:
            changed = self._connection.execute(
                """UPDATE jobs SET status='queued', slug=?, selected_quality=?,
                   playlist_url=?, referer=?, output_path=?, error=NULL, updated_at=?
                   WHERE id=? AND status='analyzing'""",
                (
                    slug,
                    selected_quality,
                    playlist_url,
                    referer,
                    output_path,
                    utc_now(),
                    job_id,
                ),
            ).rowcount
        return bool(changed)

    def update_progress(
        self,
        job_id: str,
        *,
        completed_segments: int,
        total_segments: int,
        bytes_written: int,
    ) -> bool:
        with self._lock:
            changed = self._connection.execute(
                """UPDATE jobs SET completed_segments=?, total_segments=?,
                   bytes_written=?, updated_at=?
                   WHERE id=? AND status='downloading'""",
                (completed_segments, total_segments, bytes_written, utc_now(), job_id),
            ).rowcount
        return bool(changed)

    def complete_job(
        self,
        job_id: str,
        *,
        output_path: str,
        completed_segments: int,
        total_segments: int,
        bytes_written: int,
        skipped: bool,
    ) -> bool:
        now = utc_now()
        with self._transaction():
            changed = self._connection.execute(
                """UPDATE jobs SET status='completed', output_path=?,
                   completed_segments=?, total_segments=?, bytes_written=?, skipped=?,
                   playlist_url=NULL, referer=NULL, error=NULL, updated_at=?, completed_at=?
                   WHERE id=? AND status='downloading'""",
                (
                    output_path,
                    completed_segments,
                    total_segments,
                    bytes_written,
                    int(skipped),
                    now,
                    now,
                    job_id,
                ),
            ).rowcount
            if changed:
                self._finish_open_attempt(
                    job_id,
                    "completed",
                    None,
                    now,
                    completed_segments,
                    bytes_written,
                )
        return bool(changed)

    def fail_job(self, job_id: str, expected_status: JobStatus, error: str) -> bool:
        now = utc_now()
        error = _safe_error(error)
        with self._transaction():
            changed = self._connection.execute(
                """UPDATE jobs SET status='failed', playlist_url=NULL, referer=NULL,
                   error=?, updated_at=?, completed_at=?
                   WHERE id=? AND status=?""",
                (error, now, now, job_id, expected_status),
            ).rowcount
            if changed:
                row = self._connection.execute(
                    "SELECT completed_segments, bytes_written FROM jobs WHERE id=?", (job_id,)
                ).fetchone()
                self._finish_open_attempt(
                    job_id,
                    "failed",
                    error,
                    now,
                    row["completed_segments"],
                    row["bytes_written"],
                )
        return bool(changed)

    def pause(self, job_id: str) -> dict[str, Any]:
        return self._transition(job_id, ACTIVE_STATUSES[:3], "paused", "paused")

    def resume(self, job_id: str) -> dict[str, Any]:
        return self._transition(job_id, ("paused",), "queued", None)

    def cancel(self, job_id: str) -> dict[str, Any]:
        return self._transition(job_id, ACTIVE_STATUSES, "cancelled", "cancelled")

    def retry(self, job_id: str) -> dict[str, Any]:
        record = self.get_record(job_id)
        if record["status"] not in {"failed", "cancelled"}:
            raise InvalidTransitionError("only failed or cancelled jobs can be retried")
        now = utc_now()
        with self._lock:
            try:
                self._connection.execute(
                    """UPDATE jobs SET status='queued', slug=NULL,
                       selected_quality=NULL, playlist_url=NULL, referer=NULL,
                       output_path=NULL, completed_segments=0,
                       total_segments=0, bytes_written=0, error=NULL, skipped=0,
                       completed_at=NULL, updated_at=? WHERE id=?""",
                    (now, job_id),
                )
            except sqlite3.IntegrityError as exc:
                existing = self._connection.execute(
                    """SELECT id FROM jobs WHERE active_key=? AND id<>?
                       AND status IN ('queued','analyzing','downloading','paused')""",
                    (record["active_key"], job_id),
                ).fetchone()
                raise DuplicateJobError(existing["id"] if existing else "") from exc
        self._discard_partial(job_id, record["output_path"])
        return self.get_job(job_id)

    def retry_failed(self) -> int:
        ids = self._ids_with_status(("failed",))
        updated = 0
        for job_id in ids:
            try:
                self.retry(job_id)
            except DuplicateJobError:
                continue
            updated += 1
        return updated

    def cancel_all(self) -> tuple[int, list[str]]:
        ids = self._ids_with_status(ACTIVE_STATUSES)
        updated = 0
        for job_id in ids:
            try:
                self.cancel(job_id)
            except InvalidTransitionError:
                continue
            updated += 1
        return updated, ids

    def reset_running_for_shutdown(self) -> list[str]:
        now = utc_now()
        ids = self._ids_with_status(RUNNING_STATUSES)
        with self._transaction():
            cleanup_rows = self._connection.execute(
                """SELECT id, output_path FROM jobs
                   WHERE status IN ('queued','analyzing','downloading','paused')"""
            ).fetchall()
            open_rows = self._connection.execute(
                """SELECT DISTINCT attempts.job_id AS id
                   FROM job_attempts AS attempts
                   JOIN jobs ON jobs.id=attempts.job_id
                   WHERE attempts.finished_at IS NULL
                     AND jobs.status IN ('queued','analyzing','downloading','paused')"""
            ).fetchall()
            self._connection.execute(
                """UPDATE jobs SET
                   status=CASE
                     WHEN status IN ('analyzing','downloading') THEN 'queued'
                     ELSE status END,
                   slug=NULL,
                   selected_quality=NULL, playlist_url=NULL, referer=NULL,
                   output_path=NULL, completed_segments=0, total_segments=0,
                   bytes_written=0, error=NULL, updated_at=?
                   WHERE status IN ('queued','analyzing','downloading','paused')""",
                (now,),
            )
            for row in open_rows:
                self._finish_open_attempt(row["id"], "interrupted", None, now)
        for row in cleanup_rows:
            self._discard_partial(row["id"], row["output_path"])
        return ids

    def delete_terminal(self, job_id: str) -> None:
        record = self.get_record(job_id)
        if record["status"] not in TERMINAL_STATUSES:
            raise InvalidTransitionError("only terminal jobs can be deleted")
        with self._lock:
            self._connection.execute("DELETE FROM jobs WHERE id=?", (job_id,))
        self._discard_partial(job_id, record["output_path"])

    @staticmethod
    def _discard_partial(job_id: str, output_path: str | None) -> None:
        if not output_path:
            return
        with suppress(OSError, ValueError):
            partial_output_path(output_path, job_id).unlink(missing_ok=True)

    def _transition(
        self,
        job_id: str,
        allowed_from: Iterable[JobStatus],
        to_status: JobStatus,
        attempt_outcome: str | None,
    ) -> dict[str, Any]:
        record = self.get_record(job_id)
        allowed = tuple(allowed_from)
        if record["status"] not in allowed:
            raise InvalidTransitionError(f"cannot change {record['status']} job to {to_status}")
        now = utc_now()
        placeholders = ",".join("?" for _ in allowed)
        with self._transaction():
            changed = self._connection.execute(
                f"""UPDATE jobs SET status=?, updated_at=?,
                    playlist_url=CASE WHEN ?='cancelled' THEN NULL ELSE playlist_url END,
                    referer=CASE WHEN ?='cancelled' THEN NULL ELSE referer END,
                    completed_at=CASE WHEN ? IN ('cancelled','completed','failed')
                                      THEN ? ELSE completed_at END
                    WHERE id=? AND status IN ({placeholders})""",
                (to_status, now, to_status, to_status, to_status, now, job_id, *allowed),
            ).rowcount
            if not changed:
                raise InvalidTransitionError("job status changed concurrently")
            if attempt_outcome:
                current = self._connection.execute(
                    "SELECT completed_segments, bytes_written FROM jobs WHERE id=?", (job_id,)
                ).fetchone()
                self._finish_open_attempt(
                    job_id,
                    attempt_outcome,
                    None,
                    now,
                    current["completed_segments"],
                    current["bytes_written"],
                )
        return self.get_job(job_id)

    def _ids_with_status(self, statuses: Iterable[JobStatus]) -> list[str]:
        values = tuple(statuses)
        if not values:
            return []
        placeholders = ",".join("?" for _ in values)
        with self._lock:
            rows = self._connection.execute(
                f"SELECT id FROM jobs WHERE status IN ({placeholders})", values
            ).fetchall()
        return [row["id"] for row in rows]

    def _open_attempt_id(self, job_id: str) -> int | None:
        row = self._connection.execute(
            """SELECT id FROM job_attempts
               WHERE job_id=? AND finished_at IS NULL ORDER BY id DESC LIMIT 1""",
            (job_id,),
        ).fetchone()
        return row["id"] if row else None

    def _finish_open_attempt(
        self,
        job_id: str,
        outcome: str,
        error: str | None,
        finished_at: str,
        completed_segments: int = 0,
        bytes_written: int = 0,
    ) -> None:
        attempt_id = self._open_attempt_id(job_id)
        if attempt_id is None:
            return
        self._connection.execute(
            """UPDATE job_attempts SET finished_at=?, outcome=?, error=?,
               completed_segments=?, bytes_written=? WHERE id=?""",
            (
                finished_at,
                outcome,
                error,
                completed_segments,
                bytes_written,
                attempt_id,
            ),
        )

    def attempt_history(self, job_id: str) -> list[dict[str, Any]]:
        self.get_record(job_id)
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM job_attempts WHERE job_id=? ORDER BY id DESC", (job_id,)
            ).fetchall()
        return [dict(row) for row in rows]

    @staticmethod
    def serialize(record: dict[str, Any]) -> dict[str, Any]:
        total = int(record["total_segments"])
        completed = int(record["completed_segments"])
        percent = round(completed * 100 / total, 1) if total else 0.0
        return {
            "id": record["id"],
            "url": record["url"],
            "outputDir": record["output_dir"],
            "preferredQuality": record["preferred_quality"],
            "overwrite": bool(record["overwrite"]),
            "status": record["status"],
            "slug": record["slug"],
            "selectedQuality": record["selected_quality"],
            "outputPath": record["output_path"],
            "progress": {
                "completedSegments": completed,
                "totalSegments": total,
                "bytesWritten": int(record["bytes_written"]),
                "percent": percent,
            },
            "attempts": int(record["attempts"]),
            "completedSegments": completed,
            "totalSegments": total,
            "bytesWritten": int(record["bytes_written"]),
            "error": record["error"],
            "skipped": bool(record["skipped"]),
            "createdAt": record["created_at"],
            "updatedAt": record["updated_at"],
            "startedAt": record["started_at"],
            "completedAt": record["completed_at"],
            "finishedAt": record["completed_at"],
        }

    class _Transaction:
        def __init__(self, store: JobStore) -> None:
            self.store = store

        def __enter__(self) -> None:
            self.store._lock.acquire()
            try:
                self.store._connection.execute("BEGIN IMMEDIATE")
            except BaseException:
                self.store._lock.release()
                raise

        def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
            try:
                self.store._connection.execute("ROLLBACK" if exc_type else "COMMIT")
            finally:
                self.store._lock.release()

    def _transaction(self) -> _Transaction:
        return self._Transaction(self)
