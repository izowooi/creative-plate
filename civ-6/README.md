# THE TURN

문명 VI에서 만나는 지도자, 문명, 도시와 위대한 인물을 실제 세계사의 이야기로 연결하는 비공식 한국어 에디토리얼 웹앱입니다.

## 기술 구성

- Next.js 16 App Router + React 19 + TypeScript
- Tailwind CSS 4와 project-local design tokens
- Markdown 원본(`docs/`) + Node 내장 SQLite 검색/조회 인덱스(`data/the-turn.db`)
- Zod 기반 frontmatter 검증

SQLite 파일은 커밋하지 않습니다. `npm run dev`와 `npm run build`가 실행되기 전에 Markdown으로부터 `data/the-turn.db`를 결정적으로 다시 생성합니다. 이 경계 덕분에 향후 Supabase repository로 교체해도 원본 자료는 그대로 유지할 수 있습니다.

## 실행

```bash
cd /Users/izowooi/git/creative-plate/civ-6
npm install
npm run dev
```

- 이 Mac: `http://localhost:3000`
- 같은 네트워크의 다른 기기: `http://<이 Mac의 LAN IP>:3000`

개발 서버는 `0.0.0.0`에 바인딩됩니다. macOS 방화벽에서 Node 수신 연결이 차단된 경우 로컬 네트워크 접근을 허용해야 합니다.

공개 배포에서는 `.env.example`을 참고해 `SITE_URL`을 실제 HTTPS origin으로 설정하세요. 설정하지 않은 로컬 실행은 `http://localhost:3000`을 사용합니다.

## 콘텐츠 작업

```bash
npm run content:check  # Markdown schema, 중복, 관계, 출처/이미지 권리 필드 검증
npm run images:sync    # Commons 원본을 검증해 public/images/archive/*.webp로 최적화
npm run images:check   # Markdown·manifest·WebP 파일/크기/형식/SHA-256 교차 검증
npm run db:seed        # docs/ → data/the-turn.db
```

개발 서버가 켜진 상태에서 `db:seed`를 직접 실행하면 기존 SQLite 읽기 연결은 이전 파일을 계속 볼 수 있습니다. 콘텐츠를 다시 반영할 때는 개발 서버를 재시작하세요.

폴더별 자료 구조와 frontmatter 규격은 [`docs/README.md`](./docs/README.md)를 참고하세요.

## 전체 검증

```bash
npm run check
```

콘텐츠와 이미지, ESLint, TypeScript, SQLite 검색 테스트, production build를 순서대로 검증합니다.

## 주요 경로

- `/` — 에디토리얼 홈
- `/explore` — 검색, 유형·시대 필터, 정렬
- `/archive/[slug]` — 개별 역사 프로필과 출처
- `/about` — 편집 원칙, 저작권·데이터 운영 방식
- `/api/search?q=` — 로컬 DB 기반 간단한 검색 API

## 배포 메모

현재 구조는 로컬 Node + SQLite용입니다. Cloudflare Workers로 옮길 때는 `src/lib/db.ts`의 repository 구현을 Supabase(Postgres) 또는 Cloudflare D1 adapter로 교체하고 seed pipeline을 해당 환경에 맞게 변경합니다. UI와 Markdown schema는 이 과정에서 변경할 필요가 없습니다.

## 고지

THE TURN은 2K 또는 Firaxis Games와 제휴하지 않은 비공식 팬 프로젝트입니다. Civilization 및 관련 표장은 각 권리자의 자산입니다. 역사 이미지의 권리와 원본 링크는 각 글에 표기합니다.
