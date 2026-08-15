from datetime import UTC, datetime, timedelta

import pytest

from remind_prompt.database import Database
from remind_prompt.errors import InvalidTransition, VersionConflict

NOW = datetime(2026, 8, 15, 12, tzinfo=UTC)


@pytest.fixture
def database(tmp_path) -> Database:
    db = Database(tmp_path / "reminders.db")
    db.initialize()
    return db


def create_reminder(database: Database, *, due_at: datetime | None = None) -> dict:
    due_at = due_at or NOW + timedelta(days=1)
    return database.create_reminder(
        title="모델 결과 다시 확인",
        prompt_text="지난 결과와 새 결과를 비교해 주세요.",
        destination_label="Claude 프로젝트 세션",
        destination_url=None,
        project="research",
        notes=None,
        source_label="task summary",
        source_ref="2026/08/example.md:12",
        timezone="Asia/Seoul",
        due_at=due_at,
        due_local="2026-08-16T21:00:00",
        schedule_expression="1 day",
        now=NOW,
    )


def test_create_list_and_counts(database: Database) -> None:
    created = create_reminder(database)

    assert created["status"] == "open"
    assert created["occurrence_version"] == 1
    assert database.list_reminders(view="upcoming", now=NOW)[0]["id"] == created["id"]
    assert database.counts(now=NOW) == {
        "overdue": 0,
        "upcoming": 1,
        "acknowledged": 0,
        "completed": 0,
        "cancelled": 0,
    }


def test_database_file_is_private(database: Database) -> None:
    assert database.path.stat().st_mode & 0o777 == 0o600


def test_acknowledge_stops_notifications_but_keeps_task_open(database: Database) -> None:
    reminder = create_reminder(database, due_at=NOW)

    acknowledged = database.acknowledge(
        reminder["id"], expected_version=1, now=NOW + timedelta(minutes=1)
    )

    assert acknowledged["status"] == "acknowledged"
    assert acknowledged["next_notification_at"] is None
    assert database.counts(now=NOW + timedelta(minutes=1))["acknowledged"] == 1


def test_snooze_increments_occurrence_and_rejects_stale_action(database: Database) -> None:
    reminder = create_reminder(database, due_at=NOW)
    snoozed = database.snooze(
        reminder["id"],
        due_at=NOW + timedelta(hours=1),
        due_local="2026-08-15T22:00:00",
        schedule_expression="1 hour",
        timezone="Asia/Seoul",
        expected_version=1,
        now=NOW,
    )

    assert snoozed["occurrence_version"] == 2
    assert snoozed["notification_sequence"] == 1
    with pytest.raises(VersionConflict):
        database.snooze(
            reminder["id"],
            due_at=NOW + timedelta(hours=2),
            due_local="2026-08-15T23:00:00",
            schedule_expression="2 hours",
            timezone="Asia/Seoul",
            expected_version=1,
            now=NOW,
        )


def test_completed_reminder_requires_explicit_reopen(database: Database) -> None:
    reminder = create_reminder(database)
    completed = database.complete(reminder["id"], expected_version=1, now=NOW)

    assert completed["status"] == "completed"
    with pytest.raises(InvalidTransition):
        database.acknowledge(reminder["id"], expected_version=1, now=NOW)

    reopened = database.reopen(
        reminder["id"],
        due_at=NOW + timedelta(days=2),
        due_local="2026-08-17T21:00:00",
        schedule_expression="reopen",
        timezone="Asia/Seoul",
        expected_version=1,
        now=NOW,
    )
    assert reopened["status"] == "open"
    assert reopened["occurrence_version"] == 2


def test_due_claim_is_leased_and_recovers_after_expiry(database: Database) -> None:
    reminder = create_reminder(database, due_at=NOW)

    first = database.claim_due(now=NOW, lease_seconds=60)
    duplicate = database.claim_due(now=NOW + timedelta(seconds=30), lease_seconds=60)
    recovered = database.claim_due(now=NOW + timedelta(seconds=61), lease_seconds=60)

    assert len(first) == 1
    assert duplicate == []
    assert len(recovered) == 1
    assert recovered[0]["reminder"]["id"] == reminder["id"]
    assert recovered[0]["delivery_id"] == first[0]["delivery_id"]
    assert database.deliveries_for(reminder["id"])[0]["attempt_count"] == 2


def test_successful_delivery_schedules_one_follow_up(database: Database) -> None:
    reminder = create_reminder(database, due_at=NOW)
    claim = database.claim_due(now=NOW)[0]

    assert database.finish_delivery(
        claim,
        outcome="sent",
        now=NOW,
        follow_up_at=NOW + timedelta(hours=24),
        http_status=200,
    )

    updated = database.get_reminder(reminder["id"])
    assert updated["notification_count"] == 1
    assert updated["notification_sequence"] == 2
    assert updated["next_notification_at"] == "2026-08-16T12:00:00Z"
    assert database.claim_due(now=NOW + timedelta(hours=23)) == []
    assert len(database.claim_due(now=NOW + timedelta(hours=24))) == 1


def test_completion_after_claim_suppresses_state_progression(database: Database) -> None:
    reminder = create_reminder(database, due_at=NOW)
    claim = database.claim_due(now=NOW)[0]
    database.complete(reminder["id"], expected_version=1, now=NOW)

    database.finish_delivery(claim, outcome="suppressed", now=NOW)

    updated = database.get_reminder(reminder["id"])
    assert updated["status"] == "completed"
    assert updated["notification_count"] == 0
    assert database.deliveries_for(reminder["id"])[0]["status"] == "suppressed"
