import json
from urllib.parse import unquote

import pytest

from conftest import fixture
from namu_crawler import worker
from namu_crawler.crawler import Crawler
from namu_crawler.fetch import Fetcher, Response
from namu_crawler.worker import JobWorker, SupabaseDb, load_config


def fake_tier(url, timeout):
    title = unquote(url)
    if url.endswith(".css"):
        return Response(200, "body{}", url)
    if "없는문서" in title:
        return Response(404, fixture("not_found.html"), url)
    if "차단문서" in title:
        return Response(403, fixture("blocked_cloudflare.html"), url)
    return Response(200, fixture("article_full.html"), url)


def make_crawler(tmp_path):
    return Crawler(Fetcher(tmp_path, tiers={"curl_cffi": fake_tier}, order=("curl_cffi",), min_interval=0,
                           static_interval=0, retries=0, sleep=lambda s: None))


class FakeDb:
    """JobWorker 가 쓰는 인터페이스만 흉내 낸 메모리 DB."""

    def __init__(self, titles):
        self.jobs = [{"id": i + 1, "title": t, "status": "pending", "attempts": 0} for i, t in enumerate(titles)]
        self.pages, self.log = {}, []

    def next_pending_job(self):
        return next((j for j in self.jobs if j["status"] == "pending"), None)

    def claim(self, job, agent):
        if job["status"] != "pending":
            return False
        job.update(status="running", agent=agent)
        return True

    def finish(self, job_id, status, error=None):
        job = next(j for j in self.jobs if j["id"] == job_id)
        job.update(status=status, error=error)

    def release_stale(self, agent):
        self.log.append(("release_stale", agent))

    def save_page(self, row):
        self.pages[row["key"]] = row


# ---------- JobWorker ----------

def test_worker_collects_pending_jobs_and_uploads_pages(tmp_path):
    db = FakeDb(["전생검신", "없는문서"])
    handled = JobWorker(db, make_crawler(tmp_path), "w1").run(once=True)
    assert handled == 2
    assert [j["status"] for j in db.jobs] == ["done", "not_found"]
    page = next(p for p in db.pages.values() if p["title"] == "전생검신")
    assert page["status"] == 200 and page["via"] == "집 워커 (curl_cffi)" and "creativecommons.org/licenses" in page["html"]
    assert page["key"] == Fetcher.key("전생검신") and page["fetched_at"].endswith("+00:00")
    nf = next(p for p in db.pages.values() if p["title"] == "없는문서")
    assert nf["status"] == 404 and nf["html"] == ""
    assert db.log == [("release_stale", "w1")]


def test_worker_marks_failures_without_stopping(tmp_path):
    db = FakeDb(["차단문서", "전생검신"])
    JobWorker(db, make_crawler(tmp_path), "w1").run(once=True)
    assert db.jobs[0]["status"] == "error" and "모든 수집 방법이 실패" in db.jobs[0]["error"]
    assert db.jobs[1]["status"] == "done"
    assert len(db.pages) == 1


def test_worker_survives_unexpected_errors(tmp_path):
    class Boom(FakeDb):
        def save_page(self, row):
            raise RuntimeError("DB 저장 실패")
    db = Boom(["전생검신"])
    JobWorker(db, make_crawler(tmp_path), "w1").run(once=True)
    assert db.jobs[0]["status"] == "error" and "DB 저장 실패" in db.jobs[0]["error"]


def test_worker_skips_jobs_claimed_by_someone_else(tmp_path):
    class Racy(FakeDb):
        def claim(self, job, agent):
            job["status"] = "running"  # 다른 워커가 먼저 가져감
            return False
    db = Racy(["전생검신"])
    JobWorker(db, make_crawler(tmp_path), "w1").run(once=True)
    assert db.pages == {} and db.jobs[0]["status"] == "running"


def test_worker_polls_when_idle_and_recovers_from_db_errors(tmp_path):
    sleeps, calls = [], {"n": 0}

    class Flaky(FakeDb):
        def next_pending_job(self):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("네트워크 오류")
            if calls["n"] >= 3:
                raise KeyboardInterrupt
            return None
    w = JobWorker(Flaky([]), make_crawler(tmp_path), "w1", sleep=sleeps.append)
    with pytest.raises(KeyboardInterrupt):
        w.run(once=False, poll=7)
    assert sleeps == [7, 7]


# ---------- SupabaseDb (HTTP 모양) ----------

class Transport:
    def __init__(self, responses):
        self.responses, self.calls = list(responses), []

    def __call__(self, method, url, headers, body):
        self.calls.append((method, url, headers, json.loads(body) if body else None))
        status, payload = self.responses.pop(0)
        return status, json.dumps(payload).encode() if payload is not None else b""


def make_db(responses, key="sb_publishable_x"):
    transport = Transport(responses)
    return SupabaseDb("https://p.supabase.co/", key, "TOKEN", transport=transport), transport


def test_every_request_carries_the_token_and_key():
    db, t = make_db([(200, [])])
    db.next_pending_job()
    method, url, headers, _ = t.calls[0]
    assert (method, url) == ("GET", "https://p.supabase.co/rest/v1/nw_jobs?status=eq.pending&order=requested_at.asc&limit=1")
    assert headers["x-nw-token"] == "TOKEN" and headers["apikey"] == "sb_publishable_x" and "Authorization" not in headers
    legacy, t2 = make_db([(200, [])], key="eyJ.legacy.jwt")
    legacy.next_pending_job()
    assert t2.calls[0][2]["Authorization"] == "Bearer eyJ.legacy.jwt"


def test_claim_uses_a_conditional_update():
    db, t = make_db([(200, [{"id": 5}]), (200, [])])
    assert db.claim({"id": 5, "attempts": 1}, "w1") is True
    method, url, headers, body = t.calls[0]
    assert (method, url) == ("PATCH", "https://p.supabase.co/rest/v1/nw_jobs?id=eq.5&status=eq.pending")
    assert headers["Prefer"] == "return=representation"
    assert body["status"] == "running" and body["agent"] == "w1" and body["attempts"] == 2
    assert db.claim({"id": 5}, "w1") is False  # 이미 다른 워커가 가져가 갱신된 행이 없다


def test_finish_save_page_and_release_stale():
    db, t = make_db([(204, None), (201, None), (204, None)])
    db.finish(7, "error", "실패")
    db.save_page({"key": "k", "title": "가"})
    db.release_stale("home worker@mac", now=2_000_000_000)
    assert t.calls[0][1].endswith("nw_jobs?id=eq.7") and t.calls[0][3]["status"] == "error" and t.calls[0][3]["error"] == "실패"
    assert t.calls[1][1].endswith("nw_pages?on_conflict=key") and t.calls[1][2]["Prefer"] == "resolution=merge-duplicates,return=minimal"
    url = unquote(t.calls[2][1])
    assert "status=eq.running" in url and "agent=eq.home worker@mac" in url and "started_at=lt.2033-05-18T03:13:20" in url
    assert t.calls[2][3] == {"status": "pending"}


def test_db_errors_raise_with_status():
    db, _ = make_db([(401, {"message": "denied"})])
    with pytest.raises(RuntimeError, match="DB 오류 401"):
        db.next_pending_job()


# ---------- 설정 ----------

def test_config_env_overrides_file_and_token_falls_back_to_token_file(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "CONFIG_DIR", tmp_path)
    (tmp_path / "token").write_text("FILE-TOKEN\n")
    env_file = tmp_path / "worker.env"
    env_file.write_text("# 주석\nNW_SUPABASE_URL=https://a.supabase.co\nNW_SUPABASE_KEY='sb_publishable_k'\n")
    config = load_config(env={"NW_SUPABASE_URL": "https://override.supabase.co", "OTHER": "x"}, env_file=env_file)
    assert config == {"NW_SUPABASE_URL": "https://override.supabase.co", "NW_SUPABASE_KEY": "sb_publishable_k", "NW_TOKEN": "FILE-TOKEN"}
    assert load_config(env={"NW_TOKEN": "ENV-TOKEN"}, env_file=env_file)["NW_TOKEN"] == "ENV-TOKEN"


def test_config_reports_missing_values(tmp_path, monkeypatch):
    monkeypatch.setattr(worker, "CONFIG_DIR", tmp_path)
    with pytest.raises(SystemExit, match="NW_SUPABASE_URL"):
        load_config(env={}, env_file=tmp_path / "none.env")
