# L4 AGENTS.md — grok-clip-chain

이 문서는 `grok-clip-chain` 서브 프로젝트에 적용되는 작업 지침이다.
상위 `../AGENTS.md`(저장소 루트)와 `../../AGENTS.md`(workspace L1), `~/.claude/CLAUDE.md`의 안전 규칙을 먼저 따른다.
상위와 충돌하면 이 문서의 더 구체적인 규칙을 우선하되, secret·브랜치 생성·force push·시스템 설정 관련 절대 원칙은 완화하지 않는다.

## 프로젝트 목적

웹앱에 접속해 **1회 Grok(xAI) 로그인**만 하면 Grok 생성형 video AI를 사용할 수 있는 웹앱.
하나의 프롬프트를 10초 단위 세그먼트 체인으로 계획하고, text→video / video extension을 순차 생성해 `ffmpeg`로 1개의 mp4로 병합한다.
자세한 동작·아키텍처·진행 상태는 `docs/WORKLOG.md` 참조.

## 기술 스택

- Runtime: Node.js >= 20, ES Module, TypeScript (`strict`)
- Server: Express 5 (`src/server.ts`) — API + 정적 UI serving
- Frontend: React 19 + Vite 7 (`ui/src` → `dist-ui/`)
- Grok proxy: `progrok` 0.2.0 (`vendor/progrok-0.2.0.tgz`, `file:` 의존성). 자식 프로세스로 기동.
- Media: 외부 `ffmpeg`/`ffprobe` (PATH 필수)
- Auth: progrok PKCE 브라우저 OAuth(`progrok login --browser`, loopback 56121). 토큰은 `~/.progrok/auth.json`.
- Test: `node:test`

## 구조

```
src/server.ts         # bootstrap + proxy 기동 + 정적 UI
src/routes/           # auth / plan / run API (SSE 포함)
src/lib/              # auth, planner, videoAdapter, chainRunner, media, runStore, config ...
src/types/domain.ts   # 공유 타입
ui/src/               # React 앱 (main.tsx, api.ts)
tests/                # node:test 계약/회귀
vendor/               # vendored progrok tgz
dist/ dist-ui/        # 빌드 산출물 (gitignore, 재생성 가능)
docs/WORKLOG.md       # 작업 내역·계획·남은 일 (이어서 작업할 때 먼저 읽기)
```

## 명령

```bash
npm install          # vendor tgz 포함
npm run typecheck    # tsc --noEmit
npm test             # node:test (현재 11 tests)
npm run build        # vite(ui) + tsc(server)
npm start            # http://127.0.0.1:3456 (progrok proxy 자동 기동)
npm run dev          # tsx watch (server 핫리로드)
```

검증 기본값: 코드 수정 시 `npm run typecheck`와 `npm test`를 돌린다. UI/서버 동작 변경은 `npm run build` 후 `npm start`로 확인한다. 문서만 수정한 경우 생략하고 사유를 한 줄 남긴다.

## 작업 규칙

- 설정값은 `src/lib/config.ts`에 모으고 env override를 따른다. 하드코딩하지 않는다.
- 새 dependency는 보수적으로. `progrok`는 vendored tgz이며, 갱신 시 ima2-gen 원본과 동기화한다.
- 성급한 공통화보다 명확한 중복을 선호한다(상위 L1 규칙).
- 에러는 `lib/errors.ts`의 `appError(message, status, code)` 패턴을 따른다. route는 `errorInfo`로 변환해 응답한다.
- 영상 생성 호출은 항상 progrok proxy URL(`getGrokProxyUrl`)을 경유한다. xAI를 직접 호출하지 않는다.
- run 데이터(`~/.grok-clip-chain/runs`)와 토큰(`~/.progrok/auth.json`)은 커밋 대상이 아니다.

## 로컬 서버/포트

- `npm start` 시 응답에 `cwd`, 명령, URL(`http://127.0.0.1:3456`), proxy port(`18645`)를 남긴다.
- progrok proxy는 **로그인 전까지 재시작 루프**를 도는 것이 정상이다(로그 "Not logged in" 반복). 버그로 오인하지 않는다.
- 검증용 서버는 작업 종료 전 종료한다. 사용자가 유지를 요청한 경우(예: 로그인 대기)에만 켜 둔다.

## 테스트·빌드 실패 시

- 근본 원인을 수정한다. `--no-verify`·테스트 스킵 등 우회는 사용자 명시 요청 시에만.
- `ffmpeg`/`ffprobe` 부재(`MEDIA_TOOLS_MISSING`)는 환경 문제이므로 사용자에게 설치를 요청한다(`brew install ffmpeg`).

## 민감 정보

- `~/.progrok/auth.json`(access/refresh token)을 출력·커밋·업로드하지 않는다.
- `.env` 계열은 읽거나 커밋하지 않는다. 샘플(`.env.example`)만 안전 템플릿으로 취급한다.
