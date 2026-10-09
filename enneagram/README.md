# 마음지도 · Enneagram Atlas

배포: **https://eg.zowoo.uk**

한국어 에니어그램 자기 성찰 웹앱. 자체 54문항의 점수를 브라우저에서 계산하고, 9유형·인접 날개·동점/균형 결과를 아홉 꼭짓점 도형으로 보여 준다. 상용 검사의 문항을 복제하지 않았으며, 표준화된 심리검사나 진단 도구가 아니다.

## 제공 기능

- 기기 내 자동 저장, 로그인 없는 보관 ID 연결, 서버 답변 불러오기·삭제.
- 다른 기기에서 저장 버전이 변경되면 충돌을 알려 임의 덮어쓰기를 방지.
- 응답·ID가 제외된 결과 공유 링크와 1200×1500 PNG 카드.
- 9유형과 18개 날개 조합의 27개 해설을 Supabase에 미리 저장. 개인 점수 도형은 별도 유지.
- 실제 NovelAI 생성 캐릭터 9장, 유형 소개, 자신과 관계를 위한 실천 조언.
- 모바일 레이아웃, 키보드 응답, 자료와 해석 한계 안내.

## 실행과 배포

Node 22.19 이상. 이 폴더에서 실행한다. 브라우저 UI에는 별도의 프레임워크 런타임을 추가하지 않고, Vite와 Cloudflare Vite plugin으로 Worker 및 정적 파일을 빌드한다.

```sh
npm ci
npm test
npm run dev
# http://127.0.0.1:5179
npm run build
npm run deploy
```

`cloudflare.config.ts`는 사용자 계정의 `enneagram-atlas` Worker와 `eg.zowoo.uk` Custom Domain을 설정한다. 설치된 `cf@1.0.0-beta.13`은 작업 당시 최신 버전이었다. `package-lock.json`으로 beta 도구 버전을 고정한다. `sharp` 보안 패치를 override하여 `npm audit`의 알려진 취약점이 0건인 구성을 유지했다.

서버 기능에는 `SUPABASE_ANON_KEY` Worker secret이 필요하다. 이미 배포한 Worker에 주입되어 있다. 새 Worker를 준비하거나 키를 교체할 때는 빌드 후 다음을 실행한다. 값은 숨겨진 stdin으로 입력하고 파일·명령 인수에 보관하지 않는다.

```sh
python3 scripts/cloudflare-run.py deploy
```

로컬에서 실제 Supabase API도 함께 사용할 때는 `python3 scripts/cloudflare-run.py dev`로 키를 숨겨서 입력한다. 기본 `npm run dev`만 실행하면 로컬 응답 계산·저장·PNG는 사용할 수 있고 서버 보관 API는 secret이 없으면 503으로 응답한다.

Supabase 프로젝트는 `elufbvcnhitoksoofbir`이다. `supabase/migrations`의 마이그레이션 4개가 적용되어 있다. 기존 테이블을 수정하지 않고 `enneagram_` 접두사의 테이블/RPC를 추가했다. SQL 세부 계약과 권한은 [backend.md](docs/backend.md)에 있다.

실서비스 API 검증은 `node scripts/smoke-test.mjs`로 실행한다. 저장·복원·충돌·삭제와 27개 프로필, 균형 공유를 검사하며 자체 생성한 보관 세션은 정리한다. 공개 공유 결과 하나는 검증용으로 생성되므로 운영자가 필요하면 해당 출력 UUID를 DB에서 정리할 수 있다.

## 콘텐츠와 이미지 교체

- `src/content.js`: 문항, 유형 설명, 27개 프로필, 출처.
- `src/scoring.js`: 동일 가중치, 역문항, 동점과 균형, 원형 인접 날개.
- `src/storage.js`: 브라우저 저장과 API transport.
- `src/diagram.js`: SVG 도형 및 PNG 카드.
- `src/app.js`, `src/style.css`: 화면과 상호작용.
- `worker/index.js`: Supabase RPC와 입력·요청 제한.

나중에 다른 검사를 추가할 때는 검사별 문항·계산·저장 버전을 독립적으로 정의하고, 기존 `q1`–`q54` 의미를 바꾸지 않는다. 이미 저장된 응답에는 버전 이관이 필요하다.

캐릭터를 직접 그리면 `public/characters/type-1.webp`부터 `type-9.webp`까지 교체한다. 768×768 정사각형을 권장하며, 앱은 가운데를 기준으로 크롭한다. 직접 교체하면 `public/characters/manifest.json`의 출처·해시 정보도 갱신한다.

[character-prompts.md](docs/character-prompts.md)에 공통/유형별 프롬프트와 모델·seed·negative prompt가 있다. [생성 기록](docs/character-generation.md)과 재생성 도구 `scripts/generate-characters.py`를 함께 제공한다. NovelAI 토큰은 브라우저나 저장소에 포함하지 않는다.

## 저장의 의미

보관 ID는 로그인 대신 쓰는 공유 열쇠다. 아는 사람은 답변을 조회·수정·삭제할 수 있으므로 긴 무작위 ID를 사용하고 별도로 보관한다. 서버에는 평문 ID 대신 SHA-256을 저장한다. 기기 응답은 즉시 저장되고 서버에는 약 1.8초 뒤 묶어서 저장된다. 다른 기기로 옮기기 전에 검사 화면의 **지금 서버에 저장**과 완료 상태를 확인한다. 서버 연결이 실패하면 기기 응답이 유지된다.

자료 검토와 계산의 한계는 [research.md](docs/research.md), 실제 기능과 배포 검증은 [verification.md](docs/verification.md)에 기록한다. 사용자 제공 HTML과 광고·추적 스크립트는 참고 자료로만 사용하고 Git이나 배포 자산에 포함하지 않는다.
