from __future__ import annotations

import asyncio
import csv
import math
import re
from pathlib import Path

from playwright.async_api import async_playwright, Page

from .parser import ElectionSnapshot, parse_snapshot

CSV_FIELDS = list(ElectionSnapshot.__dataclass_fields__.keys())
DUPLICATE_POLICIES = {"skip", "record"}


class RefreshButtonNotFound(RuntimeError):
    """Raised when the Naver result refresh control cannot be clicked."""


def wait_for_enter(prompt: str, input_fn=input) -> bool:
    try:
        input_fn(prompt)
    except EOFError:
        print("표준 입력을 사용할 수 없어 수집을 시작하지 않고 종료합니다.")
        return False
    return True


async def close_browser_safely(browser) -> None:
    try:
        await browser.close()
    except asyncio.CancelledError:
        pass
    except Exception:
        pass


async def click_refresh(page: Page, timeout_ms: int = 2000) -> None:
    """Click Naver's visible result refresh control without reloading the page."""
    refresh_name = re.compile("새로고침|갱신|refresh", re.IGNORECASE)
    strategies = (
        lambda: page.get_by_role("button", name=refresh_name),
        lambda: page.locator(
            "button[aria-label*='새로고침'], button[title*='새로고침'], "
            "a[aria-label*='새로고침'], a[title*='새로고침']"
        ),
        lambda: page.locator("button").filter(has_text=refresh_name),
        lambda: page.locator("a").filter(has_text=refresh_name),
    )
    errors: list[str] = []

    for locator_factory in strategies:
        try:
            await locator_factory().click(timeout=timeout_ms)
            return
        except Exception as exc:  # Playwright locator failures are strategy-local.
            errors.append(str(exc))

    detail = " | ".join(error.splitlines()[0] for error in errors if error)
    raise RefreshButtonNotFound(f"Could not find or click refresh button. {detail}".strip())


async def wait_for_snapshot(page: Page, timeout_ms: int = 10000, poll_ms: int = 500) -> ElectionSnapshot:
    deadline = asyncio.get_running_loop().time() + timeout_ms / 1000
    last_error: Exception | None = None

    while True:
        body_text = await page.locator("body").inner_text()
        try:
            return parse_snapshot(body_text)
        except ValueError as exc:
            last_error = exc
            if asyncio.get_running_loop().time() >= deadline:
                raise last_error
            await page.wait_for_timeout(poll_ms)


async def collect_once(
    page: Page,
    settle_ms: int = 1500,
    parse_timeout_ms: int = 10000,
    poll_ms: int = 500,
) -> ElectionSnapshot:
    """Click the visible refresh button, then parse the page text."""
    await click_refresh(page)
    await page.wait_for_timeout(settle_ms)
    return await wait_for_snapshot(page, timeout_ms=parse_timeout_ms, poll_ms=poll_ms)


def _existing_snapshot_keys(csv_path: Path) -> set[tuple[str, str]]:
    if not csv_path.exists() or csv_path.stat().st_size == 0:
        return set()

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        return {
            (row.get("region", ""), row.get("기준시각", ""))
            for row in csv.DictReader(f)
            if row.get("region") and row.get("기준시각")
        }


def append_snapshot(csv_path: Path, snapshot: ElectionSnapshot, duplicate_policy: str = "skip") -> bool:
    if duplicate_policy not in DUPLICATE_POLICIES:
        raise ValueError(f"duplicate_policy must be one of: {', '.join(sorted(DUPLICATE_POLICIES))}")

    csv_path.parent.mkdir(parents=True, exist_ok=True)
    exists = csv_path.exists() and csv_path.stat().st_size > 0

    if duplicate_policy == "skip" and (snapshot.region, snapshot.기준시각) in _existing_snapshot_keys(csv_path):
        return False

    with csv_path.open("a", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if not exists:
            writer.writeheader()
        writer.writerow(snapshot.to_dict())
    return True


def _sample_limit(duration_minutes: int, interval_seconds: int) -> int | None:
    if interval_seconds <= 0:
        raise ValueError("interval_seconds must be greater than 0")
    if duration_minutes < 0:
        raise ValueError("duration_minutes must be greater than or equal to 0")
    if duration_minutes == 0:
        return None
    return max(1, math.ceil(duration_minutes * 60 / interval_seconds))


async def run(
    interval_seconds: int,
    duration_minutes: int,
    csv_path: Path,
    charts_dir: Path,
    start_url: str = "https://search.naver.com/",
    settle_ms: int = 1500,
    parse_timeout_ms: int = 10000,
    duplicate_policy: str = "skip",
    create_charts: bool = True,
) -> None:
    sample_limit = _sample_limit(duration_minutes, interval_seconds)
    saved_count = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        try:
            page = await browser.new_page()
            await page.goto(start_url)
            if not wait_for_enter("브라우저가 열렸습니다. 원하는 대구 시·도지사 개표현황 화면까지 직접 이동한 뒤 Enter를 누르세요.\n"):
                return

            sample_index = 0
            while sample_limit is None or sample_index < sample_limit:
                while True:
                    try:
                        snapshot = await collect_once(page, settle_ms=settle_ms, parse_timeout_ms=parse_timeout_ms)
                        break
                    except Exception as exc:
                        print(f"수집 실패: {exc}")
                        if not wait_for_enter("페이지와 새로고침 버튼이 보이는지 확인한 뒤 Enter를 누르면 같은 샘플을 다시 시도합니다.\n"):
                            return

                sample_index += 1
                written = append_snapshot(csv_path, snapshot, duplicate_policy=duplicate_policy)
                if written:
                    saved_count += 1
                    print(f"[{sample_index}] saved: {snapshot}")
                else:
                    print(f"[{sample_index}] skipped duplicate: {snapshot.region} {snapshot.기준시각}")

                if sample_limit is not None and sample_index >= sample_limit:
                    break
                await asyncio.sleep(interval_seconds)
        except (KeyboardInterrupt, asyncio.CancelledError):
            print("\n사용자 중단으로 수집을 종료합니다.")
        finally:
            if create_charts:
                from .charts import generate_charts

                chart_paths = generate_charts(csv_path, charts_dir)
                if chart_paths:
                    print("차트 생성 완료:")
                    for chart_path in chart_paths:
                        print(f"- {chart_path}")
                else:
                    print("저장된 CSV 데이터가 없어 차트를 생성하지 않았습니다.")
            print(f"저장된 신규 샘플 수: {saved_count}")
            await close_browser_safely(browser)
