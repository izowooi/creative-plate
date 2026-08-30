# Project AGENTS.md

이 문서는 `gen-omni` 하위 프로젝트에만 적용되는 L4 작업 지침이다.
상위 문서의 Git, secret, 작업 범위 규칙은 반복하지 않고 그대로 따른다.

## 프로젝트 목적

SceneShift는 Gemini Omni 1.1 Flash의 영상 편집 능력을 보여주는 Next.js showcase다.
사용자가 1분 미만 영상을 올리고 최대 10초 구간을 선택해, 업로드한 사람 또는 캐릭터 이미지로 장면의 주인공을 교체한다.

## 기술 스택

- TypeScript, Node.js, npm
- Next.js 16 App Router, React 19
- Tailwind CSS 4
- Google Gen AI JavaScript SDK, `gemini-omni-1.1-flash`, `gemini-3.5-flash`
- Vitest, jsdom, Testing Library, ESLint
- Sharp, Zod, music-metadata

## 주요 파일

- `app/page.tsx`: Studio와 Omni showcase UI, client-side 구간 추출·이미지 압축 흐름
- `app/api/generate/route.ts`: upload 검증, server media 처리, Omni 생성 API route
- `app/api/status/route.ts`: API key 구성 여부를 값 노출 없이 반환하는 route
- `lib/omni.ts`: Google File API, multimodal moderation, Omni interaction, 임시 파일 정리
- `lib/validation.ts`: 길이·용량·화질 제약과 API resolution 매핑
- `lib/api-keys.ts`: 지원 key 탐색과 최대 두 key fallback
- `lib/safety.ts`: moderation schema·prompt와 안전한 edit prompt
- `lib/client-media.ts`: browser video trim, image compression, 결과 download
- `lib/server-media.ts`: server-side image compression과 video duration 판독
- `lib/*.test.ts`: validation, safety, API key fallback, media parser 단위 테스트

## 실행

dependency를 설치하고 개발 서버를 실행한다.

```bash
npm install
npm run dev
```

build 완료 후 production server를 로컬에서 실행할 때는 다음 명령을 사용한다.

```bash
npm run start
```

## 테스트

경계값, API key fallback, safety prompt를 변경할 때 실패 테스트를 먼저 추가하거나 갱신한다.
구현 완료 전 아래 검증을 모두 통과시킨다.

```bash
npm test
npm run lint
npm run build
```

개발 중 watch mode가 필요할 때만 다음 명령을 사용한다.

```bash
npm run test:watch
```

## 빌드

```bash
npm run build
```

`package.json`의 dependency가 `latest`를 사용하므로 재현 가능한 설치 기준은 `package-lock.json`이다.
dependency 변경 시 lockfile을 함께 검토한다.

## 배포

현재 CI/CD, container, Cloudflare Workers adapter 설정은 정의되어 있지 않다.
배포는 현재 작업 범위 밖이며 요청 없이 adapter나 runtime 설정을 추가하지 않는다.
향후 배포 시 Node.js API route, `maxDuration`, Sharp와 Cloudflare runtime 호환성을 먼저 확인한다.

## 작업 규칙

- upload는 60초 미만, 100MB 이하 video와 50MB 이하 image만 허용한다.
- 실제 edit input은 최대 10초로 유지하고 60초 upload 상한과 혼동하지 않는다.
- UI에는 `360p`, `480p`, `720p`만 노출하며 기본값은 `480p`다.
- `480p`는 비용 preset이며 API에는 `720p`로 매핑한다. `1080p`와 `4K`를 허용하지 않는다.
- 생성 전에 video와 image를 함께 검사하는 preflight moderation과 reference subject 검증을 유지한다.
- moderation을 우회해 Omni interaction을 직접 호출하는 경로를 만들지 않는다.
- Google File API에 올린 임시 media는 성공·실패와 관계없이 정리를 시도한다.
- browser 구간 추출은 최신 Chrome 기준이며 실패를 숨기지 않고 사용자에게 안내한다.
- Next.js 코드를 수정하기 전에 아래 자동 생성 규칙에 따라 설치된 버전의 관련 문서를 확인한다.

## Mock / Dry-run 규칙

- unit test에서는 Google File API, Gemini model, Omni interaction을 실제 호출하지 않고 mock한다.
- 기본 검증에서 비용이 발생하는 video 생성 smoke test를 실행하지 않는다.
- 실제 API 검증이 필요하면 구성된 첫 key를 먼저 사용하고, 인증 또는 quota 실패에만 두 번째 key를 한 번 시도한다.
- API 접근성 확인과 실제 생성 호출 여부를 작업 결과에 구분해 기록한다.

## 환경 변수

지원하는 key 이름만 문서화하며 값은 다루지 않는다.

- `GEMINI_API_KEY`, `GEMINI_API_KEY2`, `GEMINI_API_KEY_2`
- `GOOGLE_AI_API_KEY`, `GOOGLE_AI_API_KEY2`, `GOOGLE_AI_API_KEY_2`
- `GOOGLE_API_KEY`, `GOOGLE_API_KEY2`, `GOOGLE_API_KEY_2`

위 목록 순서가 우선순위이며 fallback helper는 구성된 key 중 최대 두 개만 사용한다.

## 자주 깨지는 부분

- client trim 결과는 server에 10초 이하의 완성된 input으로 전달되어야 한다.
- server route는 선택 구간이 남아 있는 원본 video를 대신 잘라 주지 않는다.
- `MediaRecorder`와 `captureStream` 호환 실패는 최신 Chrome 사용 안내로 처리한다.
- `480p` 선택값과 실제 생성 resolution이 다르므로 UI와 API 응답에서 이를 숨기지 않는다.
- moderation JSON schema, 차단 reason, 사용자 오류 응답을 함께 변경한다.
- `runtime = "nodejs"`, Sharp, media metadata 처리는 배포 runtime 변경 시 함께 검증한다.

## 수동 검증 방법

E2E test가 없으므로 UI 변경 후 비용 없는 경로를 수동 확인한다.

```text
1. 개발 서버에서 Studio와 Omni showcase tab을 확인한다.
2. 60초 경계 video와 잘못된 image 입력이 생성 전에 차단되는지 확인한다.
3. 360p, 480p, 720p만 선택되고 기본값이 480p인지 확인한다.
4. API key 미설정 상태가 값 노출 없이 표시되는지 확인한다.
5. 실제 생성은 명시적으로 실행한 경우에만 결과와 비용 발생 여부를 기록한다.
```

## 기타 관례

- optional prompt가 비어 있어도 character replacement 기본 prompt가 동작해야 한다.
- 영상의 동작, timing, camera, composition, background, audio 보존 의도를 유지한다.
- 생성 결과의 SynthID 안내와 `requestedQuality`·`generatedQuality` 구분을 유지한다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
