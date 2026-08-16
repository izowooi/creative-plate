from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

JobStatus = Literal[
    "queued",
    "analyzing",
    "downloading",
    "paused",
    "completed",
    "failed",
    "cancelled",
]

ACTIVE_STATUSES: tuple[JobStatus, ...] = (
    "queued",
    "analyzing",
    "downloading",
    "paused",
)
RUNNING_STATUSES: tuple[JobStatus, ...] = ("analyzing", "downloading")
TERMINAL_STATUSES: tuple[JobStatus, ...] = ("completed", "failed", "cancelled")
ALL_STATUSES: tuple[JobStatus, ...] = ACTIVE_STATUSES + TERMINAL_STATUSES


@dataclass(frozen=True, slots=True)
class HlsLevel:
    height: int
    url: str

    @property
    def quality(self) -> str:
        return f"{self.height}p" if self.height > 0 else "source"


@dataclass(frozen=True, slots=True)
class HlsInfo:
    master_url: str
    levels: tuple[HlsLevel, ...]
    referer: str


@dataclass(frozen=True, slots=True)
class Segment:
    url: str
    is_init: bool = False


@dataclass(frozen=True, slots=True)
class MediaPlaylist:
    segments: tuple[Segment, ...]


@dataclass(frozen=True, slots=True)
class DownloadResult:
    output_path: str
    completed_segments: int
    total_segments: int
    bytes_written: int
    skipped: bool = False


class JobNotFoundError(LookupError):
    pass


class InvalidTransitionError(RuntimeError):
    pass


class DuplicateJobError(RuntimeError):
    def __init__(self, existing_job_id: str) -> None:
        super().__init__("an active job already exists")
        self.existing_job_id = existing_job_id


class PlaylistError(ValueError):
    pass


class BrowserInterruptedError(RuntimeError):
    """The browser disappeared mid-analysis and the job may be retried safely."""


def partial_output_path(output_path: str | Path, job_id: str) -> Path:
    final_path = Path(output_path)
    return final_path.with_name(f".{final_path.name}.{job_id}.part")
