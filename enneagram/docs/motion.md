# 마음지도 모션 변경

2026-10-15. Prompt Motion의 영상·제작 프롬프트를 참고해 기존 마음지도 웹 UI에 맞는 모션을 직접 구현했다. 사이트가 제공하는 삽입형 컴포넌트를 설치한 것이 아니며, 원작 영상·코드를 앱 자산으로 복제하지 않았다.

## 참고 자료와 적용

- [The showreel prompt](https://prompt-motion.com/templates/showreel): 일관된 콘셉트와 앞 장면에서 다음 장면으로 이어지는 변화를 참고했다. 제목의 줄별 등장, 예시 도형 선택, 결과의 도형·점수 등장에 적용했다. 원본 영상의 빠른 광고 편집 대신 읽을 시간이 필요한 검사 UI의 속도로 조정했다.
- [The 3D template](https://prompt-motion.com/templates/realtime): 커서와 주변 요소에 반응하는 카드의 입체감과 부드러운 정착을 참고했다. 지도 종이와 캐릭터 카드의 미세 기울기·광택·이미지 확대를 CSS transform으로 구현했다.
- [Charts collection](https://prompt-motion.com/tags/charts): 데이터가 점차 드러나는 표현을 참고해 연결선·결과 다각형·꼭짓점·점수 바가 순차적으로 나타나게 했다.

## 변경

- 짙은 숲색 배경과 작은 궤도로 첫 화면의 대비·깊이를 강화했다.
- 첫 화면에서 1–9번을 눌러 예시 지도와 캐릭터·설명을 바꿀 수 있다. 실제 검사 결과와 혼동하지 않도록 예시임을 명시한다.
- 스크롤 진입 시 카드·설명 블록을 85ms 간격으로 등장시킨다. 한 번 나타난 블록은 계속 표시한다.
- 질문 페이지 변경에만 짧은 전환을 적용한다. 매 응답마다 폼 전체가 사라졌다 나타나지 않는다.
- 헤더에서 모션을 끄거나 켤 수 있다. 선택은 검사 응답과 분리해 저장한다. OS의 prefers-reduced-motion 설정이 우선하며, 일시 정지 중 숨겨진 콘텐츠가 남지 않도록 처리한다.
- 배경 탭에서는 장식용 반복 애니메이션을 정지한다. 모바일에서는 포인터 기울기를 사용하지 않는다.
- SVG 내보내기에는 화면 애니메이션 스타일을 포함하지 않아 PNG에 완성된 도형을 담는다.

추가 런타임 의존성은 없다. 파일은 `src/motion.js`, `src/motion.css`이며 `src/app.js`와 `src/diagram.js`에서 연결한다. 서버·DB 스키마·문항·계산식은 변경하지 않는다.

## 검증과 배포 결과

2026-10-16 KST 재확인 및 배포:

- `npm test`: 38개 통과. 기존33개와 모션 컨트롤 검증5개.
- `npm run build`: Worker와 클라이언트 빌드 성공.
- `cf auth whoami`: authenticated=true, tokenValid=true, 계정1개 조회 성공.
- `cf deploy --prebuilt --mode production`: 성공. Worker 버전 `749827f0-ba5e-4425-aee4-9972afbad614`, Custom Domain https://eg.zowoo.uk .
- 실제 운영 홈페이지와 CSS/JS가 최종 로컬 빌드와 SHA-256까지 일치하고 HTTP200을 반환한다. `/api/health`도200 및 storage=true다.
- 로컬 검증 서버도 정상 실행되고 홈페이지200을 확인했다. cwd `/Users/izowooi/git/creative-plate/enneagram`, 실행 `npm run dev`, URL `http://127.0.0.1:5179`. 서버 보관용 로컬 secret은 주입하지 않았으며 검증 후 서버를 종료한다.
- 실제 브라우저 시각 검증은 도구의 request-header policy 서비스 연결 실패(자체 서비스의403 응답)로 수행하지 못했다. 이는 Cloudflare 배포 API의 인증 상태와 별도다.

## 이전 실패의 원인과 재발 시 확인

이전 제한된 에이전트 세션에서는 `api.cloudflare.com` DNS 조회가 실패했고 배포가 `fetch failed`로 중단됐다. 같은 세션에서 `.git/index.lock` 쓰기와 로컬 서버 포트 열기도 거부됐다. 로그인 정보를 읽을 수 있는 권한과 배포 API에 연결할 수 있는 권한은 별도다.

cf1.0.0-beta.13의 구현에서 `tokenValid`는 사용자/계정 API 조회가 하나라도 성공했는지로 결정된다. 네트워크가 막혀 조회가 모두 실패해도 false이므로, 이것만으로 토큰이 잘못되었다고 단정하지 않는다. 최초 로그아웃 안내는 이후 진단에서 정정했다. 에이전트 세션의 권한과 네트워크 접근이 복구된 뒤 같은 로그인 정보로 검증·배포가 성공했다. 사용자 로그인 자체를 다시 만들거나 앱 코드를 수정할 필요가 없었다.

재발하면 다음 순서로 확인한다.

1. `cf auth whoami`의 authenticated/tokenValid 및 계정 조회 결과를 확인한다.
2. `curl -I https://api.cloudflare.com/client/v4/`로 DNS/TLS 연결을 확인한다. 이 루트 경로는 인증된 개별 API가 아니므로 HTTP400 같은 응답도 연결 성공을 뜻할 수 있다. `Could not resolve host`는 로그인 전에 해결해야 하는 네트워크 오류다.
3. 에이전트 세션에서만 실패하면 해당 세션의 네트워크 허용과 모노레포 루트 쓰기 권한을 확인한다. 필요하면 사용자 터미널에서 같은 명령을 비교한다.
4. API 연결이 가능한데 authenticated=false 또는 실제 API401 응답이면 `cf auth login`을 실행한다.
5. 이 프로젝트 폴더에서 `npm run build`와 `cf deploy --prebuilt --mode production`으로 배포한다.
