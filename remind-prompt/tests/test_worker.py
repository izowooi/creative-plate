from datetime import UTC, datetime, timedelta

import pytest

from remind_prompt.config import Settings
from remind_prompt.database import Database
from remind_prompt.slack import SlackResult
from remind_prompt.worker import NotificationWorker

NOW = datetime(2026, 8, 15, 12, tzinfo=UTC)


class FakeNotifier:
    def __init__(self, result: SlackResult, *, configured: bool = True) -> None:
        self.result = result
        self.configured = configured
        self.sent: list[dict] = []

    async def send(self, reminder: dict) -> SlackResult:
        self.sent.append(reminder)
        return self.result


def make_settings(tmp_path, *, webhook: str | None = "https://example.test") -> Settings:
    return Settings(
        database_path=tmp_path / "db.sqlite",
        slack_webhook_url=webhook,
        retry_initial_seconds=60,
        retry_max_seconds=600,
        missing_config_retry_seconds=300,
    )


def seed_due(database: Database) -> dict:
    return database.create_reminder(
        title="후속 프롬프트",
        prompt_text="결과를 비교해 주세요.",
        destination_label="AI 세션",
        destination_url=None,
        project=None,
        notes=None,
        source_label=None,
        source_ref=None,
        timezone="Asia/Seoul",
        due_at=NOW,
        due_local="2026-08-15T21:00:00",
        schedule_expression="exact",
        now=NOW - timedelta(days=1),
    )


@pytest.mark.asyncio
async def test_worker_sends_due_and_schedules_daily_follow_up(tmp_path) -> None:
    settings = make_settings(tmp_path)
    database = Database(settings.database_path)
    database.initialize()
    reminder = seed_due(database)
    notifier = FakeNotifier(SlackResult(success=True, http_status=200))
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)

    report = await worker.dispatch_once()

    assert report.sent == 1
    assert notifier.sent[0]["id"] == reminder["id"]
    updated = database.get_reminder(reminder["id"])
    assert updated["next_notification_at"] == "2026-08-16T12:00:00Z"
    assert database.worker_state()["last_success_at"] == "2026-08-15T12:00:00Z"


@pytest.mark.asyncio
async def test_worker_claims_each_delivery_immediately_before_sending(tmp_path) -> None:
    settings = make_settings(tmp_path)
    database = Database(settings.database_path)
    database.initialize()
    first = seed_due(database)
    second = seed_due(database)
    notifier = FakeNotifier(SlackResult(success=True, http_status=200))
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)
    claim_limits: list[int] = []
    original_claim_due = database.claim_due

    def recording_claim_due(**kwargs):
        claim_limits.append(kwargs["limit"])
        return original_claim_due(**kwargs)

    database.claim_due = recording_claim_due  # type: ignore[method-assign]

    report = await worker.dispatch_once()

    assert report.claimed == 2
    assert {item["id"] for item in notifier.sent} == {first["id"], second["id"]}
    assert claim_limits == [1, 1, 1]


@pytest.mark.asyncio
async def test_worker_keeps_overdue_visible_when_slack_is_not_configured(tmp_path) -> None:
    settings = make_settings(tmp_path, webhook=None)
    database = Database(settings.database_path)
    database.initialize()
    reminder = seed_due(database)
    notifier = FakeNotifier(SlackResult(success=False), configured=False)
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)

    report = await worker.dispatch_once()

    assert report.waiting_config == 1
    updated = database.get_reminder(reminder["id"])
    assert updated["status"] == "open"
    assert updated["last_notification_error"]
    assert updated["next_notification_at"] == "2026-08-15T12:05:00Z"


@pytest.mark.asyncio
async def test_worker_stops_retrying_permanent_slack_error(tmp_path) -> None:
    settings = make_settings(tmp_path)
    database = Database(settings.database_path)
    database.initialize()
    reminder = seed_due(database)
    notifier = FakeNotifier(
        SlackResult(
            success=False,
            http_status=403,
            error="Slack returned HTTP 403: action_prohibited",
            retryable=False,
        )
    )
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)

    report = await worker.dispatch_once()

    assert report.failed == 1
    updated = database.get_reminder(reminder["id"])
    assert updated["next_notification_at"] is None
    assert updated["last_notification_error"].startswith("Slack returned HTTP 403")


@pytest.mark.asyncio
async def test_worker_retries_temporary_failure_with_backoff(tmp_path) -> None:
    settings = make_settings(tmp_path)
    database = Database(settings.database_path)
    database.initialize()
    reminder = seed_due(database)
    notifier = FakeNotifier(
        SlackResult(success=False, http_status=503, error="temporary", retryable=True)
    )
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)

    await worker.dispatch_once()

    updated = database.get_reminder(reminder["id"])
    retry_at = datetime.fromisoformat(updated["next_notification_at"].replace("Z", "+00:00"))
    assert NOW + timedelta(seconds=60) <= retry_at <= NOW + timedelta(seconds=66)


@pytest.mark.asyncio
async def test_worker_never_retries_before_slack_retry_after(tmp_path) -> None:
    settings = make_settings(tmp_path)
    database = Database(settings.database_path)
    database.initialize()
    reminder = seed_due(database)
    notifier = FakeNotifier(
        SlackResult(
            success=False,
            http_status=429,
            error="rate limited",
            retryable=True,
            retry_after_seconds=300,
        )
    )
    worker = NotificationWorker(settings, database, notifier, clock=lambda: NOW)

    await worker.dispatch_once()

    updated = database.get_reminder(reminder["id"])
    assert updated["next_notification_at"] == "2026-08-15T12:05:00Z"
