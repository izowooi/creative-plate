from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal

from remind_prompt.errors import InvalidTransition, ReminderNotFound, VersionConflict
from remind_prompt.time_utils import to_db, utc_now

LifecycleStatus = Literal["open", "acknowledged", "completed", "cancelled"]


SCHEMA = """
PRAGMA foreign_keys = ON;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    destination_label TEXT NOT NULL,
    destination_url TEXT,
    project TEXT,
    notes TEXT,
    source_label TEXT,
    source_ref TEXT,
    timezone TEXT NOT NULL,
    due_at TEXT NOT NULL,
    due_local TEXT NOT NULL,
    schedule_expression TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'completed', 'cancelled')),
    occurrence_version INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_version > 0),
    notification_sequence INTEGER NOT NULL DEFAULT 1 CHECK (notification_sequence > 0),
    next_notification_at TEXT,
    last_notified_at TEXT,
    notification_count INTEGER NOT NULL DEFAULT 0 CHECK (notification_count >= 0),
    consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
    last_notification_error TEXT,
    claim_token TEXT,
    claimed_until TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    acknowledged_at TEXT,
    completed_at TEXT,
    cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_due
    ON reminders(status, next_notification_at, claimed_until);
CREATE INDEX IF NOT EXISTS idx_reminders_display
    ON reminders(status, due_at);

CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
    occurrence_version INTEGER NOT NULL,
    sequence INTEGER NOT NULL,
    channel TEXT NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'in_flight', 'sent', 'failed', 'waiting_config', 'suppressed')
    ),
    scheduled_for TEXT NOT NULL,
    first_attempted_at TEXT NOT NULL,
    last_attempted_at TEXT NOT NULL,
    sent_at TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    http_status INTEGER,
    last_error TEXT,
    lease_token TEXT,
    UNIQUE(reminder_id, occurrence_version, sequence, channel)
);

CREATE INDEX IF NOT EXISTS idx_deliveries_reminder
    ON deliveries(reminder_id, last_attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_status
    ON deliveries(status, last_attempted_at);

CREATE TABLE IF NOT EXISTS reminder_events (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    occurrence_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    details_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reminder_events_reminder
    ON reminder_events(reminder_id, created_at DESC);

CREATE TABLE IF NOT EXISTS worker_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    heartbeat_at TEXT,
    last_scan_at TEXT,
    last_success_at TEXT,
    last_error TEXT
);

PRAGMA user_version = 1;
"""


def _row_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row is not None else None


class Database:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path) if str(path) != ":memory:" else Path(":memory:")

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(str(self.path), timeout=5)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        connection.execute("PRAGMA synchronous = FULL")
        return connection

    def initialize(self) -> None:
        if str(self.path) != ":memory:":
            self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
        if str(self.path) != ":memory:":
            self.path.chmod(0o600)

    def check(self) -> bool:
        with self.connect() as connection:
            return connection.execute("SELECT 1").fetchone()[0] == 1

    @staticmethod
    def _event(
        connection: sqlite3.Connection,
        reminder_id: str,
        event_type: str,
        occurrence_version: int,
        now: datetime,
        details: dict[str, Any] | None = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO reminder_events (
                id, reminder_id, event_type, occurrence_version, created_at, details_json
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                reminder_id,
                event_type,
                occurrence_version,
                to_db(now),
                json.dumps(details or {}, ensure_ascii=False, separators=(",", ":")),
            ),
        )

    @staticmethod
    def _get_in_connection(connection: sqlite3.Connection, reminder_id: str) -> sqlite3.Row:
        row = connection.execute("SELECT * FROM reminders WHERE id = ?", (reminder_id,)).fetchone()
        if row is None:
            raise ReminderNotFound(reminder_id)
        return row

    @staticmethod
    def _check_version(row: sqlite3.Row, expected_version: int | None) -> None:
        if expected_version is not None and row["occurrence_version"] != expected_version:
            raise VersionConflict(row["occurrence_version"])

    def create_reminder(
        self,
        *,
        title: str,
        prompt_text: str,
        destination_label: str,
        destination_url: str | None,
        project: str | None,
        notes: str | None,
        source_label: str | None,
        source_ref: str | None,
        timezone: str,
        due_at: datetime,
        due_local: str,
        schedule_expression: str,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        reminder_id = str(uuid.uuid4())
        timestamp = to_db(now)
        due_timestamp = to_db(due_at)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO reminders (
                    id, title, prompt_text, destination_label, destination_url, project, notes,
                    source_label, source_ref, timezone, due_at, due_local, schedule_expression,
                    status, occurrence_version, notification_sequence, next_notification_at,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, 1, ?, ?, ?)
                """,
                (
                    reminder_id,
                    title,
                    prompt_text,
                    destination_label,
                    destination_url,
                    project,
                    notes,
                    source_label,
                    source_ref,
                    timezone,
                    due_timestamp,
                    due_local,
                    schedule_expression,
                    due_timestamp,
                    timestamp,
                    timestamp,
                ),
            )
            self._event(connection, reminder_id, "created", 1, now)
        return self.get_reminder(reminder_id)

    def get_reminder(self, reminder_id: str) -> dict[str, Any]:
        with self.connect() as connection:
            return dict(self._get_in_connection(connection, reminder_id))

    def list_reminders(
        self,
        *,
        view: str = "active",
        query: str | None = None,
        now: datetime | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        now_text = to_db(now or utc_now())
        clauses: list[str] = []
        parameters: list[Any] = []
        view_clauses = {
            "active": "status IN ('open', 'acknowledged')",
            "overdue": "status = 'open' AND due_at <= ?",
            "upcoming": "status = 'open' AND due_at > ?",
            "acknowledged": "status = 'acknowledged'",
            "completed": "status = 'completed'",
            "cancelled": "status = 'cancelled'",
            "all": "1 = 1",
        }
        if view not in view_clauses:
            raise ValueError(f"Unsupported reminder view: {view}")
        clauses.append(view_clauses[view])
        if view in {"overdue", "upcoming"}:
            parameters.append(now_text)
        if query:
            escaped = query.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            pattern = f"%{escaped}%"
            clauses.append(
                """(
                    LOWER(title) LIKE ? ESCAPE '\\' OR
                    LOWER(prompt_text) LIKE ? ESCAPE '\\' OR
                    LOWER(destination_label) LIKE ? ESCAPE '\\' OR
                    LOWER(COALESCE(project, '')) LIKE ? ESCAPE '\\'
                )"""
            )
            parameters.extend([pattern] * 4)
        parameters.extend([now_text, limit])
        sql = f"""
            SELECT * FROM reminders
            WHERE {" AND ".join(clauses)}
            ORDER BY
                CASE
                    WHEN status = 'open' AND due_at <= ? THEN 0
                    WHEN status = 'open' THEN 1
                    WHEN status = 'acknowledged' THEN 2
                    WHEN status = 'completed' THEN 3
                    ELSE 4
                END,
                CASE WHEN status IN ('completed', 'cancelled') THEN updated_at ELSE due_at END ASC
            LIMIT ?
        """
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(sql, parameters).fetchall()]

    def counts(self, *, now: datetime | None = None) -> dict[str, int]:
        now_text = to_db(now or utc_now())
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                    SUM(CASE WHEN status = 'open' AND due_at <= ? THEN 1 ELSE 0 END) AS overdue,
                    SUM(CASE WHEN status = 'open' AND due_at > ? THEN 1 ELSE 0 END) AS upcoming,
                    SUM(CASE WHEN status = 'acknowledged' THEN 1 ELSE 0 END) AS acknowledged,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
                FROM reminders
                """,
                (now_text, now_text),
            ).fetchone()
            # sqlite3.Row iterates values; keys() is required here.
            return {key: int(row[key] or 0) for key in row.keys()}  # noqa: SIM118

    def update_reminder(
        self,
        reminder_id: str,
        *,
        changes: dict[str, Any],
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        allowed = {
            "title",
            "prompt_text",
            "destination_label",
            "destination_url",
            "project",
            "notes",
            "source_label",
            "source_ref",
            "timezone",
            "due_at",
            "due_local",
            "schedule_expression",
        }
        unknown = set(changes) - allowed
        if unknown:
            raise ValueError(f"Unsupported reminder fields: {', '.join(sorted(unknown))}")
        if not changes:
            return self.get_reminder(reminder_id)

        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_in_connection(connection, reminder_id)
            self._check_version(row, expected_version)
            due_changed = "due_at" in changes and changes["due_at"] != row["due_at"]
            if due_changed and row["status"] in {"completed", "cancelled"}:
                raise InvalidTransition("Reopen the reminder before changing its due time")

            assignments = [f"{key} = ?" for key in changes]
            values = list(changes.values())
            new_version = row["occurrence_version"]
            if due_changed:
                new_version += 1
                assignments.extend(
                    [
                        "status = 'open'",
                        "occurrence_version = ?",
                        "notification_sequence = 1",
                        "next_notification_at = ?",
                        "consecutive_failures = 0",
                        "last_notification_error = NULL",
                        "claim_token = NULL",
                        "claimed_until = NULL",
                        "acknowledged_at = NULL",
                    ]
                )
                values.extend([new_version, changes["due_at"]])
            assignments.append("updated_at = ?")
            values.extend([to_db(now), reminder_id])
            connection.execute(
                f"UPDATE reminders SET {', '.join(assignments)} WHERE id = ?", values
            )
            self._event(
                connection,
                reminder_id,
                "rescheduled" if due_changed else "updated",
                new_version,
                now,
                {"fields": sorted(changes)},
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_reminder(reminder_id)

    def acknowledge(
        self,
        reminder_id: str,
        *,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._transition(
            reminder_id,
            target="acknowledged",
            expected_version=expected_version,
            now=now,
        )

    def complete(
        self,
        reminder_id: str,
        *,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._transition(
            reminder_id,
            target="completed",
            expected_version=expected_version,
            now=now,
        )

    def cancel(
        self,
        reminder_id: str,
        *,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        return self._transition(
            reminder_id,
            target="cancelled",
            expected_version=expected_version,
            now=now,
        )

    def _transition(
        self,
        reminder_id: str,
        *,
        target: LifecycleStatus,
        expected_version: int | None,
        now: datetime | None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_in_connection(connection, reminder_id)
            self._check_version(row, expected_version)
            current = row["status"]
            if current == target:
                connection.commit()
                return dict(row)
            if current in {"completed", "cancelled"}:
                raise InvalidTransition(
                    f"Cannot move {current} reminder to {target}; reopen it first"
                )
            if target not in {"acknowledged", "completed", "cancelled"}:
                raise InvalidTransition(f"Unsupported transition to {target}")
            timestamp_column = {
                "acknowledged": "acknowledged_at",
                "completed": "completed_at",
                "cancelled": "cancelled_at",
            }[target]
            connection.execute(
                f"""
                UPDATE reminders
                SET status = ?, {timestamp_column} = ?, next_notification_at = NULL,
                    claim_token = NULL, claimed_until = NULL, updated_at = ?
                WHERE id = ?
                """,
                (target, to_db(now), to_db(now), reminder_id),
            )
            self._event(connection, reminder_id, target, row["occurrence_version"], now)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_reminder(reminder_id)

    def snooze(
        self,
        reminder_id: str,
        *,
        due_at: datetime,
        due_local: str,
        schedule_expression: str,
        timezone: str,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_in_connection(connection, reminder_id)
            self._check_version(row, expected_version)
            if row["status"] in {"completed", "cancelled"}:
                raise InvalidTransition("Cannot snooze a completed or cancelled reminder")
            new_version = row["occurrence_version"] + 1
            due_text = to_db(due_at)
            connection.execute(
                """
                UPDATE reminders
                SET status = 'open', occurrence_version = ?, notification_sequence = 1,
                    due_at = ?, due_local = ?, schedule_expression = ?, timezone = ?,
                    next_notification_at = ?, consecutive_failures = 0,
                    last_notification_error = NULL, claim_token = NULL, claimed_until = NULL,
                    acknowledged_at = NULL, updated_at = ?
                WHERE id = ?
                """,
                (
                    new_version,
                    due_text,
                    due_local,
                    schedule_expression,
                    timezone,
                    due_text,
                    to_db(now),
                    reminder_id,
                ),
            )
            self._event(connection, reminder_id, "snoozed", new_version, now)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_reminder(reminder_id)

    def reopen(
        self,
        reminder_id: str,
        *,
        due_at: datetime | None,
        due_local: str | None,
        schedule_expression: str | None,
        timezone: str | None,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_in_connection(connection, reminder_id)
            self._check_version(row, expected_version)
            if row["status"] not in {"completed", "cancelled"}:
                raise InvalidTransition("Only completed or cancelled reminders can be reopened")
            new_version = row["occurrence_version"] + 1
            due_text = to_db(due_at) if due_at is not None else row["due_at"]
            connection.execute(
                """
                UPDATE reminders
                SET status = 'open', occurrence_version = ?, notification_sequence = 1,
                    due_at = ?, due_local = ?, schedule_expression = ?, timezone = ?,
                    next_notification_at = ?, consecutive_failures = 0,
                    last_notification_error = NULL, claim_token = NULL, claimed_until = NULL,
                    acknowledged_at = NULL, completed_at = NULL, cancelled_at = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    new_version,
                    due_text,
                    due_local or row["due_local"],
                    schedule_expression or row["schedule_expression"],
                    timezone or row["timezone"],
                    due_text,
                    to_db(now),
                    reminder_id,
                ),
            )
            self._event(connection, reminder_id, "reopened", new_version, now)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_reminder(reminder_id)

    def retry_notification(
        self,
        reminder_id: str,
        *,
        expected_version: int | None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        now = now or utc_now()
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            row = self._get_in_connection(connection, reminder_id)
            self._check_version(row, expected_version)
            if row["status"] != "open":
                raise InvalidTransition("Only open reminders can retry a notification")
            connection.execute(
                """
                UPDATE reminders
                SET next_notification_at = ?, consecutive_failures = 0,
                    last_notification_error = NULL, claim_token = NULL,
                    claimed_until = NULL, updated_at = ?
                WHERE id = ?
                """,
                (to_db(now), to_db(now), reminder_id),
            )
            self._event(
                connection,
                reminder_id,
                "notification_retry_requested",
                row["occurrence_version"],
                now,
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return self.get_reminder(reminder_id)

    def claim_due(
        self,
        *,
        now: datetime | None = None,
        lease_seconds: int = 120,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        now = now or utc_now()
        now_text = to_db(now)
        lease_until = to_db(now + timedelta(seconds=lease_seconds))
        claims: list[dict[str, Any]] = []
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            rows = connection.execute(
                """
                SELECT * FROM reminders
                WHERE status = 'open'
                    AND next_notification_at IS NOT NULL
                    AND next_notification_at <= ?
                    AND (claimed_until IS NULL OR claimed_until < ?)
                ORDER BY next_notification_at ASC
                LIMIT ?
                """,
                (now_text, now_text, limit),
            ).fetchall()
            for row in rows:
                claim_token = str(uuid.uuid4())
                connection.execute(
                    """
                    UPDATE reminders SET claim_token = ?, claimed_until = ?
                    WHERE id = ? AND occurrence_version = ? AND status = 'open'
                    """,
                    (
                        claim_token,
                        lease_until,
                        row["id"],
                        row["occurrence_version"],
                    ),
                )
                delivery_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO deliveries (
                        id, reminder_id, occurrence_version, sequence, channel, status,
                        scheduled_for, first_attempted_at, last_attempted_at, attempt_count,
                        lease_token
                    ) VALUES (?, ?, ?, ?, 'slack', 'in_flight', ?, ?, ?, 1, ?)
                    ON CONFLICT(reminder_id, occurrence_version, sequence, channel)
                    DO UPDATE SET
                        status = 'in_flight',
                        last_attempted_at = excluded.last_attempted_at,
                        attempt_count = deliveries.attempt_count + 1,
                        lease_token = excluded.lease_token
                    """,
                    (
                        delivery_id,
                        row["id"],
                        row["occurrence_version"],
                        row["notification_sequence"],
                        row["next_notification_at"],
                        now_text,
                        now_text,
                        claim_token,
                    ),
                )
                delivery = connection.execute(
                    """
                    SELECT * FROM deliveries
                    WHERE reminder_id = ? AND occurrence_version = ?
                        AND sequence = ? AND channel = 'slack'
                    """,
                    (
                        row["id"],
                        row["occurrence_version"],
                        row["notification_sequence"],
                    ),
                ).fetchone()
                claims.append(
                    {
                        "reminder": dict(row),
                        "claim_token": claim_token,
                        "delivery_id": delivery["id"],
                        "sequence": row["notification_sequence"],
                        "occurrence_version": row["occurrence_version"],
                    }
                )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()
        return claims

    def finish_delivery(
        self,
        claim: dict[str, Any],
        *,
        outcome: Literal["sent", "failed", "waiting_config", "suppressed"],
        now: datetime | None = None,
        retry_at: datetime | None = None,
        follow_up_at: datetime | None = None,
        error: str | None = None,
        http_status: int | None = None,
    ) -> bool:
        now = now or utc_now()
        safe_error = error[:500] if error else None
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            sent_at = to_db(now) if outcome == "sent" else None
            updated = connection.execute(
                """
                UPDATE deliveries
                SET status = ?, sent_at = ?, http_status = ?, last_error = ?, lease_token = NULL
                WHERE id = ? AND lease_token = ?
                """,
                (
                    outcome,
                    sent_at,
                    http_status,
                    safe_error,
                    claim["delivery_id"],
                    claim["claim_token"],
                ),
            )
            if updated.rowcount == 0:
                connection.rollback()
                return False

            reminder = self._get_in_connection(connection, claim["reminder"]["id"])
            is_current_claim = (
                reminder["claim_token"] == claim["claim_token"]
                and reminder["occurrence_version"] == claim["occurrence_version"]
                and reminder["notification_sequence"] == claim["sequence"]
            )
            if is_current_claim:
                if outcome == "sent" and reminder["status"] == "open":
                    connection.execute(
                        """
                        UPDATE reminders
                        SET notification_sequence = notification_sequence + 1,
                            next_notification_at = ?, last_notified_at = ?,
                            notification_count = notification_count + 1,
                            consecutive_failures = 0, last_notification_error = NULL,
                            claim_token = NULL, claimed_until = NULL, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            to_db(follow_up_at) if follow_up_at else None,
                            to_db(now),
                            to_db(now),
                            reminder["id"],
                        ),
                    )
                elif outcome in {"failed", "waiting_config"} and reminder["status"] == "open":
                    failure_increment = 1 if outcome == "failed" else 0
                    connection.execute(
                        """
                        UPDATE reminders
                        SET next_notification_at = ?,
                            consecutive_failures = consecutive_failures + ?,
                            last_notification_error = ?, claim_token = NULL,
                            claimed_until = NULL, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            to_db(retry_at) if retry_at else None,
                            failure_increment,
                            safe_error,
                            to_db(now),
                            reminder["id"],
                        ),
                    )
                else:
                    connection.execute(
                        """
                        UPDATE reminders SET claim_token = NULL, claimed_until = NULL
                        WHERE id = ? AND claim_token = ?
                        """,
                        (reminder["id"], claim["claim_token"]),
                    )
            self._event(
                connection,
                reminder["id"],
                f"notification_{outcome}",
                claim["occurrence_version"],
                now,
                {
                    "channel": "slack",
                    "sequence": claim["sequence"],
                    "http_status": http_status,
                },
            )
            connection.commit()
            return True
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def deliveries_for(self, reminder_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            self._get_in_connection(connection, reminder_id)
            rows = connection.execute(
                """
                SELECT id, reminder_id, occurrence_version, sequence, channel, status,
                       scheduled_for, first_attempted_at, last_attempted_at, sent_at,
                       attempt_count, http_status, last_error
                FROM deliveries WHERE reminder_id = ?
                ORDER BY occurrence_version DESC, sequence DESC
                """,
                (reminder_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def events_for(self, reminder_id: str) -> list[dict[str, Any]]:
        with self.connect() as connection:
            self._get_in_connection(connection, reminder_id)
            rows = connection.execute(
                """
                SELECT id, event_type, occurrence_version, created_at, details_json
                FROM reminder_events WHERE reminder_id = ?
                ORDER BY created_at DESC, rowid DESC
                """,
                (reminder_id,),
            ).fetchall()
            result: list[dict[str, Any]] = []
            for row in rows:
                item = dict(row)
                item["details"] = json.loads(item.pop("details_json"))
                result.append(item)
            return result

    def update_worker_state(
        self,
        *,
        now: datetime | None = None,
        success: bool,
        error: str | None = None,
    ) -> None:
        now = now or utc_now()
        timestamp = to_db(now)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO worker_state (
                    singleton, heartbeat_at, last_scan_at, last_success_at, last_error
                ) VALUES (1, ?, ?, ?, ?)
                ON CONFLICT(singleton) DO UPDATE SET
                    heartbeat_at = excluded.heartbeat_at,
                    last_scan_at = excluded.last_scan_at,
                    last_success_at = CASE
                        WHEN excluded.last_error IS NULL THEN excluded.last_success_at
                        ELSE worker_state.last_success_at
                    END,
                    last_error = excluded.last_error
                """,
                (
                    timestamp,
                    timestamp,
                    timestamp if success else None,
                    error[:500] if error else None,
                ),
            )

    def worker_state(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            return _row_dict(
                connection.execute("SELECT * FROM worker_state WHERE singleton = 1").fetchone()
            )

    def failed_delivery_count(self) -> int:
        with self.connect() as connection:
            return int(
                connection.execute(
                    "SELECT COUNT(*) FROM deliveries WHERE status IN ('failed', 'waiting_config')"
                ).fetchone()[0]
            )

    def backup_to(self, destination: Path) -> None:
        destination.parent.mkdir(parents=True, exist_ok=True)
        source = self.connect()
        target = sqlite3.connect(str(destination))
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()
        destination.chmod(0o600)

    def delete_reminders(self, reminder_ids: Iterable[str]) -> int:
        """Reserved for explicit maintenance tooling; the web UI uses cancellation instead."""
        ids = list(reminder_ids)
        if not ids:
            return 0
        placeholders = ",".join("?" for _ in ids)
        with self.connect() as connection:
            result = connection.execute(f"DELETE FROM reminders WHERE id IN ({placeholders})", ids)
            return result.rowcount
