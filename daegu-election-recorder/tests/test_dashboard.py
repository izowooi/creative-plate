from pathlib import Path

import pandas as pd

from election_recorder.dashboard import (
    build_trend_frame,
    latest_summary,
    load_election_csv,
    vote_gap_direction,
)


def _write_csv(path: Path, rows: list[dict]) -> None:
    pd.DataFrame(rows).to_csv(path, index=False, encoding="utf-8-sig")


def _row(collected_at: str, ref_time: str, first_votes: int, second_votes: int, gap: int) -> dict:
    return {
        "collected_at": collected_at,
        "region": "대구",
        "counted_rate_percent": 20.0,
        "기준시각": ref_time,
        "first_rank": 1,
        "first_candidate": "김부겸",
        "first_party": "더불어민주당",
        "first_vote_rate_percent": 54.0,
        "first_votes": first_votes,
        "second_rank": 2,
        "second_candidate": "추경호",
        "second_party": "국민의힘",
        "second_vote_rate_percent": 45.0,
        "second_votes": second_votes,
        "vote_gap": gap,
    }


def test_load_election_csv_sorts_by_collected_time_and_numeric_columns(tmp_path):
    csv_path = tmp_path / "election.csv"
    _write_csv(
        csv_path,
        [
            _row("2026-06-03T22:10:00", "22:10", 120_000, 100_000, 20_000),
            _row("2026-06-03T21:55:00", "21:55", 80_000, 70_000, 10_000),
        ],
    )

    df = load_election_csv(csv_path)

    assert df["collected_at"].dt.strftime("%H:%M").tolist() == ["21:55", "22:10"]
    assert df["vote_gap"].tolist() == [10_000, 20_000]
    assert pd.api.types.is_numeric_dtype(df["first_votes"])


def test_build_trend_frame_adds_gap_delta_and_gap_shrinking_flags():
    df = pd.DataFrame(
        [
            _row("2026-06-03T21:55:00", "21:55", 80_000, 70_000, 10_000),
            _row("2026-06-03T22:00:00", "22:00", 90_000, 82_000, 8_000),
            _row("2026-06-03T22:05:00", "22:05", 100_000, 93_500, 6_500),
        ]
    )

    trend = build_trend_frame(df)

    assert trend["vote_gap_delta"].tolist() == [0, -2_000, -1_500]
    assert trend["is_gap_shrinking"].tolist() == [False, True, True]
    assert trend["gap_delta_label"].tolist() == ["0", "-2,000", "-1,500"]


def test_build_trend_frame_uses_full_datetime_for_chart_axis_after_midnight():
    df = pd.DataFrame(
        [
            _row("2026-06-03T23:56:58", "23:56", 217_353, 197_082, 20_271),
            _row("2026-06-04T00:01:59", "00:01", 227_616, 210_070, 17_546),
        ]
    )

    trend = build_trend_frame(df)

    assert trend["chart_time"].dt.strftime("%Y-%m-%d %H:%M").tolist() == [
        "2026-06-03 23:56",
        "2026-06-04 00:01",
    ]
    assert trend["display_time"].tolist() == ["06-03 23:56", "06-04 00:01"]
    assert trend["chart_time"].is_monotonic_increasing


def test_vote_gap_direction_reports_shrinking_when_latest_gap_is_smaller():
    df = pd.DataFrame(
        [
            _row("2026-06-03T21:55:00", "21:55", 80_000, 70_000, 10_000),
            _row("2026-06-03T22:05:00", "22:05", 100_000, 93_500, 6_500),
        ]
    )

    direction = vote_gap_direction(df)

    assert direction.status == "shrinking"
    assert direction.total_delta == -3_500
    assert direction.latest_delta == -3_500
    assert direction.message == "표차가 시작 대비 3,500표 줄었습니다."


def test_vote_gap_direction_reports_widening_when_latest_gap_is_larger():
    df = pd.DataFrame(
        [
            _row("2026-06-03T21:55:00", "21:55", 80_000, 70_000, 10_000),
            _row("2026-06-03T22:05:00", "22:05", 110_000, 92_000, 18_000),
        ]
    )

    direction = vote_gap_direction(df)

    assert direction.status == "widening"
    assert direction.total_delta == 8_000
    assert direction.message == "표차가 시작 대비 8,000표 늘었습니다."


def test_latest_summary_returns_latest_candidates_and_gap_direction():
    df = pd.DataFrame(
        [
            _row("2026-06-03T21:55:00", "21:55", 80_000, 70_000, 10_000),
            _row("2026-06-03T22:05:00", "22:05", 100_000, 93_500, 6_500),
        ]
    )

    summary = latest_summary(df)

    assert summary["기준시각"] == "22:05"
    assert summary["leader"] == "김부겸"
    assert summary["runner_up"] == "추경호"
    assert summary["vote_gap"] == 6_500
    assert summary["gap_status"] == "shrinking"
