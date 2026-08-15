from __future__ import annotations

import argparse
import asyncio
import json
import sys
from dataclasses import asdict, replace
from datetime import UTC, datetime
from pathlib import Path

import uvicorn

from remind_prompt import __version__
from remind_prompt.app import create_app
from remind_prompt.config import ConfigurationError, Settings
from remind_prompt.database import Database
from remind_prompt.slack import SlackNotifier
from remind_prompt.worker import NotificationWorker


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="remind-prompt",
        description="Local-first prompt reminders with web and Slack delivery",
    )
    parser.add_argument("--version", action="version", version=__version__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name, help_text in (
        ("run", "Run the web dashboard and notification worker together"),
        ("serve", "Run only the web dashboard/API"),
    ):
        command = subparsers.add_parser(name, help=help_text)
        command.add_argument("--host", help="Bind host (default comes from environment)")
        command.add_argument("--port", type=int, help="Bind port (default comes from environment)")

    worker = subparsers.add_parser(
        "worker", help="Run the durable notification worker without the web app"
    )
    worker.add_argument(
        "--once", action="store_true", help="Scan and dispatch once, then exit (cron/Jenkins mode)"
    )

    subparsers.add_parser("doctor", help="Check database, Slack configuration, and worker state")

    backup = subparsers.add_parser("backup", help="Create a consistent SQLite online backup")
    backup.add_argument("destination", type=Path)

    scan = subparsers.add_parser(
        "scan", help="Preview reminder candidates from local Markdown; never writes reminders"
    )
    scan.add_argument("paths", nargs="+", type=Path)
    scan.add_argument("--timezone", help="IANA timezone (defaults to app timezone)")
    scan.add_argument("--json", action="store_true", help="Print machine-readable JSON")
    return parser


def _notifier(settings: Settings) -> SlackNotifier:
    return SlackNotifier(
        settings.slack_webhook_url,
        base_url=settings.base_url,
        prompt_max_chars=settings.slack_prompt_max_chars,
    )


def _run_server(
    settings: Settings, *, with_worker: bool, host: str | None, port: int | None
) -> int:
    if host:
        settings = replace(settings, host=host)
    if port:
        settings = replace(settings, port=port)
    if settings.host not in {"127.0.0.1", "localhost", "::1"}:
        print(
            "WARNING: the dashboard contains prompt text and has no built-in login; "
            "protect it with an authenticated reverse proxy before exposing it.",
            file=sys.stderr,
        )
    uvicorn.run(
        create_app(settings, start_worker=with_worker),
        host=settings.host,
        port=settings.port,
        access_log=True,
    )
    return 0


async def _run_worker(settings: Settings, *, once: bool) -> int:
    database = Database(settings.database_path)
    database.initialize()
    worker = NotificationWorker(settings, database, _notifier(settings))
    if once:
        report = await worker.dispatch_once()
        print(json.dumps(asdict(report), ensure_ascii=False))
        return 1 if report.failed else 0
    stop_event = asyncio.Event()
    await worker.run(stop_event)
    return 0


def _doctor(settings: Settings) -> int:
    database = Database(settings.database_path)
    database.initialize()
    result = {
        "database": "ok" if database.check() else "error",
        "database_path": str(settings.database_path.resolve()),
        "slack_configured": settings.slack_configured,
        "worker_state": database.worker_state(),
        "failed_delivery_count": database.failed_delivery_count(),
        "timezone": settings.timezone,
        "dashboard_url": settings.base_url,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["database"] == "ok" else 1


def _backup(settings: Settings, destination: Path) -> int:
    destination = destination.expanduser().resolve()
    if destination.exists():
        print(f"Refusing to overwrite existing backup: {destination}", file=sys.stderr)
        return 2
    database = Database(settings.database_path)
    database.initialize()
    database.backup_to(destination)
    print(destination)
    return 0


def _collect_markdown(paths: list[Path], *, limit: int = 200) -> list[Path]:
    collected: list[Path] = []
    for requested in paths:
        resolved = requested.expanduser().resolve()
        if resolved.is_dir():
            candidates = sorted(resolved.rglob("*.md"))
        elif resolved.is_file() and resolved.suffix.lower() == ".md":
            candidates = [resolved]
        else:
            raise ValueError(f"Not a Markdown file or directory: {requested}")
        for candidate in candidates:
            if candidate.is_symlink() or not candidate.is_file():
                continue
            collected.append(candidate)
            if len(collected) > limit:
                raise ValueError(f"Scan limit exceeded ({limit} Markdown files)")
    return collected


def _scan(settings: Settings, paths: list[Path], timezone: str | None, as_json: bool) -> int:
    from remind_prompt.importer import ImportDocument, extract_candidates

    files = _collect_markdown(paths)
    documents: list[ImportDocument] = []
    for path in files:
        stat = path.stat()
        documents.append(
            ImportDocument(
                name=path.name,
                content=path.read_text(encoding="utf-8"),
                timestamp=datetime.fromtimestamp(stat.st_mtime, tz=UTC),
            )
        )
    candidates = extract_candidates(
        documents,
        timezone=timezone or settings.timezone,
    )
    serialized = [candidate.to_dict() for candidate in candidates]
    if as_json:
        print(
            json.dumps(
                {"files": len(files), "candidates": serialized}, ensure_ascii=False, indent=2
            )
        )
    else:
        print(f"Scanned {len(files)} Markdown files; found {len(serialized)} candidates.")
        for index, candidate in enumerate(serialized, 1):
            due = candidate.get("due_at") or "날짜 확인 필요"
            print(f"{index:>3}. [{candidate['confidence']}] {candidate['title']} — {due}")
            print(f"     {candidate['source_ref']}")
    return 0


def main(argv: list[str] | None = None) -> None:
    args = _parser().parse_args(argv)
    try:
        settings = Settings.from_env()
        if args.command == "run":
            code = _run_server(settings, with_worker=True, host=args.host, port=args.port)
        elif args.command == "serve":
            code = _run_server(settings, with_worker=False, host=args.host, port=args.port)
        elif args.command == "worker":
            code = asyncio.run(_run_worker(settings, once=args.once))
        elif args.command == "doctor":
            code = _doctor(settings)
        elif args.command == "backup":
            code = _backup(settings, args.destination)
        elif args.command == "scan":
            code = _scan(settings, args.paths, args.timezone, args.json)
        else:  # pragma: no cover - argparse enforces command choices
            code = 2
    except (ConfigurationError, ValueError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        code = 2
    raise SystemExit(code)
