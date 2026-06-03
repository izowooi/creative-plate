from __future__ import annotations

from pathlib import Path
import sys

import pandas as pd
import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from election_recorder.dashboard import build_trend_frame, latest_summary, load_election_csv, vote_gap_direction


DEFAULT_CSV = ROOT / "data" / "daegu_election.csv"
SCREENSHOT_CSV = ROOT / "data" / "daegu_election_with_screenshots.csv"
DEFAULT_REFRESH_SECONDS = 600
MAX_REFRESH_SECONDS = 3600
MANUAL_REFRESH_LABEL = "지금 새로고침"


def _format_votes(value: int | float) -> str:
    return f"{int(value):,}표"


def _auto_refresh(seconds: int) -> None:
    if seconds <= 0:
        return
    milliseconds = seconds * 1000
    components.html(
        f"""
        <script>
        setTimeout(() => window.parent.location.reload(), {milliseconds});
        </script>
        """,
        height=0,
    )


def _request_manual_refresh(button_fn=st.sidebar.button, rerun_fn=st.rerun) -> None:
    if button_fn(MANUAL_REFRESH_LABEL, use_container_width=True):
        rerun_fn()


def _choose_csv() -> Path:
    options = {
        "실시간 수집 CSV": DEFAULT_CSV,
        "스크린샷 보강 CSV": SCREENSHOT_CSV,
        "직접 입력": None,
    }
    selected = st.sidebar.radio("데이터", list(options.keys()), horizontal=False)
    if options[selected] is not None:
        return options[selected]
    return Path(st.sidebar.text_input("CSV 경로", str(DEFAULT_CSV))).expanduser()


def _render_empty(csv_path: Path) -> None:
    st.warning(f"읽을 수 있는 데이터가 없습니다: {csv_path}")
    st.caption("수집기를 실행하거나 CSV 경로를 확인해 주세요.")


def _render_latest(summary: dict) -> None:
    st.subheader("현재 상태")
    col1, col2, col3, col4 = st.columns(4)
    col1.metric("기준시각", summary["기준시각"])
    col2.metric("개표율", f"{summary['counted_rate_percent']:.2f}%")
    col3.metric("표차", _format_votes(summary["vote_gap"]), delta=_format_votes(summary["gap_latest_delta"]))
    col4.metric("시작 대비 표차 변화", _format_votes(summary["gap_total_delta"]))

    st.info(summary["gap_message"])

    left, right = st.columns(2)
    with left:
        st.markdown(f"**1위 {summary['leader']}**")
        st.metric("득표율", f"{summary['leader_vote_rate_percent']:.2f}%")
        st.metric("득표수", _format_votes(summary["leader_votes"]))
    with right:
        st.markdown(f"**2위 {summary['runner_up']}**")
        st.metric("득표율", f"{summary['runner_up_vote_rate_percent']:.2f}%")
        st.metric("득표수", _format_votes(summary["runner_up_votes"]))


def _line_chart(trend: pd.DataFrame, y: str, title: str) -> None:
    st.markdown(f"### {title}")
    chart_data = trend.set_index("chart_time")[[y]]
    st.line_chart(chart_data, use_container_width=True)


def _render_gap_table(trend: pd.DataFrame) -> None:
    view = trend[
        [
            "기준시각",
            "counted_rate_percent",
            "first_candidate",
            "first_vote_rate_percent",
            "first_votes",
            "second_candidate",
            "second_vote_rate_percent",
            "second_votes",
            "vote_gap",
            "vote_gap_delta",
        ]
    ].copy()
    view.columns = [
        "기준시각",
        "개표율(%)",
        "1위",
        "1위 득표율(%)",
        "1위 득표수",
        "2위",
        "2위 득표율(%)",
        "2위 득표수",
        "표차",
        "직전 대비 표차",
    ]
    st.dataframe(view, use_container_width=True, hide_index=True)


def main() -> None:
    st.set_page_config(page_title="대구 선거 기록 대시보드", layout="wide")
    st.title("대구 시·도지사 개표 추이")

    csv_path = _choose_csv()
    refresh_seconds = st.sidebar.number_input(
        "자동 새로고침(초)",
        min_value=0,
        max_value=MAX_REFRESH_SECONDS,
        value=DEFAULT_REFRESH_SECONDS,
        step=30,
    )
    _request_manual_refresh()
    _auto_refresh(refresh_seconds)

    st.sidebar.caption(str(csv_path))
    df = load_election_csv(csv_path)
    if df.empty:
        _render_empty(csv_path)
        return

    trend = build_trend_frame(df)
    summary = latest_summary(trend)
    direction = vote_gap_direction(trend)

    _render_latest(summary)

    st.subheader("표차가 줄어드는지 보기")
    if direction.status == "shrinking":
        st.success(direction.message)
    elif direction.status == "widening":
        st.error(direction.message)
    else:
        st.info(direction.message)

    _line_chart(trend, "vote_gap", "표차 추이")

    st.markdown("### 직전 대비 표차 변화")
    st.bar_chart(trend.set_index("chart_time")[["vote_gap_delta"]], use_container_width=True)

    col1, col2 = st.columns(2)
    with col1:
        _line_chart(trend, "first_votes", "1위 득표수 추이")
    with col2:
        _line_chart(trend, "second_votes", "2위 득표수 추이")

    vote_rate = trend.set_index("chart_time")[["first_vote_rate_percent", "second_vote_rate_percent"]]
    vote_rate = vote_rate.rename(columns={"first_vote_rate_percent": "1위 득표율", "second_vote_rate_percent": "2위 득표율"})
    st.markdown("### 득표율 추이")
    st.line_chart(vote_rate, use_container_width=True)

    st.markdown("### 원본 데이터")
    _render_gap_table(trend)


if __name__ == "__main__":
    main()
