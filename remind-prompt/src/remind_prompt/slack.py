from __future__ import annotations

import html
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx

from remind_prompt.time_utils import from_db


@dataclass(frozen=True, slots=True)
class SlackResult:
    success: bool
    http_status: int | None = None
    error: str | None = None
    retryable: bool = False
    retry_after_seconds: int | None = None


def _safe_fallback(value: str) -> str:
    return value.replace("@", "@\u200b").replace("<", "‹").replace(">", "›")


def _escape_mrkdwn(value: str) -> str:
    return html.escape(value, quote=False).replace("@", "@\u200b")


class SlackNotifier:
    def __init__(
        self,
        webhook_url: str | None,
        *,
        base_url: str,
        prompt_max_chars: int = 1_200,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._webhook_url = webhook_url
        self._base_url = base_url.rstrip("/")
        self._prompt_max_chars = prompt_max_chars
        self._client = client

    @property
    def configured(self) -> bool:
        return bool(self._webhook_url)

    def build_payload(self, reminder: dict[str, Any]) -> dict[str, Any]:
        title = reminder["title"][:140]
        due = from_db(reminder["due_at"])
        if due is None:
            raise ValueError("Reminder is missing due_at")
        due_epoch = int(due.timestamp())
        due_fallback = due.isoformat(timespec="minutes")
        destination = _escape_mrkdwn(reminder["destination_label"][:300])
        project = _escape_mrkdwn((reminder.get("project") or "미지정")[:300])
        reminder_url = f"{self._base_url}/?reminder={quote(reminder['id'])}"
        blocks: list[dict[str, Any]] = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"🔔 {title}",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*프로젝트*\n{project}"},
                    {"type": "mrkdwn", "text": f"*넣을 곳*\n{destination}"},
                    {
                        "type": "mrkdwn",
                        "text": (
                            "*예정 시각*\n"
                            f"<!date^{due_epoch}^{{date_short_pretty}} {{time}}|{due_fallback}>"
                        ),
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*상태*\n확인 전 · {reminder['notification_count'] + 1}번째 알림",
                    },
                ],
            },
        ]
        if self._prompt_max_chars > 0:
            prompt = reminder["prompt_text"]
            if len(prompt) > self._prompt_max_chars:
                prompt = prompt[: self._prompt_max_chars].rstrip() + "…"
            blocks.append(
                {
                    "type": "section",
                    "text": {
                        "type": "plain_text",
                        "text": f"실행할 프롬프트\n{prompt}",
                        "emoji": True,
                    },
                }
            )
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": (
                            f"<{reminder_url}|웹에서 확인 · 복사 · 미루기 · 완료>"
                            f"  ·  ID `{reminder['id'][:8]}`"
                        ),
                    }
                ],
            }
        )
        return {
            "text": _safe_fallback(f"프롬프트 리마인더: {title}"),
            "blocks": blocks,
            "unfurl_links": False,
            "unfurl_media": False,
        }

    async def send(self, reminder: dict[str, Any]) -> SlackResult:
        if not self._webhook_url:
            return SlackResult(success=False, error="Slack Incoming Webhook is not configured")
        payload = self.build_payload(reminder)
        try:
            if self._client is not None:
                response = await self._client.post(self._webhook_url, json=payload)
            else:
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.post(self._webhook_url, json=payload)
        except httpx.HTTPError as exc:
            return SlackResult(
                success=False,
                error=f"Slack network error ({type(exc).__name__})",
                retryable=True,
            )

        if 200 <= response.status_code < 300 and response.text.strip() == "ok":
            return SlackResult(success=True, http_status=response.status_code)

        error_code = response.text.strip()[:120] or "empty response"
        error_code = error_code.replace(self._webhook_url, "[REDACTED]")
        retryable = response.status_code in {408, 409, 425, 429} or response.status_code >= 500
        retry_after: int | None = None
        if response.status_code == 429:
            try:
                retry_after = max(1, int(response.headers.get("Retry-After", "1")))
            except ValueError:
                retry_after = 1
        return SlackResult(
            success=False,
            http_status=response.status_code,
            error=f"Slack returned HTTP {response.status_code}: {error_code}",
            retryable=retryable,
            retry_after_seconds=retry_after,
        )
