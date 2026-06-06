# Grok Clip Chain — 작업 내역 & 계획

> 다른 AI 툴/세션이 이어서 작업할 수 있도록 현재 상태·아키텍처·남은 일을 한곳에 정리한 문서.
> 최종 갱신: 2026-06-06

## 1. 이 앱이 하는 일

웹앱에 접속 → **1회 Grok(xAI) 로그인** → Grok의 생성형 video AI로 긴 영상을 만든다.

- 한 번의 프롬프트로 **10초 단위 세그먼트 체인**을 계획(planner)하고, 각 세그먼트를 순차 생성해 1개의 mp4로 병합한다.
- 세그먼트 1: text-to-video (시작 이미지가 있으면 image-to-video).
- 세그먼트 2~N: 직전 결과물의 마지막 10초(seed window)를 입력으로 **video extension** 생성.
- 결과를 `ffmpeg`로 이어붙여 최종 mp4 다운로드 제공.
- 인증: progrok **PKCE 브라우저 OAuth** 플로우(`progrok login --browser`, loopback `127.0.0.1:56121`). 토큰은 `~/.progrok/auth.json`에 저장. 영상 생성 호출은 로컬 `progrok` 프록시(`127.0.0.1:18645`)를 경유한다. (초기엔 device-code였으나 consent 거부로 전환 — §5)

참고 원본: `/Users/izowooi/git/ima2-gen` (GPT Image 2 생성기) 구조에서 영감을 받음. progrok 프록시 바이너리는 ima2-gen에서 vendoring.

## 2. 기술 스택

- Runtime: Node.js >= 20, ES Module, TypeScript
- Server: Express 5 (`src/server.ts`)
- Frontend: React 19 + Vite 7 (`ui/src`, 빌드 산출물 `dist-ui/`)
- Media: `ffmpeg` / `ffprobe` (PATH에 필요)
- Grok 프록시: `progrok` 0.2.0 (`vendor/progrok-0.2.0.tgz`로 vendoring → `file:` 의존성)
- Test: `node --test` (node:test)

## 3. 디렉터리 구조

```
grok-clip-chain/
├── src/
│   ├── server.ts              # Express bootstrap + 프록시 기동 + 정적 UI serving
│   ├── routes/                # auth / plan / run API
│   ├── lib/                   # 핵심 로직
│   │   ├── auth.ts            # progrok PKCE 로그인(spawn) + 토큰 조회
│   │   ├── planner.ts         # Grok로 세그먼트별 프롬프트 계획 생성
│   │   ├── videoAdapter.ts    # Grok 영상 생성/연장 + polling + 다운로드
│   │   ├── chainRunner.ts     # 세그먼트 체인 실행 + 재시도/일시정지/병합 (SSE emit)
│   │   ├── media.ts           # ffmpeg seed/tail 추출, concat
│   │   ├── runStore.ts        # run manifest 영속화 (~/.grok-clip-chain/runs)
│   │   ├── grokProxyLauncher.ts # progrok proxy 자식 프로세스 관리/재시작
│   │   ├── grokRuntime.ts     # 프록시 URL 헬퍼
│   │   ├── config.ts          # 런타임 설정 (env override)
│   │   ├── errors.ts / ids.ts
│   └── types/domain.ts        # 공유 타입
├── ui/src/                    # React 앱 (main.tsx, api.ts, styles.css)
├── tests/                     # node:test 계약/회귀 테스트
├── vendor/progrok-0.2.0.tgz   # vendored 프록시 (file: 의존성)
├── dist/ dist-ui/             # 빌드 산출물 (gitignore, `npm run build`로 재생성)
└── docs/WORKLOG.md            # 이 문서
```

## 4. 실행 방법

```bash
npm install            # vendor/progrok-0.2.0.tgz 포함 설치
npm run build          # vite(UI) + tsc(server) → dist-ui/, dist/
npm start              # http://127.0.0.1:3456 (progrok proxy 자동 기동)
# 개발 모드: npm run dev (tsx watch) + 별도로 vite dev(ui, 5174)
```

검증:
```bash
npm run typecheck      # tsc --noEmit
npm test               # node:test (11 tests)
```

### API 요약
- `GET  /api/health`
- `GET  /api/auth/status` · `POST /api/auth/login` · `GET /api/auth/login/:id`
- `POST /api/plans` → 세그먼트 계획 생성
- `POST /api/runs` (SSE) → 체인 실행 / `POST /api/runs/:id/resume` (SSE) / `POST /api/runs/:id/cancel`
- `GET  /api/runs` · `GET /api/runs/:id` · `GET /api/runs/:id/download`

## 5. 현재 상태 (2026-06-06)

✅ 완료
- 백엔드 전체 (server/routes/lib/types) — 구현 완료, typecheck 통과
- 프론트엔드 (React UI) — 로그인·계획·실행·진행률·재개/취소·다운로드 UI 완비
- 테스트 11개 전부 통과 (`npm test`)
- 빌드 성공 (`npm run build`)
- **progrok 의존성 경로 수정**: `file:../ima2-gen/vendor/...`(존재하지 않는 경로) → `vendor/`로 vendoring 후 `file:vendor/progrok-0.2.0.tgz`. 이제 fresh clone에서도 install 성공.
- `.gitignore` 추가 (node_modules, dist, dist-ui, .env, 로그)
- L4 `AGENTS.md` 작성
- 로컬 서버 기동 확인: UI serving + `/api/health` + device-code 발급(`POST /api/auth/login` → userCode/verificationUrl 정상)

✅ 로그인 & proxy (2026-06-06 검증 완료)
- `buildops@wemadeplay.com` 계정으로 로그인 완료 → `~/.progrok/auth.json` 저장 → progrok proxy 정상 기동(`Listening http://127.0.0.1:18645/v1 → api.x.ai`).
- `/v1/models` 정상 응답, 설정 모델 `grok-4.3`(planner)·`grok-imagine-video`(video) 모두 존재 확인.
- planner e2e 통과: `POST /api/plans`로 2세그먼트 영어 plan 생성 확인.
- **영상 생성 e2e 통과**: 20s 체인(text→video + extension + concat) → 최종 19.999s mp4 생성·다운로드 확인(§8).

### 로그인: device-code → PKCE 전환 (해결 완료)
- **발견**: 앱 초기 로그인은 xAI **device-code** flow(`auth.x.ai/oauth2/device/code` → `accounts.x.ai/oauth2/device` 승인)를 썼는데, 검증 중 **여러 신선한 코드(TTL 900s)가 consent 단계에서 일관되게 "Invalid or expired code"로 거부**됨(생성 5초 내 코드 포함, 계정 정상 로그인). 재현율 100%.
- **해결**: `src/lib/auth.ts`의 로그인을 progrok **PKCE 브라우저 flow**로 교체. `POST /api/auth/login`이 `progrok login --browser`를 자식 프로세스로 spawn → 브라우저 자동 열림 + loopback(`127.0.0.1:56121`) 콜백 자동 수신·토큰 교환 → `~/.progrok/auth.json` 저장. 서버는 자식 종료 코드(0=성공)로 세션 상태 추적. progrok은 proxy에서도 이미 쓰므로 새 의존성 없음.
- UI(`ui/src/main.tsx`)는 device code 표시 대신 "브라우저에서 로그인 완료" 안내 + authorize 링크(자동 열기 실패 시 fallback)를 노출. 로그인 완료 시 자동 연결.
- **검증(2026-06-06)**: 앱 로그인 버튼 클릭 → progrok 기동 → authorize URL(ANSI 제거됨) 반환 → consent `Allow` → 56121 콜백 → `auth.json` 갱신·`expiresAt` refresh 확인. (Playwright 샌드박스는 browser→host loopback hop만 못 하므로 host에서 콜백을 직접 호출해 마지막 단계 검증; 실제 시스템 브라우저는 네이티브로 수행.)
- 토큰은 `~/.progrok/auth.json`에 저장되며 **절대 커밋/출력 금지**.

## 6. 남은 일 / 향후 개선 후보

- [x] **로그인 UX**: device-code consent 거부 문제로 progrok PKCE(`--browser`, loopback `127.0.0.1:56121`)로 전환 완료(§5). `src/lib/auth.ts` + `ui/src/main.tsx` 수정, 버튼 e2e 검증.
- [x] 로그인 완료 후 실제 end-to-end 영상 생성 스모크 테스트 (proxy 기동 → plan → run → mp4). 진행/결과는 §8 참조.
- [ ] 진행 중 run 목록을 UI에 노출 (`GET /api/runs`는 있으나 화면 미연결).
- [ ] 토큰 만료(`expiresAt`) 시 자동 refresh 또는 재로그인 유도 UX.
- [ ] proxy 미기동(로그인 전) 상태에서 계획/실행 시도 시 사용자 친화적 에러 안내.
- [ ] `.env.example` 추가 (현재 모든 설정은 env override 가능, 기본값은 `src/lib/config.ts`).

## 7. 주의/함정

- progrok 프록시는 **로그인 전까지 1초 간격으로 재시작 루프**를 돈다(로그에 "Not logged in" 반복). 정상 동작이며 로그인 완료 후 멈춘다.
- `ffmpeg`/`ffprobe`가 PATH에 없으면 미디어 단계에서 실패(`MEDIA_TOOLS_MISSING`). macOS는 `brew install ffmpeg`.
- run 데이터는 `~/.grok-clip-chain/runs/<runId>/`에 저장(매니페스트+세그먼트). 저장소에 커밋되지 않음.
- vendored `progrok-0.2.0.tgz`는 ima2-gen 원본과 동일 바이너리. 업데이트 시 양쪽 동기화 필요.
- **dead code 주의**: PKCE 전환 후 `auth.ts`의 `saveGrokTokens`·`requestAuthJson`·`curlJson`·`decodeEmail`은 로그인 경로에서 더 이상 호출되지 않는다(토큰 저장·교환은 progrok이 수행). 기존 테스트(`auth.test.ts`)와 향후 fallback용으로만 남겨둠 — 실수로 다시 로그인 경로에 연결하지 말 것. `readGrokAuthStatus`는 `/api/auth/status`에서 계속 사용.
- 로그인 URL 파싱은 순수 함수 `extractAuthorizeUrl`로 분리해 단위 테스트(ANSI strip 회귀 가드). spawn/OAuth 왕복은 수동 검증(§5)으로 커버.

## 8. e2e 스모크 테스트 (2026-06-06)

조건: `buildops` 로그인 완료, proxy 기동. 프롬프트 "calico cat windowsill", 480p/16:9, target 20s → 2 세그먼트.

- planner(`POST /api/plans`): 2세그먼트 영어 plan 생성 ✅
- run(`POST /api/runs`, SSE): planning → seg1(text→video, 10.04s) → seg2(extension) → merge-done. **전 과정 ~90초** (22:03:58 → 22:05:24).
- 최종 mp4(`GET /api/runs/<id>/download`): **HTTP 200, 3.56MB, h264+aac, 848×480(480p), 19.999s** ✅
- manifest `status: completed`, 두 세그먼트 모두 `completed`. **체인 생성→연장→병합→다운로드 전체 동작 확인.**

재현:
```bash
curl -s -X POST localhost:3456/api/plans -H 'Content-Type: application/json' \
  -d '{"prompt":"...","targetLength":20,"resolution":"480p","aspectRatio":"16:9"}' \
  | python3 -c "import sys,json;print(json.dumps({'plan':json.load(sys.stdin)['plan']}))" > plan.json
curl -sN -X POST localhost:3456/api/runs -H 'Content-Type: application/json' --data @plan.json
# merge-done 후: GET /api/runs/<id>/download → final.mp4
```

## 9. 테스트

- `npm test` — node:test **11개** (auth 4: token 저장·curl fallback·extractAuthorizeUrl×2 / media / routes 2: 성공 체인·재시도 일시정지 / ui-contract / videoAdapter).
- 실제 xAI API e2e(planner·영상 생성)는 비용·로그인이 필요해 스위트에 포함하지 않고 §8 수동 검증으로 대체.
