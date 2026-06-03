import asyncio
import csv

import pytest

from election_recorder.parser import ElectionSnapshot
from election_recorder.recorder import (
    RefreshButtonNotFound,
    append_snapshot,
    click_refresh,
    collect_once,
    close_browser_safely,
    wait_for_enter,
)


class _Clickable:
    def __init__(self, calls, label, should_click):
        self.calls = calls
        self.label = label
        self.should_click = should_click

    async def click(self, timeout):
        self.calls.append((self.label, timeout))
        if not self.should_click:
            raise RuntimeError(f"{self.label} not found")


class _RefreshLocator(_Clickable):
    def filter(self, has_text):
        self.calls.append(("filter", has_text))
        return self


class _BodyLocator:
    def __init__(self, page):
        self.page = page

    async def inner_text(self):
        if isinstance(self.page.body_text, list):
            index = min(self.page.body_read_count, len(self.page.body_text) - 1)
            self.page.body_read_count += 1
            return self.page.body_text[index]
        self.page.body_read_count += 1
        return self.page.body_text


class _FakePage:
    def __init__(self, body_text="", role_ok=False, locator_ok=False):
        self.body_text = body_text
        self.body_read_count = 0
        self.role_ok = role_ok
        self.locator_ok = locator_ok
        self.calls = []

    def get_by_role(self, role, name):
        self.calls.append(("get_by_role", role, name))
        return _Clickable(self.calls, "role", self.role_ok)

    def locator(self, selector):
        self.calls.append(("locator", selector))
        if selector == "body":
            return _BodyLocator(self)
        return _RefreshLocator(self.calls, selector, self.locator_ok)

    async def wait_for_timeout(self, milliseconds):
        self.calls.append(("wait_for_timeout", milliseconds))


class _ClosingBrowser:
    def __init__(self, error=None):
        self.error = error
        self.closed = False

    async def close(self):
        self.closed = True
        if self.error:
            raise self.error


def _snapshot(at="22:06", first_votes=98735, second_votes=84035):
    return ElectionSnapshot(
        collected_at=f"2026-06-03T{at}:00",
        region="대구",
        counted_rate_percent=14.18,
        기준시각=at,
        first_rank=1,
        first_candidate="김부겸",
        first_party="더불어민주당",
        first_vote_rate_percent=53.45,
        first_votes=first_votes,
        second_rank=2,
        second_candidate="추경호",
        second_party="국민의힘",
        second_vote_rate_percent=45.49,
        second_votes=second_votes,
        vote_gap=abs(first_votes - second_votes),
    )


def test_click_refresh_uses_fallback_selector_when_role_lookup_fails():
    page = _FakePage(role_ok=False, locator_ok=True)

    asyncio.run(click_refresh(page, timeout_ms=1234))

    assert ("role", 1234) in page.calls
    assert any(call[0] == "locator" and "aria-label" in call[1] for call in page.calls)


def test_click_refresh_raises_when_no_refresh_button_is_found():
    page = _FakePage(role_ok=False, locator_ok=False)

    with pytest.raises(RefreshButtonNotFound):
        asyncio.run(click_refresh(page, timeout_ms=10))


def test_collect_once_clicks_refresh_waits_and_parses_body_text():
    text = """
    대구 개표율 14.18% 22:06 기준
    기호 1 김부겸 더불어민주당 53.45% 98,735표
    기호 2 추경호 국민의힘 45.49% 84,035표
    """
    page = _FakePage(body_text=text, role_ok=True)

    snapshot = asyncio.run(collect_once(page, settle_ms=777))

    assert snapshot.first_candidate == "김부겸"
    assert snapshot.second_candidate == "추경호"
    assert ("wait_for_timeout", 777) in page.calls


def test_collect_once_retries_body_text_until_candidate_cards_are_ready():
    loading_text = "대구 개표율 19.50% 22:34 기준 대구 시·도지사 개표현황"
    ready_text = """
    대구 개표율 19.50% 22:34 기준
    기호 1 김부겸 더불어민주당 54.60% 138,681표
    기호 2 추경호 국민의힘 44.33% 112,596표
    """
    page = _FakePage(body_text=[loading_text, ready_text], role_ok=True)

    snapshot = asyncio.run(collect_once(page, settle_ms=10, parse_timeout_ms=1000, poll_ms=5))

    assert page.body_read_count == 2
    assert snapshot.first_candidate == "김부겸"
    assert snapshot.second_candidate == "추경호"


def test_append_snapshot_skips_duplicate_region_and_reference_time(tmp_path):
    csv_path = tmp_path / "election.csv"

    assert append_snapshot(csv_path, _snapshot("22:06"), duplicate_policy="skip") is True
    assert append_snapshot(csv_path, _snapshot("22:06", 100000, 90000), duplicate_policy="skip") is False
    assert append_snapshot(csv_path, _snapshot("22:11"), duplicate_policy="skip") is True

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    assert [row["기준시각"] for row in rows] == ["22:06", "22:11"]


def test_append_snapshot_can_record_duplicate_when_requested(tmp_path):
    csv_path = tmp_path / "election.csv"

    assert append_snapshot(csv_path, _snapshot("22:06"), duplicate_policy="record") is True
    assert append_snapshot(csv_path, _snapshot("22:06", 100000, 90000), duplicate_policy="record") is True

    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))

    assert len(rows) == 2


def test_wait_for_enter_returns_false_when_stdin_is_unavailable():
    def input_fn(prompt):
        raise EOFError

    assert wait_for_enter("prompt", input_fn=input_fn) is False


def test_wait_for_enter_returns_true_after_input():
    prompts = []

    def input_fn(prompt):
        prompts.append(prompt)
        return ""

    assert wait_for_enter("prompt", input_fn=input_fn) is True
    assert prompts == ["prompt"]


def test_close_browser_safely_swallows_cancelled_close():
    browser = _ClosingBrowser(error=asyncio.CancelledError())

    asyncio.run(close_browser_safely(browser))

    assert browser.closed is True
