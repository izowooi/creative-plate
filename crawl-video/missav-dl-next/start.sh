#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
UV_BIN="${UV_BIN:-}"

if [[ -z "$UV_BIN" ]]; then
  UV_BIN="$(command -v uv || true)"
fi

if [[ -z "$UV_BIN" || ! -x "$UV_BIN" ]]; then
  echo "uv를 찾을 수 없습니다. UV_BIN에 실행 파일 경로를 지정하세요." >&2
  exit 1
fi

export PYTHONPATH="$SCRIPT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"
cd "$SCRIPT_DIR"
exec "$UV_BIN" run --frozen python -m hls_manager
