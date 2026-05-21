#!/usr/bin/env bash
#
# missav-dl 서비스 실행 스크립트 (내부 전용, Cloudflare tunnel 사용 안 함)
#   - Streamlit UI (Playwright + HLS 세그먼트 다운로더)
#
# 사용법:
#   ./run.sh
#
# 사전 준비:
#   1) `uv sync` 로 의존성 설치
#   2) `uv run playwright install chromium` (최초 1회)
#

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v uv >/dev/null 2>&1; then
  echo "❌ uv가 설치되어 있지 않습니다. https://github.com/astral-sh/uv 참고."
  exit 1
fi

PORT=3101

echo "📼 Starting missav-dl (Streamlit) on http://localhost:${PORT} ..."
exec uv run streamlit run app.py --server.port "${PORT}"
