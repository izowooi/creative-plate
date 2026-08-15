from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ConfigurationError(ValueError):
    """Raised when runtime configuration is invalid."""


def _positive_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigurationError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ConfigurationError(f"{name} must be at least {minimum}")
    return value


@dataclass(frozen=True, slots=True)
class Settings:
    database_path: Path
    timezone: str = "Asia/Seoul"
    slack_webhook_url: str | None = field(default=None, repr=False)
    base_url: str = "http://127.0.0.1:8765"
    host: str = "127.0.0.1"
    port: int = 8765
    poll_interval_seconds: int = 30
    follow_up_hours: int = 24
    retry_initial_seconds: int = 300
    retry_max_seconds: int = 21_600
    missing_config_retry_seconds: int = 300
    claim_lease_seconds: int = 120
    batch_size: int = 50
    slack_prompt_max_chars: int = 1_200

    def __post_init__(self) -> None:
        try:
            ZoneInfo(self.timezone)
        except ZoneInfoNotFoundError as exc:
            raise ConfigurationError(f"Unknown IANA timezone: {self.timezone}") from exc
        parsed_base_url = urlparse(self.base_url)
        if parsed_base_url.scheme not in {"http", "https"} or not parsed_base_url.netloc:
            raise ConfigurationError("base_url must be an http(s) URL")
        if not 1 <= self.port <= 65_535:
            raise ConfigurationError("port must be between 1 and 65535")
        for field_name in (
            "poll_interval_seconds",
            "follow_up_hours",
            "retry_initial_seconds",
            "retry_max_seconds",
            "missing_config_retry_seconds",
            "claim_lease_seconds",
            "batch_size",
        ):
            if getattr(self, field_name) < 1:
                raise ConfigurationError(f"{field_name} must be positive")
        if self.slack_prompt_max_chars < 0:
            raise ConfigurationError("slack_prompt_max_chars cannot be negative")
        if self.slack_prompt_max_chars > 2_800:
            raise ConfigurationError("slack_prompt_max_chars cannot exceed 2800")

    @classmethod
    def from_env(cls) -> Settings:
        database_path = Path(
            os.environ.get("REMIND_PROMPT_DATABASE_PATH", "./data/remind-prompt.db")
        ).expanduser()
        webhook = os.environ.get("REMIND_PROMPT_SLACK_WEBHOOK_URL", "").strip() or None
        return cls(
            database_path=database_path,
            timezone=os.environ.get("REMIND_PROMPT_TIMEZONE", "Asia/Seoul"),
            slack_webhook_url=webhook,
            base_url=os.environ.get("REMIND_PROMPT_BASE_URL", "http://127.0.0.1:8765").rstrip("/"),
            host=os.environ.get("REMIND_PROMPT_HOST", "127.0.0.1"),
            port=_positive_int("REMIND_PROMPT_PORT", 8765),
            poll_interval_seconds=_positive_int("REMIND_PROMPT_POLL_INTERVAL_SECONDS", 30),
            follow_up_hours=_positive_int("REMIND_PROMPT_FOLLOW_UP_HOURS", 24),
            retry_initial_seconds=_positive_int("REMIND_PROMPT_RETRY_INITIAL_SECONDS", 300),
            retry_max_seconds=_positive_int("REMIND_PROMPT_RETRY_MAX_SECONDS", 21_600),
            missing_config_retry_seconds=_positive_int(
                "REMIND_PROMPT_MISSING_CONFIG_RETRY_SECONDS", 300
            ),
            claim_lease_seconds=_positive_int("REMIND_PROMPT_CLAIM_LEASE_SECONDS", 120),
            batch_size=_positive_int("REMIND_PROMPT_BATCH_SIZE", 50),
            slack_prompt_max_chars=_positive_int(
                "REMIND_PROMPT_SLACK_PROMPT_MAX_CHARS", 1_200, minimum=0
            ),
        )

    @property
    def slack_configured(self) -> bool:
        return bool(self.slack_webhook_url)
