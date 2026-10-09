# 구현·배포 검증

검증일: 2026-10-09 KST. 서비스: https://eg.zowoo.uk .

최종 Cloudflare Worker 버전: `96c58e33-6112-41fe-9e73-6877eac06fe5`. `cf deploy --prebuilt --mode production` 성공, Custom Domain `eg.zowoo.uk` 연결 성공. 실제 HTTPS 홈페이지와 `/api/health`가 HTTP 200이며 저장 바인딩 `storage:true`다. 배포 HTML이 로컬 최종 빌드의 `index-BoKZbHVj.js`, `index-BwqlNLn0.css`를 참조한다. 캐릭터 9개 URL 모두 HTTP 200이다.

## 요청별 증거

| 요구 | 확인한 현재 상태 |
| --- | --- |
| 에니어그램 웹앱 | 실제 브라우저에서 9페이지의 54문항을 모두 응답하고 결과 화면까지 완료. 기존 상용 검사 문항의 복제 없음. |
| 클라이언트 계산 | 서버 계산 호출 없이 `src/scoring.js`로 5w4와 점수 [25,25,25,75,100,25,25,25,25]가 표시됨. 9유형·18인접 날개·역문항·동점·균형을 단위 검증. |
| 이어 풀기 | 6문항 응답 후 새로고침에서 6/54 복원. 보관 ID를 실제 생성·저장한 뒤 기기 답변을 0/54로 비우고 동일 ID로 54/54와 9페이지를 서버에서 복원. |
| 인증 없는 ID 저장 | 로그인 UI 없음. 길이·문자 검증, 무작위 ID 생성, ID 복사, 재연결·연결 해제·서버 삭제 제공. 보관 ID의 접근 권한과 복구 불가 안내. |
| 저장 충돌 | 실제 배포 API의 오래된 revision에 HTTP 409와 서버 답변 반환. 동일 응답의 충돌은 버전 재결합. 서버 삭제 시 빈 응답으로 재시작 가능. 닫힌 dialog의 늦은 응답은 기기 상태를 덮지 않음. |
| 도형 공유 | 브라우저에서 결과 링크를 실제 생성하고 새 탭에서 5w4 도형·해설 복원. 공유 화면에는 개인 답변 리뷰 버튼 없음. API 출력 필드는 scores/primary/wing/profileKey/createdAt뿐. |
| 이미지 공유 | 실제 다운로드된 `나의-마음지도.png`의 PNG 형식, 1200×1500 픽셀 및 전체 렌더 시각 검토. 번호·도형·유형·안내·서비스 주소가 카드에 표시됨. |
| 결과 조언 | 9유형의 자기 돌봄·관계 조언, 18개 날개 해설. 성장·스트레스 연결의 이론적 한계 안내. |
| 결과 경우의 수 사전 저장 | Supabase 프로젝트 `elufbvcnhitoksoofbir`에 27개의 프로필. 실제 `/api/profiles` 27개 고유 key 확인. 개인별 도형을 프로필과 혼동하지 않음. |
| NovelAI 캐릭터 | 실제 NovelAI API 인증·9회 생성 성공. 각768×768 WebP, 총1,270,484bytes. 이미지 시각 검토·metadata 제거·해시 기록. 9장의 배포 URL이 모두200. |
| 편집 가능한 프롬프트 | docs/character-prompts.md에 공통·유형별 prompt/negative/model/seed/params. 재생성 스크립트의 --check 성공. |
| 제공 자료 및 외부 참고 | 저장 HTML 본문·각주와 외부 참고 링크11개 모두 조회 시도. 한국연구소 TLS 오류와 일부 jump 출처 해석 실패를 docs/research.md에 구분 기록. 확인 가능한 1차 자료·문헌 고찰을 함께 반영. |
| Supabase 권한 | 앱의4개 테이블 RLS=true, anon SELECT=false, authenticated UPDATE=false. 빈 search_path의 제한된 RPC만 공개. 기존 다른 프로젝트 테이블을 수정하지 않음. |
| 모바일 | 실제390px에서 홈페이지·질문·공유 결과를 시각 검토. 공유 결과 scrollWidth=clientWidth=390. 뷰포트 override 해제 완료. |
| 후속 성격검사 확장 | 콘텐츠·계산·도형·저장·UI를 별도 모듈로 분리하고 검사 버전과 향후 이관 지침 문서화. 현재 제공 검사는 에니어그램만. |

## 실행한 검증

- `npm test`: 33 tests, 33 pass, 0 fail.
- `npm run build`: Worker와 client 빌드 성공. Cloudflare 도구가 로컬 Docker daemon 미실행 메시지를 출력하지만 빌드 종료0, deploy 및 Worker 서비스 정상.
- `npm audit`: 알려진 취약점0건. cf의 miniflare가 사용하는 sharp를 패치 버전으로 override.
- `node scripts/smoke-test.mjs`: 실서비스 health·27프로필·저장·조회·충돌·입력 검증·갱신·삭제·균형 공유·미존재 공유 모두 성공.
- 실제 균형 공유 링크를 브라우저에서 열어 유형을 강제로 지정하지 않는 화면 확인.
- 로컬 개발 실행: cwd `/Users/izowooi/git/creative-plate/enneagram`, `python3 scripts/cloudflare-run.py dev`, URL `http://127.0.0.1:5179`. 숨겨진 stdin으로 key 입력 후 홈페이지200와 `/api/health storage:true` 확인. 검증 서버 종료.
- 실서비스 브라우저 검증으로 폼의 name=id가 form.id를 가리는 문제를 발견해 name=storageId 및 matches selector로 수정하고 실제 새ID 저장·복원을 재검증.
- 브라우저 검증용 보관 세션 및 공유2개만 정리. 기기 내 검증 답변을 비우고 배포 홈페이지를 사용자에게 남김.

## 측정과 운영의 한계

이 검증은 앱의 구현과 배포 동작을 확인한다. 새로운 문항의 심리측정 타당도·신뢰도를 검증한 연구가 아니다. 이 한계를 시작 안내, 결과, 자료 화면에 표시한다. 서버 장애나 브라우저 데이터 삭제 시의 동작을 안내하며, 다른 기기로 이동하기 전 저장 완료 상태 확인을 권장한다.

초기 Supabase 조회에서 기존 `hs_heroes`, `restaurants`, `tr_restaurants`의 RLS 비활성 상태가 발견됐다. 이 앱이 소유한 테이블이 아니므로 자동으로 권한을 바꾸지 않았다. 해당 서비스의 익명 권한·정책을 별도로 점검할 필요가 있다.

Cloudflare의 기존 보안 정책이 Python urllib의 기본 클라이언트 요청에403을 반환했으나, 실제 브라우저·Node fetch·curl에서 홈페이지/API/이미지를 확인했다. 기존 보안 정책은 변경하지 않았다.
