# 저장과 공유 API

계산과 기기 내 자동 저장은 브라우저에서 수행한다. 서버 요청은 사용자가 보관 ID로 불러오거나 저장할 때, 공유 링크를 만들 때만 발생한다. 서버 장애가 있어도 로컬 응답은 유지된다.

Supabase 프로젝트: `elufbvcnhitoksoofbir`. `enneagram_` 접두사를 가진 새 테이블과 함수만 추가한다. 기존 프로젝트 테이블은 수정하지 않는다. 모든 앱 테이블에 RLS를 켜고 `anon`/`authenticated`의 직접 테이블 접근을 제거한다. 필요한 RPC만 실행 권한을 부여하며 `security definer` 함수는 빈 `search_path`를 사용한다.

## Worker 환경

- `ASSETS`: Cloudflare 정적 자산 바인딩. API 외의 요청을 처리한다.
- `SUPABASE_URL`: 프로젝트 API URL.
- `SUPABASE_ANON_KEY`: legacy anon JWT 또는 새 `sb_publishable_` key를 Worker secret으로 주입한다. 클라이언트 코드에 포함하지 않는다. 새 publishable key는 [Supabase API key 안내](https://supabase.com/docs/guides/getting-started/api-keys)에 따라 `apikey` 헤더에만 전송한다.
- `API_LIMITER` (선택): Cloudflare Rate Limiting binding. IP별 요청 제한에 사용한다.

Worker에는 로그인 기능이나 service role key가 없다. 보관 ID는 trim 후 Unicode NFC로 정규화한 8~64자 문자·숫자·`_`·`-` 문자열이다. 공백은 양끝만 허용한다. ID를 아는 사람은 응답을 조회·수정·삭제할 수 있으므로 개인정보와 흔한 닉네임 대신 긴 임의의 ID를 사용한다. 클라이언트가 보내는 ID는 Worker 메모리에서 `SHA-256("enneagram:v1:" + ID)`로 바뀌며 Supabase에는 해시만 전달된다. ID 복구나 본인 확인 기능은 없다.

## 계약

본문은 `application/json` 객체이며 16 KiB 이하여야 한다. API 응답은 `Cache-Control: no-store`를 사용한다. 다른 Origin에서 보내는 요청은 거부한다.

| API | 입력 | 성공 응답 |
| --- | --- | --- |
| `POST /api/session/load` | `{id}` | `{session:null}` 또는 `{session:{answers,revision,updatedAt}}` |
| `POST /api/session/save` | `{id,answers,revision}` | `{revision,updatedAt}` |
| `DELETE /api/session` | `{id}` | `{deleted:true}` |
| `POST /api/share` | `{scores,primary,wing,profileKey}` | HTTP 201 `{id}` |
| `GET /api/share/:id` | UUID v4 경로 | `{scores,primary,wing,profileKey,createdAt}` |
| `GET /api/profiles` | 없음 | 사전 생성한 27개 프로필 배열 |
| `GET /api/health` | 없음 | `{ok:true,storage:boolean}` |

`answers`는 `{q1:1,...,q54:5}`의 부분 객체이며 각 값은 1~5 정수다. 새 세션의 최초 저장 `revision`은 0이다. 그 이후 저장은 마지막 서버 버전을 사용한다. 서버는 원자적으로 비교 후 버전을 증가시킨다. 오래된 버전이나 서버에서 삭제된 세션으로 저장하면 HTTP 409 `{error:"conflict",session:...}`를 반환한다. 클라이언트는 사용자에게 선택받은 후 서버 버전으로 재저장하거나 서버 응답을 불러온다. 임의 덮어쓰기는 하지 않는다.

공유 점수는 유형 1~9 순서의 0~100 숫자 9개다. `primary`는 최고 점수 유형, `wing`은 인접 유형 또는 `null`, `profileKey`는 `"1"` 또는 `"1w9"`와 같은 정확한 프로필 키다. 최고·최저 점수 차이가 문항 1점 이내면 `primary`, `wing`, `profileKey` 모두 `null`인 균형 결과를 저장할 수 있다. 원점수 차이 4.167을 소수 첫째 자리로 반올림해 전달하므로 서버 허용 차이는 4.2이다. 공유 기록에는 원문 응답, 보관 ID, 보관 ID 해시, IP를 넣지 않는다. 공유 UUID를 아는 사람은 결과를 볼 수 있다.

오류는 `{error,message}` 형식이다. 입력 오류 400, Origin 오류 403, 미발견 404, 메서드 오류 405, 충돌 409, 크기 오류 413, 콘텐츠 타입 오류 415, 빈번한 요청 429, Supabase 연결·설정 오류 503으로 구분한다. 429에는 `Retry-After: 60`을 보낸다. 내부 DB 진단이나 credential은 응답에 포함하지 않는다.

## 제한과 보존

SQL RPC는 한 보관 ID에 대해 분당 60회, 공유 생성은 IP와 날짜를 해싱한 키에 대해 분당 12회를 허용한다. 이는 여러 Worker 인스턴스에도 유지된다. 오래된 제한용 버킷은 요청 때 작은 묶음으로 정리한다. Cloudflare `API_LIMITER`를 연결하면 DB 요청 전 IP 제한도 적용된다. 로그인 없이 운영하므로 공개된 ID의 추측이나 악의적인 사용자까지 완전히 막는 인증 장치로 볼 수는 없다. Supabase anon key를 가진 호출자는 공개 RPC를 직접 호출할 수 있으며 조작한 제한 키에 대한 방어는 Cloudflare 경로와 별개다.

사용자 응답은 직접 삭제할 때까지 저장된다. 공개 공유 결과에는 개인 응답이 없고 만료를 설정하지 않는다. 새로운 문항을 출시하면 기존 q1~q54 계약을 바꾸기 전에 검사 버전과 이관 정책을 별도로 도입한다.

## 검증

`node --test tests/api.test.js`는 해싱, 유효성 검사, 버전 충돌, 공유 개인정보 제외, 제한, 서버 장애, 크기 제한과 정적 자산 전달을 검증한다. Supabase에서 실제 RPC 생성·저장·충돌·갱신·삭제를 트랜잭션 안에서 확인하고 rollback한다. 테이블 RLS와 anon/authenticated 권한을 직접 조회한다.
