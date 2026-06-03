import csv

from election_recorder.charts import generate_charts
from election_recorder.recorder import CSV_FIELDS


def test_generate_charts_creates_vote_rate_votes_and_gap_pngs(tmp_path):
    csv_path = tmp_path / "election.csv"
    charts_dir = tmp_path / "charts"
    rows = [
        {
            "collected_at": "2026-06-03T22:06:00",
            "region": "대구",
            "counted_rate_percent": "14.18",
            "기준시각": "22:06",
            "first_rank": "1",
            "first_candidate": "김부겸",
            "first_party": "더불어민주당",
            "first_vote_rate_percent": "53.45",
            "first_votes": "98735",
            "second_rank": "2",
            "second_candidate": "추경호",
            "second_party": "국민의힘",
            "second_vote_rate_percent": "45.49",
            "second_votes": "84035",
            "vote_gap": "14700",
        },
        {
            "collected_at": "2026-06-03T22:11:00",
            "region": "대구",
            "counted_rate_percent": "18.20",
            "기준시각": "22:11",
            "first_rank": "1",
            "first_candidate": "김부겸",
            "first_party": "더불어민주당",
            "first_vote_rate_percent": "53.10",
            "first_votes": "120100",
            "second_rank": "2",
            "second_candidate": "추경호",
            "second_party": "국민의힘",
            "second_vote_rate_percent": "45.80",
            "second_votes": "103000",
            "vote_gap": "17100",
        },
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    chart_paths = generate_charts(csv_path, charts_dir)

    assert [path.name for path in chart_paths] == [
        "vote_rate_percent.png",
        "votes.png",
        "vote_gap.png",
    ]
    assert all(path.exists() and path.stat().st_size > 0 for path in chart_paths)
