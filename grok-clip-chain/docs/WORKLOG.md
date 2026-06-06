# Grok Clip Chain — 작업 내역 & 계획

> 다른 AI 툴/세션이 이어서 작업할 수 있도록 현재 상태·아키텍처·남은 일을 한곳에 정리한 문서.
> 최종 갱신: 2026-06-06

## 1. 이 앱이 하는 일

웹앱에 접속 → **1회 Grok(xAI) 로그인** → Grok의 생성형 video AI로 긴 영상을 만든다.

- 한 번의 프롬프트로 **10초 단위 세그먼트 체인**을 계획(planner)하고, 각 세그먼트를 순차 생성해 1개의 mp4로 병합한다.
- 세그먼트 1: text-to-video (시작 이미지가 있으면 image-to-video).
- 세그먼트 2~N: 직전 결과물의 마지막 10초(seed window)를 입력으로 **video extension** 생성.
- 결과를 `ffmpeg`로 이어붙여 최종 mp4 다운로드 제공.
- 인증: xAI **OAuth device-code** 플로우. 토큰은 `~/.progrok/auth.json`에 저장. 영상 생성 호출은 로컬 `progrok` 프록시(`127.0.0.1:18645`)를 경유한다.

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
│   │   ├── auth.ts            # xAI device-code 로그인 + 토큰 저장/조회
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
npm test               # node:test (9 tests)
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
- 테스트 9개 전부 통과 (`npm test`)
- 빌드 성공 (`npm run build`)
- **progrok 의존성 경로 수정**: `file:../ima2-gen/vendor/...`(존재하지 않는 경로) → `vendor/`로 vendoring 후 `file:vendor/progrok-0.2.0.tgz`. 이제 fresh clone에서도 install 성공.
- `.gitignore` 추가 (node_modules, dist, dist-ui, .env, 로그)
- L4 `AGENTS.md` 작성
- 로컬 서버 기동 확인: UI serving + `/api/health` + device-code 발급(`POST /api/auth/login` → userCode/verificationUrl 정상)

⏳ 사용자 액션 대기
- **Grok 로그인 1회**: 앱(`http://127.0.0.1:3456`)에서 `로그인` 클릭 → xAI device URL에서 인증 완료. 완료 시 `~/.progrok/auth.json` 저장 → progrok proxy 정상 기동 → 영상 생성 가능.

## 6. 남은 일 / 향후 개선 후보

- [ ] 로그인 완료 후 실제 end-to-end 영상 1편 생성 스모크 테스트 (proxy 기동 → plan → run → mp4).
- [ ] 진행 중 run 목록을 UI에 노출 (`GET /api/runs`는 있으나 화면 미연결).
- [ ] 토큰 만료(`expiresAt`) 시 자동 refresh 또는 재로그인 유도 UX.
- [ ] proxy 미기동(로그인 전) 상태에서 계획/실행 시도 시 사용자 친화적 에러 안내.
- [ ] `.env.example` 추가 (현재 모든 설정은 env override 가능, 기본값은 `src/lib/config.ts`).

## 7. 주의/함정

- progrok 프록시는 **로그인 전까지 1초 간격으로 재시작 루프**를 돈다(로그에 "Not logged in" 반복). 정상 동작이며 로그인 완료 후 멈춘다.
- `ffmpeg`/`ffprobe`가 PATH에 없으면 미디어 단계에서 실패(`MEDIA_TOOLS_MISSING`). macOS는 `brew install ffmpeg`.
- run 데이터는 `~/.grok-clip-chain/runs/<runId>/`에 저장(매니페스트+세그먼트). 저장소에 커밋되지 않음.
- vendored `progrok-0.2.0.tgz`는 ima2-gen 원본과 동일 바이너리. 업데이트 시 양쪽 동기화 필요.
