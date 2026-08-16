from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds")


@dataclass(slots=True)
class EventSubscription:
    queue: asyncio.Queue[dict[str, Any]]


class EventBroker:
    """Small in-process notification fan-out; SQLite remains the source of truth."""

    def __init__(self, *, queue_size: int = 32) -> None:
        self._queue_size = queue_size
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()

    def publish(self, kind: str = "change", **payload: Any) -> None:
        event = {"type": kind, "at": utc_now(), **payload}
        for queue in tuple(self._subscribers):
            if queue.full():
                with suppress(asyncio.QueueEmpty):
                    queue.get_nowait()
            with suppress(asyncio.QueueFull):
                queue.put_nowait(event)

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[EventSubscription]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(self._queue_size)
        self._subscribers.add(queue)
        try:
            yield EventSubscription(queue)
        finally:
            self._subscribers.discard(queue)
