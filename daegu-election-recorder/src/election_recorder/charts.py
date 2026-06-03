from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import pandas as pd


def _configure_korean_font() -> None:
    try:
        import matplotlib.font_manager as font_manager

        font_names = {font.name for font in font_manager.fontManager.ttflist}
    except Exception:
        font_names = set()

    for font_name in ("AppleGothic", "NanumGothic", "Malgun Gothic"):
        if font_name in font_names:
            plt.rcParams["font.family"] = font_name
            break
    plt.rcParams["axes.unicode_minus"] = False


def _plot_lines(df: pd.DataFrame, x_values: pd.Series, columns: list[str], labels: list[str], path: Path, title: str, ylabel: str) -> None:
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for column, label in zip(columns, labels):
        ax.plot(x_values, df[column], marker="o", linewidth=2, label=label)
    ax.set_title(title)
    ax.set_xlabel("기준시각")
    ax.set_ylabel(ylabel)
    ax.grid(True, alpha=0.3)
    ax.legend()
    fig.autofmt_xdate(rotation=30)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def generate_charts(csv_path: Path, charts_dir: Path) -> list[Path]:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return []

    df = pd.read_csv(csv_path, encoding="utf-8-sig")
    if df.empty:
        return []

    numeric_columns = [
        "first_vote_rate_percent",
        "second_vote_rate_percent",
        "first_votes",
        "second_votes",
        "vote_gap",
    ]
    for column in numeric_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(subset=numeric_columns, how="all")
    if df.empty:
        return []

    _configure_korean_font()
    charts_dir.mkdir(parents=True, exist_ok=True)
    x_values = df["기준시각"].astype(str)
    first_label = str(df["first_candidate"].dropna().iloc[-1]) if "first_candidate" in df else "1위"
    second_label = str(df["second_candidate"].dropna().iloc[-1]) if "second_candidate" in df else "2위"

    chart_specs = [
        (
            "vote_rate_percent.png",
            ["first_vote_rate_percent", "second_vote_rate_percent"],
            [first_label, second_label],
            "득표율 추이",
            "득표율 (%)",
        ),
        (
            "votes.png",
            ["first_votes", "second_votes"],
            [first_label, second_label],
            "득표수 추이",
            "득표수",
        ),
        (
            "vote_gap.png",
            ["vote_gap"],
            ["표차"],
            "표차 추이",
            "표차",
        ),
    ]

    paths: list[Path] = []
    for filename, columns, labels, title, ylabel in chart_specs:
        path = charts_dir / filename
        _plot_lines(df, x_values, columns, labels, path, title, ylabel)
        paths.append(path)
    return paths
