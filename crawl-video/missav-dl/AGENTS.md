# L4 AGENTS.md — HLS 영상 다운로더 (Streamlit)

이 문서는 이 하위 프로젝트에 적용되는 지침이다.
작업 전 아래 상위 지침을 순서대로 읽는다.

- `../CLAUDE.md` (L3 crawl-video 하네스 지침)
- `../../AGENTS.md` (L2 creative-plate)
- `../../../AGENTS.md` (L1 workspace 전역 지침)

상위 지침과 충돌하면 이 파일의 프로젝트 고유 지침을 우선한다.
단, 상위의 secret, 브랜치, force push, 시스템 설정 관련 절대 원칙은 완화하지 않는다.

## 보안 및 기밀 규칙 (절대 원칙)

- **대상 사이트명은 README, AGENTS.md, CLAUDE.md, 커밋 메시지에 절대 넣지 않는다.**
- 문서와 커밋 메시지에는 "특정 HLS 스트리밍 사이트", "대상 사이트" 등 generic 표현을 사용한다.
- 사이트명이 포함되는 참조는 코드·테스트 파일 내부로만 제한한다.
- `pyproject.toml`의 `description` 필드에도 사이트명을 넣지 않는다 (`xxxx.xx` 마스킹 규칙 유지).

## 프로젝트 목적

특정 HLS 스트리밍 사이트의 영상을 다중 URL로 일괄 다운로드하는 Streamlit 앱이다.
Playwright(headless Chromium)로 페이지를 렌더해 HLS master playlist를 추출하고,
httpx로 세그먼트를 병렬 다운로드한다.
다운로드 도중에도 새 URL을 큐에 추가할 수 있는 비동기 다운로드 큐를 포함한다.

## 기술 스택

- Python 3.11+, uv
- Streamlit >= 1.35 (UI)
- Playwright (headless Chromium, HLS URL 추출)
- httpx (세그먼트 다운로드)
- pytest (테스트)

## 프로젝트 구조

- `app.py`: Streamlit UI — 분석 단계 + 다운로드 큐 UI
- `downloader.py`: HLS 정보 추출(`get_hls_info`) + 세그먼트 다운로드(`download_hls`)
- `queue_manager.py`: 비동기 다운로드 큐(`DownloadQueueManager`, `QueueItem`)
- `state.py`: URL 목록·저장 폴더를 `~/.missav-dl/state.json`에 영속화
- `run.sh`: Streamlit 서버 실행 (포트 3101)
- `tests/`: pytest 단위 테스트

## 명령어

의존성 설치:

```bash
uv sync
uv run playwright install chromium  # 최초 1회
```

앱 실행:

```bash
./run.sh
# 또는
uv run streamlit run app.py --server.port 3101
```

테스트:

```bash
uv run pytest            # 단위 테스트만 (기본)
uv run pytest -m ''      # 통합 테스트 포함 (실제 네트워크 필요)
```

## 아키텍처 원칙

- `queue_manager.py`는 Streamlit에 의존하지 않는다. `st.*` 호출을 절대 포함하지 않는다.
- `DownloadQueueManager`는 `@st.cache_resource`로 앱 수명 동안 단일 인스턴스를 유지한다.
- `QueueItem`에는 `HlsInfo` 객체를 직접 저장하지 않는다. `app.py`에서 `pick_level`로 화질을 결정한 뒤 `level_url`, `referer`, `height` 평면 값으로 전달한다. (순환 import 방지 + 독립 단위 테스트 가능)
- 큐 진행 중 UI 자동 갱신은 `time.sleep(0.3) + st.rerun()` 패턴으로 구현한다. 외부 라이브러리를 추가하지 않는다.
- 새 URL은 분석 완료 후 "다운로드 큐에 추가" 버튼으로 언제든 큐에 넣을 수 있다. 이미 같은 `item_id`가 큐에 있으면 중복 추가되지 않는다.

## TDD 규칙

- `queue_manager.py` 로직 변경은 `tests/test_queue_manager.py`를 먼저 작성한다.
- `downloader.py` 변경은 `tests/test_downloader.py`를 먼저 작성한다.
- 단위 테스트는 실제 네트워크에 접속하지 않는다. fake `download_fn`을 주입해 상태 전이를 검증한다.
- 네트워크가 필요한 테스트는 `@pytest.mark.integration` 마커를 붙인다.

## 검증 기준

- `uv run pytest`가 통과해야 한다.
- 큐 기능: 다운로드 진행 중 새 URL 추가 → 큐에 반영 → 처리 완료를 수동으로 확인한다.
- UI 변경 시 `./run.sh`로 포트 3101에서 직접 확인한다. 확인 후 서버를 종료한다.

## 주의사항

- `.venv/`와 `.pytest_cache/`는 커밋하지 않는다.
- `state.json` (`~/.missav-dl/state.json`)은 커밋 대상이 아니다.
- Playwright는 headless 모드에서만 실행한다.
- CDN rate-limit으로 동시 처리 수가 너무 높으면 세그먼트 실패가 발생할 수 있다.
- `DownloadQueueManager` 워커 스레드는 daemon=True 로 실행되므로 앱 종료 시 자동 정리된다.
