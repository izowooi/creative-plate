# Supabase 동기화와 Cloudflare Worker

## 현재 준비 상태 (2026-09-10)

연결된 Supabase 프로젝트는 `fresh-mint`, `wmp-clever-lemon` 두 개다.
사용자 선택 전이라 원격 migration·데이터 적재·credential 설정·실제 Worker 배포는 아직 하지 않았다.
`gn_` SQL migration, 클라이언트의 런타임 조회, Worker 읽기 API, GitHub 자동 동기화 코드를 준비했다.
GitHub workflow는 repository variable `GN_SYNC_ENABLED=true`가 설정된 뒤에만 실행된다.
따라서 준비 코드를 push해도 아직 DB에 쓰지 않는다.

## 저장 구조

| 테이블 | 역할 | 공개 독자 |
|---|---|---|
| gn_books | 여러 작품의 제목·소개·태그와 공개 여부 | 공개 작품 조회 |
| gn_episodes | 작품별 현재 회차 원고, 초안/확정 상태 | 공개 작품의 공개 회차 조회 |
| gn_episode_revisions | 변경된 원고 snapshot과 source commit | 접근 불가 |
| gn_sync_state | 적용한 GitHub 실행 번호와 commit | 접근 불가 |
| gn_sync_credentials | 소설 전용 동기화 토큰의 SHA-256 | 접근 불가 |

테이블을 새로 생성하는 migration은 `supabase/migrations/20260910_gn_library.sql`이다.
Supabase MCP로 기존 스키마를 확인한 뒤 apply_migration을 사용한다.
기존 다른 프로젝트 테이블은 수정하지 않는다. 별도 Supabase 프로젝트나 유료 리소스를 생성할 필요 없다.

## 동작 흐름

작가는 기존 Markdown 파이프라인으로 집필한다. `main`에 원고/작품 목록을 commit·push하면
`.github/workflows/gen-novel-sync.yml`이 공개 대상 catalog를 수집해 `gn_import_catalog` RPC에 보낸다.
작성 중 파일을 저장하는 매 순간 전송하는 watcher가 아니다. 기본 자동 커밋·푸시 시점이 동기화 시작점이다.
실패하면 GitHub Actions에 실패로 남으며 workflow_dispatch 또는 재실행으로 복구한다.
동기화가 실패해도 로컬 원고는 보존된다.

RPC는 토큰을 검증하고 하나의 DB transaction에서 적용한다. 같은 실행의 재시도는 중복 적용하지 않는다.
오래된 실행은 최신 내용을 덮어쓰지 않는다. 여러 소설은 `web/content/library.json`에 서로 다른 id/source로 등록한다.
새 작품을 추가할 때 AI는 이 목록 등록도 함께 수행해야 한다.
같은 회차의 최종본은 초안보다 우선한다. 목록에서 제외된 작품·회차는 삭제 대신 숨긴다.
수정 이력은 append-only로 남기며 원본 파일 전체나 lore를 자동으로 DB에 넣는 것은 아니다.

모바일/맥북 브라우저는 같은 URL에서 Worker의 `/api/catalog.json`과
`/api/books/<book-id>/episodes/<episode-id>`를 조회한다. 앱의 새 회차 주소는
`/read/?book=<book-id>&episode=<episode-id>`이므로 빌드 당시 없던 소설·회차도 재배포 없이 열린다.
오래된 snapshot으로 조용히 대체하지 않고, DB 오류 시 재시도 화면을 표시한다.
읽던 위치·글자 설정은 여전히 기기별 localStorage다. 로그인·기기간 읽기 위치 동기화는 추가하지 않았다.

## 프로젝트 선택 후 이어서 할 작업

1. 선택한 프로젝트의 gn_ 중복 여부를 다시 조회하고 Supabase MCP로 migration 적용.
2. `web/scripts/provision-sync-secret.mjs`로 gn 전용 토큰을 메모리에서 생성하고 GitHub secret에 저장.
   이 스크립트는 **최초 설치/명시적 토큰 회전 때만** 실행한다. 기존 토큰을 매번 바꾸지 않는다.
   출력은 해시뿐이다. 이를 `gn_sync_credentials`에 넣는다. 원문 토큰을 로그·Git에 쓰지 않는다.
3. MCP로 프로젝트 URL/publishable key를 가져와 `GN_SUPABASE_URL`, `GN_SUPABASE_ANON_KEY`를
   GitHub Actions secrets와 Wrangler secrets에 설정한다. Worker에는 쓰기 토큰을 넣지 않는다.
   GitHub에는 `GN_SYNC_TOKEN`이 추가로 필요하다. 프로젝트 전체 권한의 service_role 키는 사용하지 않는다.
4. repository variable `GN_SYNC_ENABLED=true`로 활성화하고 workflow_dispatch를 실행한다.
5. gn_books/gn_episodes 적재 내용과 읽기 권한을 확인한다. 잘못된 쓰기 토큰과 직접 INSERT가 거부되는지도 확인한다.
6. `web/`에서 `npm run deploy`로 기존 로그인된 Cloudflare 계정에 `gen-novel-reader` Worker를 배포한다.
   동일 이름의 Worker가 생겨 있다면 덮어쓰기 전에 대상이 이 앱인지 다시 확인한다.
7. 배포 URL에서 서재·실제 1화 API·회차 화면·오류 경로를 확인하고 사용자에게 URL 제공.

GitHub secret 설정 권한은 현재 gh 로그인에서 확인했다. Wrangler 로그인도 확인했다.
Supabase MCP는 연결돼 있으나 Wrangler MCP는 현재 도구 목록에 없어서 로그인된 CLI를 사용한다.
사용자가 Cloudflare 배포를 지정했으므로 별도 Sites 계정·저장소·사이트 등록을 만들지 않는다.

## 개발과 검증

`npm run dev`는 로컬 원고에서 생성하는 API로 기존 오프라인 개발 흐름을 유지한다.
`npm run build` 이후 `npm run worker:dev`는 Worker API를 검증할 때 쓴다.
이 경우 Wrangler secret에 해당하는 로컬 `.dev.vars`가 필요하다. 기존 환경 파일은 읽거나 덮어쓰지 않는다.
설정이 없으면 Worker API가 503으로 응답한다. 로컬 `.dev.vars*`·`.wrangler`는 Git에서 제외된다.

`npm test`: 실제 원고 선택 + PGlite의 PostgreSQL migration/RLS/RPC transaction 테스트 + Worker fetch mock.
`npm run build`, `npm run typecheck`, `npx wrangler deploy --dry-run`: 앱 및 Worker 배포 산출물 확인.
로컬 테스트 통과는 아직 실제 Supabase 적재나 원격 배포의 증거가 아니다.

참고: [Supabase functions](https://supabase.com/docs/guides/database/functions),
[Cloudflare Static Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/).
