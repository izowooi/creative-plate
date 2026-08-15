from pathlib import Path

import pytest

from remind_prompt.config import ConfigurationError, Settings


def test_settings_repr_never_contains_slack_webhook() -> None:
    settings = Settings(
        database_path=Path("test.db"),
        slack_webhook_url="https://hooks.slack.test/services/super-secret",
    )

    assert "super-secret" not in repr(settings)


def test_settings_rejects_unsafe_dashboard_base_url() -> None:
    with pytest.raises(ConfigurationError):
        Settings(database_path=Path("test.db"), base_url="javascript:alert(1)")


def test_settings_rejects_prompt_preview_beyond_slack_block_limit() -> None:
    with pytest.raises(ConfigurationError):
        Settings(database_path=Path("test.db"), slack_prompt_max_chars=2_801)
