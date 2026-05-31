import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import streamlit as st

from downloader import (
    HlsInfo,
    HlsLevel,
    build_filename,
    download_hls,
    expand_range_urls,
    get_hls_info,
)
from queue_manager import DownloadQueueManager, QueueItem
from state import load_state, save_state

st.set_page_config(page_title="ma", page_icon="⬇", layout="centered")
st.title("ma — HLS Video Downloader")

QUALITY_OPTIONS = [1080, 720, 480, 360]

# 앱 첫 실행 시 디스크에서 마지막 입력값을 복원해 session_state 의 디폴트로 사용.
if "_state_loaded" not in st.session_state:
    _persisted = load_state()
    st.session_state.setdefault("urls_text", _persisted.get("urls_text", ""))
    st.session_state.setdefault(
        "save_dir_str",
        _persisted.get("save_dir", str(Path.home() / "Downloads")),
    )
    st.session_state["_state_loaded"] = True


@st.cache_resource
def get_manager() -> DownloadQueueManager:
    return DownloadQueueManager()


manager = get_manager()


def pick_level(levels: list[HlsLevel], preferred: int) -> HlsLevel:
    """선호 화질 이하 중 최고 화질을 선택. 모두 선호보다 높으면 최저 화질."""
    candidates = [l for l in levels if l.height <= preferred]
    if not candidates:
        return min(levels, key=lambda l: l.height)
    return max(candidates, key=lambda l: l.height)


def run_parallel(items, concurrency, work_fn, render_fn):
    """work_fn(idx, item, on_progress) 을 concurrency 만큼 병렬 실행.
    main thread가 polling으로 placeholder를 갱신해 실시간 진행 표시.
    반환: (state dict, 전체 elapsed)."""
    state: dict[int, dict] = {i: {"status": "pending"} for i in range(len(items))}
    placeholders = [st.empty() for _ in items]

    for i in state:
        render_fn(i, state[i], placeholders[i], items[i])

    def run_one(idx, item):
        state[idx]["status"] = "running"
        start = time.time()
        try:
            def cb(done, total):
                state[idx].update(done=done, total=total)
            res = work_fn(idx, item, cb)
            state[idx].update(status="done", result=res, elapsed=time.time() - start)
        except Exception as exc:
            state[idx].update(status="error", error=str(exc), elapsed=time.time() - start)

    overall_start = time.time()
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        futures = [ex.submit(run_one, i, item) for i, item in enumerate(items)]
        while not all(f.done() for f in futures):
            for i in state:
                render_fn(i, state[i], placeholders[i], items[i])
            time.sleep(0.15)

    for i in state:
        render_fn(i, state[i], placeholders[i], items[i])
    return state, time.time() - overall_start


def render_analyze(idx, sd, ph, url):
    status = sd.get("status", "pending")
    n = idx + 1
    if status == "pending":
        ph.info(f"⏳ {n}. {url} — 대기 중")
    elif status == "running":
        ph.info(f"⏳ {n}. {url} — 분석 중...")
    elif status == "done":
        info: HlsInfo = sd["result"]
        levels_str = ", ".join(f"{l.height}p" for l in sorted(info.levels, key=lambda l: l.height))
        elapsed = sd.get("elapsed", 0)
        ph.success(f"✓ {n}. {url} → {levels_str} ({elapsed:.1f}초)")
    else:
        ph.error(f"✗ {n}. {url} — {sd.get('error', '오류')}")


def render_queue_item(idx: int, item: QueueItem) -> None:
    label = f"{item.slug} ({item.height}p)"
    n = idx + 1
    if item.status == "pending":
        st.info(f"⏳ {n}. {label} — 대기 중")
    elif item.status == "running":
        done = item.done
        total = item.total or 1
        st.progress(min(done / total, 1.0), text=f"{n}. {label} — 세그먼트 {done}/{total}")
    elif item.status == "done":
        r = item.result
        if r.get("skipped"):
            st.info(f"⏭ {n}. {label} — 이미 존재 ({r['size_mb']:.1f}MB), 스킵")
        else:
            st.success(
                f"✓ {n}. {label} — {r['size_mb']:.1f}MB, {r['n']}개 세그먼트"
            )
    else:
        st.error(f"✗ {n}. {label} — {item.error}")


# =================== UI ===================

with st.expander("📐 범위로 한 번에 추가 (선택)", expanded=False):
    rcol1, rcol2 = st.columns(2)
    range_start = rcol1.text_input("시작 URL", placeholder="https://example.com/title_001")
    range_end = rcol2.text_input("끝 URL", placeholder="https://example.com/title_024")
    rmode = st.radio(
        "기존 목록", ["덮어쓰기", "이어붙이기"], index=0, horizontal=True
    )
    if st.button(
        "목록에 추가", disabled=not (range_start and range_end), key="range_apply"
    ):
        try:
            generated = expand_range_urls(range_start, range_end)
        except ValueError as exc:
            st.error(str(exc))
        else:
            existing = st.session_state.get("urls_text", "")
            if rmode == "이어붙이기" and existing.strip():
                st.session_state["urls_text"] = (
                    existing.rstrip() + "\n" + "\n".join(generated)
                )
            else:
                st.session_state["urls_text"] = "\n".join(generated)
            st.rerun()
    st.caption(
        "💡 두 URL 의 끝 숫자만 다르고 앞부분은 동일해야 합니다. "
        "자릿수가 다르면(예: 99 ↔ 120) zero-padding 없이 그대로 생성합니다."
    )

urls_text = st.text_area(
    "URL 목록 (한 줄에 하나)",
    placeholder="https://example.com/title_001\nhttps://example.com/title_002",
    height=120,
    key="urls_text",
)

col1, col2 = st.columns([3, 1])
with col1:
    save_dir_str = st.text_input("저장 폴더", key="save_dir_str")
with col2:
    preferred_quality = st.selectbox(
        "선호 화질", [f"{q}p" for q in QUALITY_OPTIONS], index=1
    )
preferred_height = int(preferred_quality.rstrip("p"))

with st.expander("⚙ 고급 옵션", expanded=False):
    mode = st.radio("실행 모드", ["순차", "병렬"], index=1, horizontal=True)
    if mode == "병렬":
        concurrency = st.slider("동시 처리 수", 1, 16, 4)
        st.caption(
            "💡 분석 단계 동시 처리 수. 다운로드 큐는 동일한 값을 사용합니다. "
            "12 이상에서는 CDN rate-limit 으로 일부 세그먼트가 실패하거나 "
            "타임아웃이 발생할 수 있습니다."
        )
    else:
        concurrency = 1

manager.set_concurrency(concurrency)

urls = [u.strip() for u in urls_text.splitlines() if u.strip()]

# URL 목록이 바뀌면 분석 결과 초기화
if st.session_state.get("_analyzed_for_urls") != urls:
    for k in ("analyzed", "analyze_total_elapsed", "_just_analyzed"):
        st.session_state.pop(k, None)

# =================== Phase 1: Analyze ===================

analyze_btn = st.button(
    f"분석 ({len(urls)}개)" if urls else "분석",
    type="primary",
    disabled=not urls,
)

analyze_box = st.container()

if analyze_btn:
    with analyze_box:
        st.subheader("분석 결과")
        items = urls

        def work_a(idx, url, cb):
            return get_hls_info(url)

        state, total_elapsed = run_parallel(items, concurrency, work_a, render_analyze)

        analyzed = []
        for i, url in enumerate(urls):
            sd = state[i]
            if sd["status"] == "done":
                slug = url.rstrip("/").split("/")[-1]
                analyzed.append({
                    "url": url,
                    "info": sd["result"],
                    "slug": slug,
                    "elapsed": sd.get("elapsed", 0),
                })
            else:
                analyzed.append({
                    "url": url,
                    "error": sd.get("error", "오류"),
                    "elapsed": sd.get("elapsed", 0),
                })

        st.session_state["analyzed"] = analyzed
        st.session_state["_analyzed_for_urls"] = urls
        st.session_state["analyze_total_elapsed"] = total_elapsed
        st.session_state["_just_analyzed"] = True

        success_count = sum(1 for a in analyzed if "info" in a)
        mode_label = f"{mode} {concurrency}" if mode == "병렬" else mode
        st.info(f"분석 완료 — 성공 {success_count}/{len(urls)} (총 {total_elapsed:.1f}초, {mode_label})")

elif analyzed := st.session_state.get("analyzed"):
    with analyze_box:
        st.subheader("분석 결과")
        for i, a in enumerate(analyzed):
            n = i + 1
            if "info" in a:
                levels_str = ", ".join(f"{l.height}p" for l in sorted(a["info"].levels, key=lambda l: l.height))
                st.success(f"✓ {n}. {a['url']} → {levels_str} ({a['elapsed']:.1f}초)")
            else:
                st.error(f"✗ {n}. {a['url']} — {a['error']}")
        total = st.session_state.get("analyze_total_elapsed")
        success_count = sum(1 for a in analyzed if "info" in a)
        if total is not None:
            st.info(f"분석 완료 — 성공 {success_count}/{len(analyzed)} (총 {total:.1f}초)")

# =================== Phase 2: Queue에 추가 ===================

analyzed = st.session_state.get("analyzed")
if analyzed:
    successful = [a for a in analyzed if "info" in a]
    if successful:
        st.divider()
        save_dir = Path(save_dir_str).expanduser()

        add_btn = st.button(
            f"다운로드 큐에 추가 ({len(successful)}개)", type="primary"
        )

        if add_btn:
            new_queue_items = []
            for a in successful:
                level = pick_level(a["info"].levels, preferred_height)
                output = save_dir / build_filename(a["slug"], f"{level.height}p")
                new_queue_items.append(
                    QueueItem(
                        item_id=f"{a['slug']}_{level.height}p",
                        url=a["url"],
                        slug=a["slug"],
                        output_path=output,
                        level_url=level.url,
                        referer=a["info"].referer,
                        height=level.height,
                    )
                )
            added = manager.add_items(new_queue_items)
            skipped_dup = len(new_queue_items) - added
            msg = f"{added}개 큐에 추가됨"
            if skipped_dup:
                msg += f" ({skipped_dup}개 중복 스킵)"
            st.success(msg)

# =================== Queue 현황 ===================

queue_items = manager.get_items()
if queue_items:
    st.divider()
    st.subheader("다운로드 큐")

    pending_n = sum(1 for i in queue_items if i.status == "pending")
    running_n = sum(1 for i in queue_items if i.status == "running")
    done_n = sum(1 for i in queue_items if i.status == "done")
    error_n = sum(1 for i in queue_items if i.status == "error")

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("대기", pending_n)
    c2.metric("진행 중", running_n)
    c3.metric("완료", done_n)
    c4.metric("오류", error_n)

    for idx, item in enumerate(queue_items):
        render_queue_item(idx, item)

    if st.button(
        "완료/오류 항목 지우기",
        disabled=(done_n + error_n == 0),
    ):
        manager.clear_done()
        st.rerun()

# 큐가 활성 상태일 때 자동 갱신
if manager.is_running():
    time.sleep(0.3)
    st.rerun()

# =================== State persistence ===================

_current_state = {
    "urls_text": st.session_state.get("urls_text", ""),
    "save_dir": st.session_state.get("save_dir_str", ""),
}
if st.session_state.get("_last_persisted") != _current_state:
    save_state(_current_state)
    st.session_state["_last_persisted"] = _current_state
