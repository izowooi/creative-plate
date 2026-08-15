from datetime import UTC, datetime

import pytest

from remind_prompt.time_utils import (
    AmbiguousLocalTimeError,
    NonexistentLocalTimeError,
    add_calendar,
    resolve_local,
    resolve_relative,
)


def test_calendar_month_clamps_to_last_day() -> None:
    assert add_calendar(datetime(2024, 1, 31, 9), 1, "month") == datetime(2024, 2, 29, 9)
    assert add_calendar(datetime(2025, 1, 31, 9), 1, "month") == datetime(2025, 2, 28, 9)
    assert add_calendar(datetime(2026, 3, 31, 9), 1, "month") == datetime(2026, 4, 30, 9)


def test_relative_day_keeps_local_wall_clock_across_dst() -> None:
    anchor = datetime(2026, 3, 7, 14, tzinfo=UTC)  # 09:00 in New York

    due, local_due = resolve_relative(anchor, "America/New_York", 1, "day")

    assert local_due == datetime(2026, 3, 8, 9)
    assert due == datetime(2026, 3, 8, 13, tzinfo=UTC)


def test_nonexistent_local_time_is_rejected() -> None:
    with pytest.raises(NonexistentLocalTimeError):
        resolve_local(datetime(2026, 3, 8, 2, 30), "America/New_York")


def test_ambiguous_local_time_requires_fold() -> None:
    local = datetime(2026, 11, 1, 1, 30)
    with pytest.raises(AmbiguousLocalTimeError):
        resolve_local(local, "America/New_York")

    first = resolve_local(local, "America/New_York", fold=0)
    second = resolve_local(local, "America/New_York", fold=1)
    assert second > first
