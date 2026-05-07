from pathlib import Path

import streamlit as st

from downloader import HlsInfo, build_filename, download_hls, get_hls_info

st.set_page_config(page_title="ma", page_icon="⬇", layout="centered")
st.title("ma — HLS Video Downloader")

url = st.text_input(
    "missav.ai URL",
    placeholder="https://missav.ai/ko/h_1724a141g00017",
)

if st.button("분석", type="primary") and url:
    with st.spinner("페이지 분석 중 (Playwright)..."):
        try:
            st.session_state["hls_info"] = get_hls_info(url)
            st.session_state["page_url"] = url
            st.session_state.pop("download_result", None)
        except Exception as exc:
            st.error(f"분석 실패: {exc}")

info: HlsInfo | None = st.session_state.get("hls_info")
if info:
    st.success(f"분석 완료 — {len(info.levels)}개 품질 발견")

    levels = sorted(info.levels, key=lambda l: l.height, reverse=True)
    quality = st.selectbox("화질 선택", [f"{l.height}p" for l in levels])
    selected = next(l for l in levels if f"{l.height}p" == quality)

    save_dir = st.text_input("저장 폴더", value=str(Path.home() / "Downloads"))

    slug = st.session_state["page_url"].rstrip("/").split("/")[-1]
    filename = build_filename(slug, quality)
    output = Path(save_dir) / filename
    st.caption(f"저장 파일: `{output}`")

    if st.button("다운로드 시작"):
        bar = st.progress(0.0, text="다운로드 준비 중...")
        status_txt = st.empty()

        def on_progress(done: int, total: int) -> None:
            bar.progress(done / total, text=f"세그먼트 {done} / {total}")

        try:
            n = download_hls(selected.url, output, on_progress)
            bar.progress(1.0, text="완료!")
            size_mb = output.stat().st_size / 1024 / 1024
            st.session_state["download_result"] = str(output)
            st.success(f"저장 완료: `{output}` ({size_mb:.1f} MB, {n}개 세그먼트)")
        except Exception as exc:
            st.error(f"다운로드 실패: {exc}")
