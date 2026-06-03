from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from .recorder import run


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=int, default=300, help="seconds between samples")
    parser.add_argument("--duration", type=int, default=120, help="duration in minutes; 0 runs until Ctrl+C")
    parser.add_argument("--csv", type=Path, default=Path("data/daegu_election.csv"))
    parser.add_argument("--charts-dir", type=Path, default=Path("data/charts"))
    parser.add_argument("--start-url", default="https://search.naver.com/")
    parser.add_argument("--settle-ms", type=int, default=1500)
    parser.add_argument("--parse-timeout-ms", type=int, default=10000)
    parser.add_argument("--duplicate-policy", choices=("skip", "record"), default="skip")
    parser.add_argument("--no-charts", action="store_true")
    args = parser.parse_args()
    try:
        asyncio.run(
            run(
                interval_seconds=args.interval,
                duration_minutes=args.duration,
                csv_path=args.csv,
                charts_dir=args.charts_dir,
                start_url=args.start_url,
                settle_ms=args.settle_ms,
                parse_timeout_ms=args.parse_timeout_ms,
                duplicate_policy=args.duplicate_policy,
                create_charts=not args.no_charts,
            )
        )
    except KeyboardInterrupt:
        print("\n사용자 중단으로 수집을 종료합니다.")


if __name__ == "__main__":
    main()
