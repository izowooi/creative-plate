from __future__ import annotations

from pathlib import Path

from starlette.testclient import TestClient

from hls_manager.app import create_app
from hls_manager.config import AppConfig
from hls_manager.db import JobStore


class FakeScheduler:
    def __init__(self) -> None:
        self.accepting = False
        self.notifications = 0
        self.cancelled: list[str] = []
        self.concurrency = 4

    async def start(self) -> None:
        self.accepting = True

    async def shutdown(self) -> None:
        self.accepting = False

    def notify(self) -> None:
        self.notifications += 1

    def cancel_running(self, job_id: str) -> bool:
        self.cancelled.append(job_id)
        return True

    def cancel_many(self, job_ids: list[str]) -> None:
        self.cancelled.extend(job_ids)

    def set_concurrency(self, value: int) -> None:
        self.concurrency = value


def make_client(tmp_path: Path) -> tuple[TestClient, JobStore, FakeScheduler]:
    output = tmp_path / "downloads"
    public = tmp_path / "public"
    public.mkdir()
    (public / "index.html").write_text("ok", encoding="utf-8")
    config = AppConfig(
        data_dir=tmp_path / "data",
        default_output_dir=output,
        public_dir=public,
    )
    store = JobStore(tmp_path / "jobs.sqlite3")
    scheduler = FakeScheduler()
    app = create_app(
        config,
        store=store,
        scheduler=scheduler,  # type: ignore[arg-type]
        use_process_lock=False,
    )
    return TestClient(app), store, scheduler


def test_api_create_dashboard_actions_settings_and_delete(tmp_path: Path) -> None:
    client, store, scheduler = make_client(tmp_path)
    output = tmp_path / "new-downloads"
    try:
        with client:
            health = client.get("/api/health")
            assert health.status_code == 200
            assert health.json()["checks"] == {
                "database": True,
                "outputDirectory": True,
            }

            body = {
                "urls": ["https://example.com/video1"],
                "outputDir": str(output),
                "preferredQuality": 720,
                "overwrite": False,
            }
            created_response = client.post("/api/jobs", json=body)
            assert created_response.status_code == 201
            created = created_response.json()["created"]
            assert len(created) == 1 and output.is_dir()
            job_id = created[0]["id"]
            assert "playlistUrl" not in created[0] and "referer" not in created[0]

            duplicate = client.post("/api/jobs", json=body).json()
            assert not duplicate["created"]
            assert duplicate["skipped"][0]["existingJobId"] == job_id

            paused = client.post(f"/api/jobs/{job_id}/action", json={"action": "pause"})
            assert paused.status_code == 200 and paused.json()["job"]["status"] == "paused"
            resumed = client.post(f"/api/jobs/{job_id}/action", json={"action": "resume"})
            assert resumed.json()["job"]["status"] == "queued"

            dashboard = client.get("/api/dashboard?limit=10&offset=0").json()
            assert dashboard["pagination"]["total"] == 1
            assert dashboard["settings"]["defaultOutputDir"] == str(tmp_path / "downloads")
            assert dashboard["settings"]["recentOutputDirs"] == [str(output)]

            settings = client.patch("/api/settings", json={"concurrency": 8})
            assert settings.status_code == 200
            assert settings.json()["settings"]["concurrency"] == 8
            assert scheduler.concurrency == 8

            cancelled = client.post(f"/api/jobs/{job_id}/action", json={"action": "cancel"})
            assert cancelled.json()["job"]["status"] == "cancelled"
            deleted = client.delete(f"/api/jobs/{job_id}")
            assert deleted.status_code == 200 and deleted.json()["deleted"]
    finally:
        store.close()


def test_api_range_and_ssrf_validation(tmp_path: Path) -> None:
    client, store, _ = make_client(tmp_path)
    try:
        with client:
            expanded = client.post(
                "/api/ranges/expand",
                json={
                    "startUrl": "https://example.com/v007",
                    "endUrl": "https://example.com/v009",
                },
            )
            assert expanded.status_code == 200
            assert len(expanded.json()["urls"]) == 3

            for url in (
                "http://127.0.0.1/video",
                "http://2130706433/video",
                "http://0x7f000001/video",
                "http://0177.0.0.1/video",
                "https://user:pass@example.com/video",
                "https://example.com/video#fragment",
            ):
                response = client.post(
                    "/api/jobs",
                    json={"urls": [url], "outputDir": str(tmp_path / "out")},
                )
                assert response.status_code == 400
    finally:
        store.close()


def test_mutations_require_json_and_reject_cross_origin_browser_requests(tmp_path: Path) -> None:
    client, store, _ = make_client(tmp_path)
    payload = '{"startUrl":"https://example.com/v1","endUrl":"https://example.com/v2"}'
    try:
        with client:
            wrong_type = client.post(
                "/api/ranges/expand",
                content=payload,
                headers={"Content-Type": "text/plain"},
            )
            assert wrong_type.status_code == 415

            cross_origin = client.post(
                "/api/ranges/expand",
                content=payload,
                headers={
                    "Content-Type": "application/json",
                    "Origin": "https://attacker.example",
                },
            )
            assert cross_origin.status_code == 403

            same_origin = client.post(
                "/api/ranges/expand",
                content=payload,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "Origin": "http://testserver",
                },
            )
            assert same_origin.status_code == 200

            # CLI/PM2 health tooling does not send Origin and remains supported.
            no_origin = client.post(
                "/api/ranges/expand",
                content=payload,
                headers={"Content-Type": "application/json"},
            )
            assert no_origin.status_code == 200
    finally:
        store.close()


def test_static_index_is_served(tmp_path: Path) -> None:
    client, store, _ = make_client(tmp_path)
    try:
        with client:
            response = client.get("/")
            assert response.status_code == 200 and response.text == "ok"
            assert response.headers["x-content-type-options"] == "nosniff"
            assert response.headers["x-frame-options"] == "DENY"
            assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    finally:
        store.close()
