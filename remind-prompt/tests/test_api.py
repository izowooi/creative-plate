from datetime import UTC, datetime

from fastapi.testclient import TestClient

from remind_prompt.app import create_app
from remind_prompt.config import Settings

NOW = datetime(2026, 8, 15, 12, tzinfo=UTC)


def client_for(tmp_path) -> TestClient:
    settings = Settings(
        database_path=tmp_path / "api.db",
        slack_webhook_url=None,
        poll_interval_seconds=30,
    )
    return TestClient(
        create_app(settings, start_worker=False, clock=lambda: NOW),
        base_url="http://127.0.0.1",
    )


def create_payload() -> dict:
    return {
        "title": "한 달 후 비교",
        "prompt_text": "새 모델 결과를 이전 결과와 비교해 주세요.",
        "destination_label": "Claude research 세션",
        "destination_url": "https://claude.ai/project/example",
        "project": "model-research",
        "notes": "결과 표를 함께 확인",
        "source_label": "2026-08-15 task summary",
        "source_ref": "2026/08/example.md:10",
        "schedule": {
            "type": "exact",
            "timezone": "Asia/Seoul",
            "local_datetime": "2026-08-16T21:00",
        },
    }


def test_schedule_preview_resolves_calendar_month(tmp_path) -> None:
    with client_for(tmp_path) as client:
        response = client.post(
            "/api/schedule/preview",
            json={
                "type": "relative",
                "timezone": "Asia/Seoul",
                "amount": 1,
                "unit": "month",
                "anchor_at": "2026-01-31T00:00:00Z",
            },
        )

    assert response.status_code == 200
    assert response.json()["due_local"] == "2026-02-28T09:00:00"
    assert response.json()["due_at"] == "2026-02-28T00:00:00Z"


def test_create_list_acknowledge_and_complete(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created_response = client.post("/api/reminders", json=create_payload())
        assert created_response.status_code == 201
        created = created_response.json()
        assert "claim_token" not in created
        assert "claimed_until" not in created

        listed = client.get("/api/reminders", params={"view": "upcoming"}).json()
        assert [item["id"] for item in listed["items"]] == [created["id"]]

        acknowledged = client.post(
            f"/api/reminders/{created['id']}/acknowledge",
            json={"expected_version": 1},
        )
        assert acknowledged.status_code == 200
        assert acknowledged.json()["status"] == "acknowledged"

        completed = client.post(
            f"/api/reminders/{created['id']}/complete",
            json={"expected_version": 1},
        )
        assert completed.status_code == 200
        assert completed.json()["status"] == "completed"


def test_snooze_rejects_stale_browser_action(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/reminders", json=create_payload()).json()
        action = {
            "expected_version": created["occurrence_version"],
            "schedule": {
                "type": "relative",
                "timezone": "Asia/Seoul",
                "amount": 1,
                "unit": "day",
            },
        }
        first = client.post(f"/api/reminders/{created['id']}/snooze", json=action)
        second = client.post(f"/api/reminders/{created['id']}/snooze", json=action)

    assert first.status_code == 200
    assert first.json()["occurrence_version"] == 2
    assert second.status_code == 409
    assert second.json()["code"] == "version_conflict"
    assert second.json()["current_version"] == 2


def test_patch_reschedule_and_clear_optional_fields(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/reminders", json=create_payload()).json()
        response = client.patch(
            f"/api/reminders/{created['id']}",
            json={
                "expected_version": 1,
                "project": None,
                "schedule": {
                    "type": "exact",
                    "timezone": "Asia/Seoul",
                    "local_datetime": "2026-08-20T09:30",
                },
            },
        )

    assert response.status_code == 200
    updated = response.json()
    assert updated["project"] is None
    assert updated["occurrence_version"] == 2
    assert updated["due_at"] == "2026-08-20T00:30:00Z"


def test_content_only_patch_preserves_acknowledged_schedule_state(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/reminders", json=create_payload()).json()
        acknowledged = client.post(
            f"/api/reminders/{created['id']}/acknowledge",
            json={"expected_version": 1},
        ).json()
        response = client.patch(
            f"/api/reminders/{created['id']}",
            json={"expected_version": 1, "title": "제목만 수정"},
        )

    assert response.status_code == 200
    updated = response.json()
    assert updated["status"] == "acknowledged"
    assert updated["occurrence_version"] == acknowledged["occurrence_version"] == 1
    assert updated["due_at"] == acknowledged["due_at"]
    assert updated["next_notification_at"] is None


def test_destination_url_rejects_unsafe_scheme(tmp_path) -> None:
    payload = create_payload()
    payload["destination_url"] = "javascript:alert(1)"
    with client_for(tmp_path) as client:
        response = client.post("/api/reminders", json=payload)

    assert response.status_code == 422


def test_api_responses_are_not_cached(tmp_path) -> None:
    with client_for(tmp_path) as client:
        response = client.get("/api/config")

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_untrusted_host_is_rejected(tmp_path) -> None:
    with client_for(tmp_path) as client:
        response = client.get("/api/config", headers={"host": "attacker.example"})

    assert response.status_code == 400
    assert response.text == "Invalid host header"


def test_dashboard_and_assets_are_packaged_with_security_headers(tmp_path) -> None:
    with client_for(tmp_path) as client:
        dashboard = client.get("/")
        favicon = client.get("/assets/favicon.svg")

    assert dashboard.status_code == 200
    assert "Remind Prompt" in dashboard.text
    csp = dashboard.headers["content-security-policy"]
    for directive in (
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "connect-src 'self'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ):
        assert directive in csp
    assert favicon.status_code == 200
    assert favicon.headers["content-type"].startswith("image/svg+xml")


def test_history_never_contains_prompt_text(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/reminders", json=create_payload()).json()
        history = client.get(f"/api/reminders/{created['id']}/history")

    assert history.status_code == 200
    assert "새 모델 결과" not in history.text


def test_markdown_import_is_preview_only(tmp_path) -> None:
    with client_for(tmp_path) as client:
        response = client.post(
            "/api/import/preview",
            json={
                "timezone": "Asia/Seoul",
                "documents": [
                    {
                        "name": "2026-08-15_090000_model-followup.md",
                        "content": (
                            "# 모델 후속 확인\n\n## 사용자 요청\n"
                            "- 한 달 뒤 새 모델 결과를 비교해 주세요."
                        ),
                    }
                ],
            },
        )
        reminders = client.get("/api/reminders", params={"view": "all"}).json()

    assert response.status_code == 200
    candidate = response.json()["candidates"][0]
    assert candidate["title"] == "모델 후속 확인"
    assert candidate["due_at"] == "2026-09-15T00:00:00Z"
    assert reminders["items"] == []


def test_markdown_import_rejects_path_traversal_name(tmp_path) -> None:
    with client_for(tmp_path) as client:
        response = client.post(
            "/api/import/preview",
            json={
                "timezone": "Asia/Seoul",
                "documents": [{"name": "../secret.md", "content": "# secret"}],
            },
        )

    assert response.status_code == 422
