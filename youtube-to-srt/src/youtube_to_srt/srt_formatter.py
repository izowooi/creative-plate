"""세그먼트 리스트를 SRT 문자열로 포매팅."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str


def format_timestamp(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    hours, rem_ms = divmod(total_ms, 3_600_000)
    minutes, rem_ms = divmod(rem_ms, 60_000)
    secs, millis = divmod(rem_ms, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def format_srt(segments: Iterable[Segment]) -> str:
    parts: list[str] = []
    for idx, seg in enumerate(segments, start=1):
        start = format_timestamp(seg.start)
        end = format_timestamp(seg.end)
        text = seg.text.strip()
        parts.append(f"{idx}\n{start} --> {end}\n{text}\n")
    return "\n".join(parts)
