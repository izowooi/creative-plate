# 책갈피 — 모바일 웹소설 뷰어

Next.js App Router + TypeScript + Tailwind CSS. 네이버 시리즈의 서재→작품→회차→뷰어 흐름을 참고한 개인 소설 뷰어다.
독자적인 이름과 타이포그래피 표지를 사용하며 원본 서비스의 로고·이미지는 사용하지 않는다.
현재 작품은 「불씨를 건네는 아이」이며 실제 Markdown 1화 초안을 읽는다.

## Supabase/Cloudflare 운영

2026-09-10: `fresh-mint`에 gn_ 테이블과 기존 1화를 적재하고 GitHub push 동기화를 활성화했다.
**접속: https://gen-novel-reader.izowooi.workers.dev**
설정·검증·복구 절차는 [Supabase 동기화 안내](../docs/supabase-sync.md)를 따른다.
이하 정적 원고 안내는 로컬 개발/preview에 해당한다. 배포한 Worker는 `/api/*`를 Supabase로 연결한다.
`/book/?id=...`, `/read/?book=...&episode=...` 주소로 새 작품을 재배포 없이 읽도록 구성했다.

## 로컬 실행

Node.js 22 이상과 npm을 사용한다. cwd: `gen-novel/web`.

```bash
npm ci
npm run dev
```

컴퓨터: http://localhost:3100
휴대폰: 같은 Wi-Fi에서 `http://컴퓨터의-LAN-IP:3100`에 접속한다.
휴대폰에서 localhost는 휴대폰 자신이므로 컴퓨터 주소를 사용한다. 컴퓨터가 켜져 있어야 하며 OS 방화벽에서 연결을 허용해야 한다.
공개 배포는 위 Worker 주소를 사용한다. 이 로컬 실행 방법은 개발용이다.

## 기능

- 모바일 대응 서재, 작품 소개, 회차 목록과 최신순 정렬, 확정본 필터.
- 16~28px 글자 크기, 3단계 줄 간격, 고딕/명조, 밝게/종이/어둡게.
- 읽기 도구 숨김, 회차 목록 팝업, 이전·다음 회차, 마지막 회차 안내.
- 문단 기준 읽던 위치와 설정을 브라우저 localStorage에 저장한다. 다른 기기와 동기화하지 않는다.
- 본문 Markdown만 렌더링한다. HTML·MDX 실행, 이미지 로드, 외부 본문 링크 이동은 허용하지 않는다.
- 원고가 바뀌면 문단 수/구조도 달라지므로 복원 위치가 완벽히 같지는 않을 수 있다.

## 원고와 Git

DB나 API key는 필요 없다. Git은 원고의 버전 저장소이고 웹앱은 빌드 때 파일을 읽는다.
브라우저에서 GitHub API에 접근하거나 공개 저장소 전체를 다운로드하지 않는다.

`content/library.json`이 노출할 작품을 지정한다. `source`는 **gen-novel 기준 상대 경로**다.
현재는 `local`이며 원고만 읽고 lore·인터뷰·대화 기록은 웹앱 결과물에 포함하지 않는다.
단, 공개 Git 저장소 자체에 포함된 파일의 공개 범위는 바뀌지 않는다.

1. `local/final/<회차>/release.json` + `manuscript.md`가 있으면 확정본을 사용한다. 원고 SHA-256을 검사한다.
2. `includeDrafts: true`이면 `local/runs/<run>/manifest.json` + `draft.md`도 읽는다.
3. 같은 회차는 확정본 우선, 확정본이 없으면 작성일이 가장 최근인 비어 있지 않은 초안을 사용한다.
4. `[작성 필요]`가 남은 초안은 제외한다. review PASS나 웹앱 열람이 회차 확정을 뜻하지 않는다.
5. 새 회차는 기존 소설 파이프라인으로 추가한 뒤 새로 빌드한다. 공개할 초안을 원하지 않으면 `includeDrafts: false`로 설정한다.

작품 추가는 같은 JSON 배열에 고유한 id와 별도 source를 등록한다. source마다 동일한 runs/final 구조를 둔다.
카탈로그는 `lib/catalog.ts`, UI 전달 타입은 `lib/types.ts`에 분리했다.
Supabase 배포에서는 `worker/index.ts`가 DB를 읽고 이 로더는 로컬 preview와 CI 동기화에 사용한다.
쓰기·로그인·기기간 동기화는 현재 구현 범위에 없다.

## 빌드와 사용자 직접 배포

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

`npm run build`는 `out/`에 정적 HTML/CSS/JS를 생성한다. 서버나 DB가 없는 정적 호스팅에 올릴 수 있다.
`preview`는 Python 3으로 out/을 3100 포트에 제공한다. dev 서버와 동시에 같은 포트에 띄우지 않는다.
현재 서비스는 Cloudflare Worker로 배포했다. 정적 preview만 별도로 호스팅한다면 저장소 checkout에 `gen-novel/local`도 있어야 한다.
빌드 작업 폴더는 `gen-novel/web`, 명령은 `npm ci && npm run build`, 결과 디렉터리는 그 폴더 기준 `out`이다.
Cloudflare 런타임에서 Node fs를 읽는 구조가 아니라 빌드 시에만 읽는 구조다.
정적 preview의 원고 변경은 재빌드가 필요하지만 운영 Worker는 Git push→DB 동기화 후 즉시 새 원고를 조회한다.
UI/Worker 코드가 바뀔 때만 `npm run deploy`로 재배포한다. GitHub Pages 하위 경로 배포는 별도 basePath 설정이 필요하다.

오프라인 캐시/service worker는 넣지 않았다. 설치 앱과 동일한 오프라인 동작을 보장하지 않는다.
스타일은 시스템 글꼴을 사용하므로 외부 폰트 서버에 의존하지 않는다.

## 검증 범위

자동 테스트는 실제 원고 로딩, 초안 버전 선택, 확정본 우선 및 해시, 빈 자료, 파일 경계,
설정 복원·범위 제한과 기록 검증을 다룬다. build/typecheck와 HTTP 응답으로 모든 페이지를 확인한다.
브라우저 클릭·모바일 실기기 시각 검증은 별도로 수행하지 않았다.

참고: [Next.js static exports](https://nextjs.org/docs/app/guides/static-exports),
[Tailwind CSS Next.js 설치](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
