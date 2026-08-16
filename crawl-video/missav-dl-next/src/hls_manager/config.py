from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _env(name: str, default: str) -> str:
    value = os.environ.get(name)
    return default if value is None or not value.strip() else value.strip()


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = _env(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def _bool_env(name: str, default: bool) -> bool:
    raw = _env(name, "true" if default else "false").lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be true or false")


@dataclass(frozen=True, slots=True)
class AppConfig:
    host: str = "127.0.0.1"
    port: int = 3102
    data_dir: Path = Path.home() / ".hls-download-manager"
    default_output_dir: Path = Path.home() / "Downloads"
    download_concurrency: int = 4
    analyze_concurrency: int = 2
    browser_channel: str = "chrome"
    browser_headless: bool = False
    browser_idle_seconds: float = 30.0
    shutdown_timeout_seconds: float = 10.0
    request_timeout_seconds: float = 120.0
    progress_update_interval: float = 0.25
    max_urls_per_request: int = 1_000
    max_range_urls: int = 10_000
    max_url_length: int = 4_096
    max_playlist_bytes: int = 4 * 1024 * 1024
    max_segments: int = 100_000
    max_segment_bytes: int = 2 * 1024 * 1024 * 1024
    stream_chunk_bytes: int = 64 * 1024
    public_dir: Path = PROJECT_ROOT / "public"

    @property
    def database_path(self) -> Path:
        return self.data_dir / "jobs.sqlite3"

    @property
    def lock_path(self) -> Path:
        return self.data_dir / "manager.lock"


def load_config(*, env_file: Path | None = None) -> AppConfig:
    """Load project configuration without replacing shell or PM2 variables."""

    load_dotenv(env_file or PROJECT_ROOT / ".env", override=False)
    data_dir = (
        Path(_env("APP_DATA_DIR", str(Path.home() / ".hls-download-manager")))
        .expanduser()
        .resolve(strict=False)
    )
    output_dir = (
        Path(_env("DEFAULT_OUTPUT_DIR", str(Path.home() / "Downloads")))
        .expanduser()
        .resolve(strict=False)
    )
    return AppConfig(
        host=_env("HOST", "127.0.0.1"),
        port=_int_env("PORT", 3102, 1, 65_535),
        data_dir=data_dir,
        default_output_dir=output_dir,
        download_concurrency=_int_env("DOWNLOAD_CONCURRENCY", 4, 1, 8),
        analyze_concurrency=_int_env("ANALYZE_CONCURRENCY", 2, 1, 4),
        browser_channel=_env("BROWSER_CHANNEL", "chrome"),
        browser_headless=_bool_env("BROWSER_HEADLESS", False),
        shutdown_timeout_seconds=(_int_env("SHUTDOWN_TIMEOUT_MS", 10_000, 100, 120_000) / 1_000),
    )
