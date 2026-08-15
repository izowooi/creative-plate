from __future__ import annotations

import calendar
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

RelativeUnit = Literal["hour", "day", "week", "month"]


class ScheduleError(ValueError):
    """Base class for schedule resolution failures."""


class UnknownTimezoneError(ScheduleError):
    pass


class NonexistentLocalTimeError(ScheduleError):
    pass


class AmbiguousLocalTimeError(ScheduleError):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


def ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ScheduleError("datetime must include a UTC offset")
    return value


def to_utc(value: datetime) -> datetime:
    return ensure_aware(value).astimezone(UTC)


def to_db(value: datetime) -> str:
    return to_utc(value).isoformat(timespec="seconds").replace("+00:00", "Z")


def from_db(value: str | None) -> datetime | None:
    if value is None:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)


def get_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as exc:
        raise UnknownTimezoneError(f"Unknown IANA timezone: {name}") from exc


def add_calendar(local_value: datetime, amount: int, unit: RelativeUnit) -> datetime:
    if local_value.tzinfo is not None:
        raise ScheduleError("add_calendar expects a local datetime without timezone")
    if amount < 1 or amount > 10_000:
        raise ScheduleError("relative amount must be between 1 and 10000")
    if unit == "hour":
        return local_value + timedelta(hours=amount)
    if unit == "day":
        return local_value + timedelta(days=amount)
    if unit == "week":
        return local_value + timedelta(weeks=amount)
    if unit != "month":
        raise ScheduleError(f"Unsupported relative unit: {unit}")

    month_index = local_value.year * 12 + (local_value.month - 1) + amount
    year, zero_based_month = divmod(month_index, 12)
    month = zero_based_month + 1
    day = min(local_value.day, calendar.monthrange(year, month)[1])
    return local_value.replace(year=year, month=month, day=day)


def resolve_local(
    local_value: datetime,
    timezone: str,
    *,
    fold: int | None = None,
) -> datetime:
    if local_value.tzinfo is not None:
        raise ScheduleError("local datetime must not include a UTC offset")
    if fold not in (None, 0, 1):
        raise ScheduleError("fold must be 0 or 1")

    zone = get_zone(timezone)
    candidates: list[datetime] = []
    for candidate_fold in (0, 1):
        candidate = local_value.replace(tzinfo=zone, fold=candidate_fold)
        round_trip = candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None)
        if round_trip == local_value:
            candidates.append(candidate)

    if not candidates:
        raise NonexistentLocalTimeError(
            f"{local_value.isoformat(timespec='minutes')} does not exist in {timezone}"
        )

    unique_offsets = {candidate.utcoffset() for candidate in candidates}
    if len(unique_offsets) > 1:
        if fold is None:
            raise AmbiguousLocalTimeError(
                f"{local_value.isoformat(timespec='minutes')} occurs twice in {timezone}; "
                "choose fold 0 or 1"
            )
        return local_value.replace(tzinfo=zone, fold=fold).astimezone(UTC)

    return candidates[0].astimezone(UTC)


def resolve_relative(
    anchor: datetime,
    timezone: str,
    amount: int,
    unit: RelativeUnit,
    *,
    fold: int | None = None,
) -> tuple[datetime, datetime]:
    anchor_utc = to_utc(anchor)
    local_anchor = anchor_utc.astimezone(get_zone(timezone)).replace(tzinfo=None)
    local_due = add_calendar(local_anchor, amount, unit)
    return resolve_local(local_due, timezone, fold=fold), local_due
