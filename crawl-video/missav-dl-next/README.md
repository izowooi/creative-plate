# HLS Download Manager

여러 페이지 URL을 영속 큐에 넣고, 기본 4개씩 병렬 다운로드하는 로컬 웹앱입니다. 기존 Streamlit 앱과 별도 폴더에서 동작하며 기존 앱의 파일이나 상태를 변경하지 않습니다.

## 달라진 점

- **메모리 상한이 영상 크기와 무관합니다.** 영상별 최대 512 KiB의 bounded queue와 전용 writer thread를 사용하고, queue가 차면 libcurl 전송 자체를 잠시 멈춥니다. 영상 전체를 `bytes[]`에 보관하지 않습니다.
- **실패 작업을 바로 다시 실행할 수 있습니다.** 개별 재시도와 실패 전체 재시도를 지원합니다.
- **모든 작업이 SQLite에 남습니다.** URL, 상태, 선택 화질, 출력 경로, 진행량, 시각, 오류와 시도 횟수를 재시작 후에도 조회할 수 있습니다.
- **큐를 제어할 수 있습니다.** 실행 중인 작업을 일시정지하거나 취소하고, 다시 대기열에 넣을 수 있습니다.
- **서버 재시작을 복구합니다.** 분석·다운로드 중 종료된 작업은 다음 시작 때 다시 대기열로 돌아갑니다. 완성 파일은 `.part`에서 원자적으로 publish됩니다.
- **UI와 작업 수명이 분리되어 있습니다.** 브라우저 탭을 닫아도 서버 큐는 계속 처리하며, SSE로 열린 화면에 진행 상태를 보냅니다.
- **Chrome을 공유합니다.** URL마다 browser process를 새로 띄우지 않고 격리된 context만 만들며, 분석이 끝나면 유휴 browser를 닫습니다.

## 기술 구성

```text
Browser SPA (HTML/CSS/JS)
        │ REST + SSE
        ▼
Starlette / Uvicorn
        ├── SQLite WAL     작업·설정·히스토리
        ├── Playwright     페이지에서 HLS 정보 분석
        └── curl-cffi      browser TLS + bounded streaming
                              │
                              ▼
                     .part → atomic rename
```

Python을 없애는 것보다 메모리 사용의 원인이었던 전체 영상 buffering을 제거하는 것이 핵심입니다. 대상 CDN에서 이미 검증된 browser TLS transport를 유지하기 위해 Python 3.13을 사용하고, Streamlit·중첩 `ThreadPoolExecutor`·in-memory queue는 모두 제거했습니다.

`curl-cffi`의 일반 async stream은 내부 수신 queue 크기를 제한하지 않으므로 사용하지 않습니다. 이 앱은 libcurl callback에 byte/item 상한을 걸고, 디스크 writer가 따라잡을 때만 전송을 재개합니다. 로컬 검증에서는 64 MiB 스트림 4개(총 256 MiB)를 동시에 받아도 최대 RSS가 약 52.8 MiB였고, 가장 많이 찬 영상별 queue도 256 KiB였습니다.

## 요구 사항

- macOS의 Python 3.13
- [uv](https://docs.astral.sh/uv/)
- 데스크톱 Google Chrome
- 선택: PM2로 상시 실행하려면 Node.js와 PM2

기본 포트는 기존 앱의 `3101`과 겹치지 않는 `3102`입니다.

## 설치와 실행

```bash
cd /Users/izowooi/git/creative-plate/crawl-video/missav-dl-next
uv sync --frozen
./start.sh
```

브라우저에서 `http://127.0.0.1:3102`를 엽니다. 최초 설치 후에는 `./start.sh`만 실행하면 됩니다.

테스트:

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

개발 서버는 다음처럼 실행할 수 있습니다.

```bash
PYTHONPATH=src uv run python -m hls_manager
```

## 사용 흐름

1. 페이지 URL을 한 줄에 하나씩 붙여 넣습니다.
2. 절대 저장 경로와 선호 화질을 정합니다.
3. `대기열에 추가`를 누릅니다. 분석과 다운로드는 이어서 자동 실행됩니다.
4. 진행 중 화면에서 일시정지·취소할 수 있습니다.
5. 실패 탭에서 원인을 확인하고 개별 또는 전체 재시도를 실행합니다.
6. 히스토리 검색과 상태 filter로 과거 URL과 출력 파일을 찾습니다.

끝 숫자가 연속되는 URL은 `범위 URL 만들기`에서 시작·끝 URL을 입력해 목록으로 확장할 수 있습니다.

일시정지는 현재 network 작업을 즉시 끊습니다. 아직 HLS segment checkpoint resume은
지원하지 않으므로 `처음부터 재개`하면 해당 영상은 처음부터 다시 다운로드합니다.

## 설정

기본값은 별도 설정 없이 안전하게 localhost에만 bind됩니다. 필요하면 `.env.example`을 `.env`로 복사해 바꿉니다. 이미 shell 또는 PM2에 지정된 환경변수가 `.env`보다 우선합니다.

| 변수 | 기본값 | 설명 |
|---|---:|---|
| `HOST` | `127.0.0.1` | HTTP bind 주소 |
| `PORT` | `3102` | HTTP port |
| `APP_DATA_DIR` | `~/.hls-download-manager` | SQLite와 process lock 위치 |
| `DEFAULT_OUTPUT_DIR` | `~/Downloads` | UI의 초기 저장 경로 |
| `DOWNLOAD_CONCURRENCY` | `4` | 동시에 처리할 영상 수, 1~8 |
| `ANALYZE_CONCURRENCY` | `2` | 동시에 열 Chrome context 수, 1~4 |
| `BROWSER_CHANNEL` | `chrome` | Playwright browser channel |
| `BROWSER_HEADLESS` | `false` | 대상 페이지 호환을 위한 기본 headed 모드 |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | 종료 시 작업 정리 최대 대기 시간 |

설정과 히스토리는 `APP_DATA_DIR`의 SQLite DB에 있고, 실제 영상과 분리됩니다. DB backup은 앱을 멈춘 뒤 해당 디렉터리를 복사하는 방식이 가장 단순합니다.

## PM2 상시 실행

PM2 설치는 한 번만 수행합니다.

```bash
npm install --global pm2
cd /Users/izowooi/git/creative-plate/crawl-video/missav-dl-next
uv sync --frozen
pm2 start ecosystem.config.cjs
pm2 status hls-download-manager
pm2 logs hls-download-manager
```

재부팅 후 자동 시작이 필요하면 현재 계정에서 다음을 실행합니다.

```bash
pm2 save
pm2 startup
```

`pm2 startup`이 출력하는 관리자 명령은 macOS 환경에 따라 달라지므로 그 안내를 확인해 실행합니다.

업데이트 후에는 dependency와 lockfile을 동기화한 뒤 재시작합니다.

```bash
uv sync --frozen
pm2 restart hls-download-manager
curl --fail http://127.0.0.1:3102/api/health
```

PM2는 shell launcher가 아니라 최종 Python process까지 신호가 전달되도록 `exec` 기반으로 실행됩니다. 종료 시 신규 작업 수락을 멈추고, 활성 request와 Chrome을 취소한 뒤 SQLite 상태를 복구 가능한 형태로 정리합니다.

## 파일 안전성과 제한

- 출력은 같은 폴더의 `.part`에 먼저 기록하고 모든 세그먼트가 성공한 뒤 최종 파일명으로 바꿉니다.
- URL hash가 파일명에 포함되어 서로 다른 URL의 같은 slug가 충돌하지 않습니다.
- 기존 완성 파일은 기본적으로 덮어쓰지 않습니다. UI에서 명시적으로 허용할 수 있습니다.
- 취소·실패 시 `.part`를 제거하고, 강제 종료로 남은 `.part`도 다음 시작 때 정리합니다.
- 암호화 HLS, byte-range playlist처럼 안전하게 단순 연결할 수 없는 profile은 손상된 파일을 만들지 않고 명시적으로 실패 처리합니다.
- 즉시 쓰기와 완료 시 `fsync`를 사용하므로 APFS 같은 로컬 파일시스템을 권장합니다. 느린 NAS나 network mount는 UI 반응과 종료가 늦어질 수 있습니다.
- mutation API는 same-origin 요청과 JSON body만 허용합니다. 입력·redirect·발견된 HLS URL은 private IP, 비표준 IPv4 표현, DNS rebinding을 검사하며 curl 연결은 검증한 주소에 고정합니다.
- 기본 구성은 인증이 없는 단일 사용자 로컬 앱입니다. `HOST=0.0.0.0`으로 LAN에 공개하려면 인증 reverse proxy와 firewall을 먼저 구성하세요.
- 다운로드 권한과 콘텐츠 이용 조건은 사용자가 확인해야 합니다.

`curl-cffi`는 `0.16.x`에 고정되어 있습니다. 버전을 올릴 때는 libcurl pause/resume 연동이 계속 맞는지 다음 호환성 test를 먼저 통과시켜야 합니다.

```bash
uv run pytest tests/test_bounded_transport.py
```

## 문제 해결

Chrome 분석이 실패하면 데스크톱 Google Chrome이 설치되어 있고 Mac 사용자 세션이 로그인 상태인지 확인합니다. PM2가 `uv`를 찾지 못하면 실행 파일을 지정합니다.

```bash
UV_BIN=/absolute/path/to/uv pm2 restart hls-download-manager --update-env
```

서버 상태와 최근 오류는 다음 두 곳에서 확인합니다.

```bash
curl http://127.0.0.1:3102/api/health
pm2 logs hls-download-manager --lines 200
```
