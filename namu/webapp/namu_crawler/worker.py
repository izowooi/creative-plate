"""집 컴퓨터 수집 워커. `python3 -m namu_crawler.worker`

나무위키는 Cloudflare Workers 와 서버 IP(AWS 등)를 막아서 호스팅 앱(namu.zowoo.uk)이 직접 문서를 받을 수 없다.
이 워커가 Supabase 의 수집 대기열(nw_jobs)을 읽어 집 IP 로 문서를 받고, 결과를 nw_pages 에 올린다.
확장 프로그램을 쓸 수 없는 기기(휴대폰 등)에서 올린 작업도 이 워커가 처리한다.

설정(환경변수 또는 ~/.config/namu/worker.env 의 KEY=VALUE 줄):
  NW_SUPABASE_URL   예: https://<project-ref>.supabase.co
  NW_SUPABASE_KEY   publishable(anon) 키. 공개 키이며 권한은 아래 토큰 헤더와 DB 의 RLS 정책이 정한다.
  NW_TOKEN          앱 토큰. 없으면 ~/.config/namu/token 파일을 읽는다.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import socket
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from .crawler import Crawler
from .server import add_fetch_arguments, build_fetcher
from .targets import Target

log = logging.getLogger("namu_crawler.worker")
CONFIG_DIR = Path.home() / ".config" / "namu"
STALE_AFTER = timedelta(minutes=20)


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat()


def load_config(env: dict[str, str] | None = None, env_file: Path | None = None) -> dict[str, str]:
    """환경변수가 env_file 보다 우선한다. 토큰은 파일로도 받을 수 있다."""
    env = dict(os.environ if env is None else env)
    path = env_file or CONFIG_DIR / "worker.env"
    values: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                values[key.strip()] = value.strip().strip("'\"")
    values.update({k: v for k, v in env.items() if k.startswith("NW_") and v})
    if not values.get("NW_TOKEN"):
        token_file = CONFIG_DIR / "token"
        if token_file.exists():
            values["NW_TOKEN"] = token_file.read_text(encoding="utf-8").strip()
    missing = [k for k in ("NW_SUPABASE_URL", "NW_SUPABASE_KEY", "NW_TOKEN") if not values.get(k)]
    if missing:
        raise SystemExit(f"설정이 없습니다: {', '.join(missing)} (docstring 참고)")
    return values


class SupabaseDb:
    """PostgREST 로 nw_jobs / nw_pages 를 다룬다. 모든 요청에 앱 토큰 헤더를 붙이고, 권한은 DB 의 RLS 가 판정한다."""

    def __init__(self, url: str, key: str, token: str, transport: Callable | None = None, timeout: float = 60.0):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {"apikey": key, "x-nw-token": token, "Content-Type": "application/json"}
        if not key.startswith("sb_"):
            self.headers["Authorization"] = f"Bearer {key}"
        self.transport = transport or self._urllib
        self.timeout = timeout

    def _urllib(self, method: str, url: str, headers: dict, body: bytes | None) -> tuple[int, bytes]:
        request = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def _call(self, method: str, path: str, body=None, prefer: str | None = None):
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        status, raw = self.transport(method, f"{self.base}/{path}", headers, data)
        if status >= 400:
            raise RuntimeError(f"DB 오류 {status}: {raw.decode('utf-8', 'replace')[:200]}")
        return json.loads(raw) if raw else None

    def next_pending_job(self) -> dict | None:
        rows = self._call("GET", "nw_jobs?status=eq.pending&order=requested_at.asc&limit=1")
        return rows[0] if rows else None

    def claim(self, job: dict, agent: str) -> bool:
        """pending 인 경우에만 running 으로 바꾼다. 다른 워커가 먼저 가져갔으면 False."""
        rows = self._call(
            "PATCH", f"nw_jobs?id=eq.{int(job['id'])}&status=eq.pending",
            {"status": "running", "agent": agent, "started_at": iso(time.time()), "attempts": job.get("attempts", 0) + 1},
            prefer="return=representation")
        return bool(rows)

    def finish(self, job_id: int, status: str, error: str | None = None) -> None:
        self._call("PATCH", f"nw_jobs?id=eq.{int(job_id)}", {"status": status, "error": error, "finished_at": iso(time.time())},
                   prefer="return=minimal")

    def release_stale(self, agent: str, now: float | None = None) -> None:
        """이 워커가 가져간 뒤 오래 끝나지 않은 작업(워커가 죽은 경우)을 다시 대기로 돌린다."""
        cutoff = urllib.parse.quote(iso((now or time.time()) - STALE_AFTER.total_seconds()))
        self._call("PATCH", f"nw_jobs?status=eq.running&agent=eq.{urllib.parse.quote(agent)}&started_at=lt.{cutoff}",
                   {"status": "pending"}, prefer="return=minimal")

    def save_page(self, row: dict) -> None:
        self._call("POST", "nw_pages?on_conflict=key", row, prefer="resolution=merge-duplicates,return=minimal")


class JobWorker:
    def __init__(self, db: SupabaseDb, crawler: Crawler, agent: str, sleep: Callable[[float], None] = time.sleep):
        self.db, self.crawler, self.agent, self.sleep = db, crawler, agent, sleep

    def process_one(self) -> bool:
        """작업 하나를 처리한다. 처리할 작업이 없으면 False."""
        job = self.db.next_pending_job()
        if job is None:
            return False
        if not self.db.claim(job, self.agent):
            return True  # 다른 워커가 먼저 가져갔다. 바로 다음 작업을 본다
        title = job["title"]
        try:
            result = self.crawler.crawl(Target(title, title), refresh=True)
            if result.status == "error" or result.page is None:
                self.db.finish(job["id"], "error", result.error or "수집 실패")
                log.warning("실패: %s - %s", title, result.error)
                return True
            page = result.page
            self.db.save_page({
                "key": self.crawler.fetcher.key(title), "title": title, "status": page.status, "final_url": page.url,
                "via": f"집 워커 ({page.via})", "note": page.note, "html": page.html, "fetched_at": iso(page.fetched_at),
            })
            self.db.finish(job["id"], "not_found" if result.status == "not_found" else "done")
            log.info("완료: %s (%s, %.1fs)", title, result.status, result.elapsed)
        except Exception as e:  # 한 작업의 실패가 워커 전체를 멈추지 않게 한다
            log.exception("처리 중 오류: %s", title)
            try:
                self.db.finish(job["id"], "error", f"워커 오류: {e}"[:300])
            except Exception:
                log.exception("작업 상태를 기록하지 못했습니다: %s", title)
        return True

    def run(self, once: bool = False, poll: float = 10.0) -> int:
        self.db.release_stale(self.agent)
        handled = 0
        while True:
            try:
                busy = self.process_one()
            except KeyboardInterrupt:
                raise
            except Exception as e:  # DB/네트워크 일시 오류: 잠시 쉬고 다시 시도
                log.warning("대기열을 읽지 못했습니다: %s", e)
                busy = False
            if busy:
                handled += 1
                continue
            if once:
                return handled
            self.sleep(poll)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Supabase 대기열의 나무위키 수집 작업을 집 컴퓨터에서 처리한다.")
    parser.add_argument("--once", action="store_true", help="대기열을 한 번 비우고 종료한다")
    parser.add_argument("--poll", type=float, default=10.0, help="대기열이 비었을 때 다시 확인하는 간격(초)")
    parser.add_argument("--env-file", type=Path, help="설정 파일 (기본: ~/.config/namu/worker.env)")
    add_fetch_arguments(parser)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sys.setrecursionlimit(5000)

    config = load_config(env_file=args.env_file)
    db = SupabaseDb(config["NW_SUPABASE_URL"], config["NW_SUPABASE_KEY"], config["NW_TOKEN"])
    agent = f"home-worker@{socket.gethostname()}"
    worker = JobWorker(db, Crawler(build_fetcher(args)), agent)
    print(f"워커 시작: {agent} (대기열 확인 간격 {args.poll:g}초, 종료는 Ctrl+C)", flush=True)
    try:
        handled = worker.run(once=args.once, poll=args.poll)
    except KeyboardInterrupt:
        print("\n워커를 종료합니다.")
        return 0
    print(f"처리한 작업: {handled}건")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
