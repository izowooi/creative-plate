from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pandas as pd


NUMERIC_COLUMNS = [
    "counted_rate_percent",
    "first_rank",
    "first_vote_rate_percent",
    "first_votes",
    "second_rank",
    "second_vote_rate_percent",
    "second_votes",
    "vote_gap",
]


@dataclass(frozen=True)
class VoteGapDirection:
    status: str
    total_delta: int
    latest_delta: int
    message: str


def _format_votes(value: int | float) -> str:
    return f"{int(value):,}"


def load_election_csv(csv_path: Path) -> pd.DataFrame:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return pd.DataFrame()

    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    if df.empty:
        return df

    df["collected_at"] = pd.to_datetime(df["collected_at"], errors="coerce")
    for column in NUMERIC_COLUMNS:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")

    df = df.dropna(subset=["collected_at", "vote_gap"])
    return df.sort_values("collected_at").reset_index(drop=True)


def build_trend_frame(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    trend = df.sort_values("collected_at").reset_index(drop=True).copy()
    trend["vote_gap_delta"] = trend["vote_gap"].diff().fillna(0).astype(int)
    trend["is_gap_shrinking"] = trend["vote_gap_delta"] < 0
    trend["gap_delta_label"] = trend["vote_gap_delta"].map(lambda value: f"{int(value):,}")
    trend["display_time"] = trend["기준시각"].astype(str)
    return trend


def vote_gap_direction(df: pd.DataFrame) -> VoteGapDirection:
    trend = build_trend_frame(df)
    if trend.empty:
        return VoteGapDirection("empty", 0, 0, "표차 데이터가 아직 없습니다.")

    if len(trend) == 1:
        gap = int(trend.iloc[-1]["vote_gap"])
        return VoteGapDirection("single", 0, 0, f"현재 표차는 {_format_votes(gap)}표입니다.")

    first_gap = int(trend.iloc[0]["vote_gap"])
    latest_gap = int(trend.iloc[-1]["vote_gap"])
    total_delta = latest_gap - first_gap
    latest_delta = int(trend.iloc[-1]["vote_gap_delta"])

    if total_delta < 0:
        message = f"표차가 시작 대비 {_format_votes(abs(total_delta))}표 줄었습니다."
        status = "shrinking"
    elif total_delta > 0:
        message = f"표차가 시작 대비 {_format_votes(total_delta)}표 늘었습니다."
        status = "widening"
    else:
        message = "표차가 시작 대비 변하지 않았습니다."
        status = "flat"

    return VoteGapDirection(status, total_delta, latest_delta, message)


def latest_summary(df: pd.DataFrame) -> dict:
    trend = build_trend_frame(df)
    direction = vote_gap_direction(trend)
    if trend.empty:
        return {
            "기준시각": "",
            "leader": "",
            "runner_up": "",
            "vote_gap": 0,
            "gap_status": direction.status,
            "gap_message": direction.message,
        }

    latest = trend.iloc[-1]
    return {
        "기준시각": latest["기준시각"],
        "collected_at": latest["collected_at"],
        "leader": latest["first_candidate"],
        "runner_up": latest["second_candidate"],
        "leader_vote_rate_percent": float(latest["first_vote_rate_percent"]),
        "runner_up_vote_rate_percent": float(latest["second_vote_rate_percent"]),
        "leader_votes": int(latest["first_votes"]),
        "runner_up_votes": int(latest["second_votes"]),
        "vote_gap": int(latest["vote_gap"]),
        "counted_rate_percent": float(latest["counted_rate_percent"]),
        "gap_status": direction.status,
        "gap_message": direction.message,
        "gap_total_delta": direction.total_delta,
        "gap_latest_delta": direction.latest_delta,
    }
