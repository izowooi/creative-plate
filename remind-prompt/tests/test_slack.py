import json

import httpx
import pytest

from remind_prompt.slack import SlackNotifier


def reminder_payload() -> dict:
    return {
        "id": "abcd1234-1111-2222-3333-444444444444",
        "title": "@channel <검토>",
        "prompt_text": "@here 이전 결과와 <새 결과>를 비교해 주세요.",
        "destination_label": "Claude 세션",
        "project": "R&D",
        "due_at": "2026-08-16T12:00:00Z",
        "notification_count": 0,
    }


@pytest.mark.asyncio
async def test_slack_payload_uses_blocks_and_neutralizes_fallback_mentions() -> None:
    captured: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(json.loads(request.content))
        return httpx.Response(200, text="ok")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        notifier = SlackNotifier(
            "https://hooks.slack.test/services/secret",
            base_url="http://127.0.0.1:8765",
            client=client,
        )
        result = await notifier.send(reminder_payload())

    assert result.success
    assert "@\u200bchannel" in captured[0]["text"]
    assert captured[0]["unfurl_links"] is False
    prompt_block = captured[0]["blocks"][2]["text"]
    assert prompt_block["type"] == "plain_text"
    assert "@here" in prompt_block["text"]


@pytest.mark.asyncio
async def test_slack_429_honors_retry_after() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate_limited", headers={"Retry-After": "17"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        notifier = SlackNotifier(
            "https://example.test/hook", base_url="http://localhost", client=client
        )
        result = await notifier.send(reminder_payload())

    assert not result.success
    assert result.retryable
    assert result.retry_after_seconds == 17


@pytest.mark.asyncio
async def test_slack_network_error_does_not_persist_secret_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("secret URL in exception", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        notifier = SlackNotifier(
            "https://hooks.slack.test/services/super-secret",
            base_url="http://localhost",
            client=client,
        )
        result = await notifier.send(reminder_payload())

    assert result.retryable
    assert "super-secret" not in (result.error or "")
    assert "secret URL" not in (result.error or "")


@pytest.mark.asyncio
async def test_slack_error_response_redacts_webhook_url() -> None:
    webhook = "https://hooks.slack.test/services/super-secret"

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(400, text=f"invalid webhook {webhook}")

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        notifier = SlackNotifier(webhook, base_url="http://localhost", client=client)
        result = await notifier.send(reminder_payload())

    assert "super-secret" not in (result.error or "")
    assert "[REDACTED]" in (result.error or "")
