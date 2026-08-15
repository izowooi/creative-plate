from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from datetime import datetime, timedelta

from remind_prompt.config import Settings
from remind_prompt.database import Database
from remind_prompt.errors import ReminderNotFound
from remind_prompt.slack import SlackNotifier
from remind_prompt.time_utils import utc_now


@dataclass(frozen=True, slots=True)
class DispatchReport:
    claimed: int = 0
    sent: int = 0
    failed: int = 0
    waiting_config: int = 0
    suppressed: int = 0


class NotificationWorker:
    def __init__(
        self,
        settings: Settings,
        database: Database,
        notifier: SlackNotifier,
        *,
        clock: Callable[[], datetime] = utc_now,
    ) -> None:
        self.settings = settings
        self.database = database
        self.notifier = notifier
        self.clock = clock

    def _retry_delay(self, reminder: dict, retry_after_seconds: int | None) -> int:
        failures = min(int(reminder["consecutive_failures"]), 12)
        exponential = min(
            self.settings.retry_initial_seconds * (2**failures),
            self.settings.retry_max_seconds,
        )
        identity = (
            f"{reminder['id']}:{reminder['occurrence_version']}:"
            f"{reminder['notification_sequence']}:{failures}"
        ).encode()
        jitter_ratio = int.from_bytes(hashlib.sha256(identity).digest()[:2], "big") / 65_535
        jittered = int(exponential * (1 + jitter_ratio * 0.1))
        return max(jittered, retry_after_seconds or 0)

    async def dispatch_once(self) -> DispatchReport:
        claimed = sent = failed = waiting_config = suppressed = 0
        # Claim immediately before each send. Holding a whole batch under one lease
        # lets later claims expire while earlier network calls are still in flight.
        for _ in range(self.settings.batch_size):
            now = self.clock()
            claims = self.database.claim_due(
                now=now,
                lease_seconds=self.settings.claim_lease_seconds,
                limit=1,
            )
            if not claims:
                break
            claim = claims[0]
            claimed += 1
            try:
                current = self.database.get_reminder(claim["reminder"]["id"])
            except ReminderNotFound:
                suppressed += 1
                continue
            if (
                current["status"] != "open"
                or current["occurrence_version"] != claim["occurrence_version"]
                or current["notification_sequence"] != claim["sequence"]
            ):
                self.database.finish_delivery(claim, outcome="suppressed", now=now)
                suppressed += 1
                continue

            if not self.notifier.configured:
                self.database.finish_delivery(
                    claim,
                    outcome="waiting_config",
                    now=now,
                    retry_at=now + timedelta(seconds=self.settings.missing_config_retry_seconds),
                    error="Slack Incoming Webhook이 설정되지 않았습니다.",
                )
                waiting_config += 1
                continue

            result = await self.notifier.send(current)
            finished_at = self.clock()
            if result.success:
                self.database.finish_delivery(
                    claim,
                    outcome="sent",
                    now=finished_at,
                    follow_up_at=finished_at + timedelta(hours=self.settings.follow_up_hours),
                    http_status=result.http_status,
                )
                sent += 1
                continue

            retry_at = None
            if result.retryable:
                retry_at = finished_at + timedelta(
                    seconds=self._retry_delay(current, result.retry_after_seconds)
                )
            self.database.finish_delivery(
                claim,
                outcome="failed",
                now=finished_at,
                retry_at=retry_at,
                error=result.error,
                http_status=result.http_status,
            )
            failed += 1

        report = DispatchReport(
            claimed=claimed,
            sent=sent,
            failed=failed,
            waiting_config=waiting_config,
            suppressed=suppressed,
        )
        self.database.update_worker_state(now=self.clock(), success=True)
        return report

    async def run(self, stop_event: asyncio.Event) -> None:
        while not stop_event.is_set():
            try:
                await self.dispatch_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # the loop must survive one bad scan
                now = self.clock()
                self.database.update_worker_state(
                    now=now,
                    success=False,
                    error=f"{type(exc).__name__}: worker scan failed",
                )
            with suppress(TimeoutError):
                await asyncio.wait_for(
                    stop_event.wait(), timeout=self.settings.poll_interval_seconds
                )
