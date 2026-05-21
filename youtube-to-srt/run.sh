#!/usr/bin/env bash
#
# youtube-to-srt 서비스 실행 스크립트
#   - Gradio UI (faster-whisper + yt-dlp)
#   - Cloudflare tunnel 동시 실행
#
# 사용법:
#   ./run.sh
#
# 사전 준비:
#   1) `uv sync` 로 의존성 설치 완료되어 있어야 함
#   2) `.env.local` 파일에 CLOUDFLARE_TUNNEL_TOKEN 정의되어 있어야 함
#      (`.env.local.example` 복사해서 만들면 됨)
#

set -euo pipefail

# 이 스크립트 위치로 이동
cd "$(dirname "$0")"

# ---------------- 시크릿 로드 ----------------
if [ ! -f .env.local ]; then
  echo "❌ .env.local 파일이 없습니다."
  echo "   cp .env.local.example .env.local 후 토큰을 채워 주세요."
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env.local
set +a

if [ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then
  echo "❌ CLOUDFLARE_TUNNEL_TOKEN 값이 비어 있습니다. .env.local 확인."
  exit 1
fi

# ---------------- 의존성 체크 ----------------
if ! command -v uv >/dev/null 2>&1; then
  echo "❌ uv가 설치되어 있지 않습니다. https://github.com/astral-sh/uv 참고."
  exit 1
fi
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared가 설치되어 있지 않습니다."
  echo "   brew install cloudflared"
  exit 1
fi

# ---------------- cleanup hook ----------------
APP_PID=""
TUNNEL_PID=""
cleanup() {
  echo ""
  echo "🛑 정리 중..."
  [ -n "$APP_PID" ]    && kill "$APP_PID"    2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  wait 2>/dev/null || true
  echo "✅ 종료 완료."
}
trap cleanup EXIT INT TERM

# ---------------- 실행 ----------------
# Gradio는 GRADIO_SERVER_PORT 환경변수를 기본 포트로 사용한다.
export GRADIO_SERVER_PORT=3100

echo "🎙️  Starting YouTube-to-SRT (Gradio) on http://127.0.0.1:${GRADIO_SERVER_PORT} ..."
uv run youtube-to-srt-ui &
APP_PID=$!

# Gradio 부팅 대기
sleep 3

echo "☁️  Starting Cloudflare tunnel ..."
cloudflared tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" &
TUNNEL_PID=$!

echo ""
echo "▶ 두 서비스가 떴습니다. 종료하려면 Ctrl+C"
wait
