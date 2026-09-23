# 개발 전에 준비할 것과 전달할 정보

작성일: 2026-09-23. 근거·제약은 [사전 조사](01-feasibility.md), 실행 지시는 [goal 프롬프트](03-goal-prompt.md)에 있다.

**앱 프로젝트는 아직 만들 필요 없다.** 현재 `creative-plate/housing-subscription` 안에서 이어가면 된다. Android/iOS를 함께 만들 때는 빈 폴더에 Flutter 프로젝트 하나를 생성하는 방식을 추천한다. 이미 만든 네이티브 프로젝트가 있다면 경로와 사용 기술을 알려주면 된다.

키 값·비밀번호·인증서 내용을 채팅이나 이 문서에 붙이지 않는다. 사용자에게 필요한 일은 계정 신청·본인확인·선택사항 결정이며, API 호출 코드·수집기·계산·앱·테스트는 개발 작업에서 처리할 수 있다.

## 1. 가장 먼저 할 일: 공공 API 6개 활용신청

[공공데이터포털](https://www.data.go.kr/)에 가입한 뒤 아래 서비스 각각에서 활용신청한다. 계정의 인증키가 같아 보여도 서비스별 활용승인은 따로 확인해야 한다.

- [ ] [청약홈 분양정보 조회 — 15098547](https://www.data.go.kr/data/15098547/openapi.do)
- [ ] [아파트 매매 실거래가 상세 — 15126468](https://www.data.go.kr/data/15126468/openapi.do)
- [ ] [LH 분양임대공고문 — 15058530](https://www.data.go.kr/data/15058530/openapi.do)
- [ ] [LH 공고별 상세정보 — 15057999](https://www.data.go.kr/data/15057999/openapi.do)
- [ ] [LH 공고별 공급정보 — 15056765](https://www.data.go.kr/data/15056765/openapi.do)
- [ ] [마이홈 공공주택 모집공고 — 15108420](https://www.data.go.kr/data/15108420/openapi.do)

활용 목적 문구 예시:

> 아파트 모집공고와 주택형별 공급가격, 주변 실거래 정보를 조합하여 사용자가 설정한 관심 지역 및 가격 조건에 맞는 공고를 안내하는 Android/iOS 앱을 개발합니다. 공식 출처와 원문 링크를 표시하고, 비교가격은 참고용 추정치로 제공합니다. 개발 검증 후 일반 사용자 대상 서비스 운영을 계획합니다.

실제 계획과 다른 부분은 수정한다. 개발계정의 서비스 이용기간·할당량을 확인하고, 공개 서비스 전에는 운영계정 전환·필요 트래픽 증설 조건도 확인한다.

전달할 정보는 **서비스명, 승인 여부, 유효기간, 할당량, 키의 로컬 보관 위치 또는 환경변수 이름**이다. 실제 키는 로컬 비밀 저장소에 보관한다. API별로 같은 키를 쓰는지는 연결 검증에서 확인하고 코드에 단정하지 않는다. URL 인코딩을 두 번 하지 않도록 원문 키와 encoded key의 처리도 구분한다.

공개 가이드를 저장하고 싶다면 위 포털의 최신 참고문서와 [청약홈 기술문서](https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=10251&bbsId=1268&nttSn=79889)를 사용한다. 키가 보이는 활용 화면·전체 요청 URL은 공유하지 않는다.

## 2. SH의 지원 범위를 결정한다

마이홈에는 공공분양·공공임대 조회 operation이 있지만 SH 전체 공고 포함은 미검증이다. 이 문제는 앱 코딩 전에 실제 API 응답과 원문을 비교하면 상당 부분 해소할 수 있다.

- [ ] SH를 첫 베타의 필수 지원 소스로 둘지, 검증된 범위를 명시하고 단계적으로 추가할지 선택한다.
- [ ] 평소 보는 SH 공식 공고 게시판 URL과 관심 공고 예시가 있다면 적는다. 카페 글은 원문을 찾는 단서로만 사용한다.
- [ ] 전체 지원이 필요한데 API에서 누락되면, 공식 제공 경로 또는 허용되는 수집 방법을 문의한다.

**아래는 사용자가 필요할 때 보낼 문의 초안이며, 이번 작업에서 발송하지 않았다.**

> 안녕하세요. SH 아파트 모집공고를 관심 지역별로 안내하는 앱을 준비 중입니다. 공공분양·공공임대·잔여세대·정정공고의 목록, 모집기간, 공급위치, 주택형별 가격 및 원문 링크를 제공받을 수 있는 공식 OpenAPI, RSS 또는 데이터 연계 경로가 있는지 문의드립니다.
>
> 마이홈 공공주택 모집공고 API에 SH의 어떤 공고 유형이 포함되며, 신규·정정 반영주기와 제외 범위는 어떻게 되는지도 확인 부탁드립니다. 별도 연계 경로가 없다면 공개 공고 게시판과 첨부문서를 정기 조회하여 필요한 항목을 추출하고, 출처·원문 링크와 함께 앱 및 푸시 알림으로 제공하는 이용조건을 알려주시면 감사하겠습니다. 상업적 서비스 전환 가능성, 원문 보관·재배포 조건과 권장 호출 주기도 함께 확인하고 싶습니다.

SH 데이터 제공 담당 또는 공식 홈페이지 문의 창구를 사용한다. 카페 로그인 계정이나 호갱노노 계정을 개발용으로 준비할 필요는 없다.

## 3. 지역·가격·주택 유형을 선택한다

| 선택할 내용 | 권장 출발점 | 필요한 이유 |
| --- | --- | --- |
| 초기 대상 지역 | 서울·경기·인천 중 실제 검증할 시군구부터 | 비교 거래와 공고 정확성 검증 범위 결정 |
| 공급 유형 | 아파트 분양·무순위·잔여세대·재공급·임의공급 | 유형별 일정·조건이 다름 |
| 공공임대 포함 여부 | 선택사항으로 분리 | 보증금·월세는 매매 차액 필터와 다름 |
| SH 필수 여부 | 원래 요구를 유지하려면 필수 | 데이터 미확보 시 완료 판단에 영향 |
| 사용자 지역 입력 | 거주지와 관심지역 별도, 시도·시군구 수준 | GPS 없이 지역 매칭 가능 |
| 전국 신청 공고 | 관심지역 필터는 유지, 별도 ‘전국 기회 받기’ 선택 제공 | 전국 신청 가능과 전국 모든 아파트 관심은 다름 |
| 자격 확인 필요 공고 | 별도 표시하여 받기 | 불확실한 공고가 조용히 누락되는 문제 감소 |
| 가격 조건 | 최대 분양가·최소 비교차액·최소 차이율 선택 | ‘가격 필터’의 의미 명확화 |
| 차액의 가격 기준 | 주택형별 분양최고가, 비용 반영 전 | 공식 API가 제공하는 값과 일치 |
| 데이터 부족 | 가격 알림 제외, 지역 공고는 확인 필요 표시 | 가짜 차익 알림 방지 |
| 알림 종류 | 신규, 중요 정정, 마감 전 알림 | 중복·과다 알림 억제 |
| 로그인 | 익명 인증으로 시작 | 가입 없이 이용; 재설치·다른 기기 복원은 후속 기능 |

이 표는 제안이며, 사용자의 확정 요구를 대신하지 않는다. 특히 SH와 임대 포함 여부는 아래 답변 양식에서 명시한다.

## 4. 실제 푸시를 위해 Firebase를 준비한다

- [ ] 본인 Google 계정으로 이 앱 전용 Firebase 개발 프로젝트를 만든다. 기존 적절한 프로젝트가 있다면 재사용 여부를 적는다.
- [ ] 공개 식별자인 **Firebase project ID**를 기록한다.
- [ ] Firestore를 만들고 위치를 선택한다. 서울 `asia-northeast3`를 우선 검토한다. 위치는 생성 전에 결정한다. [공식 위치 목록](https://firebase.google.com/docs/firestore/locations)
- [ ] Authentication에서 익명 인증 사용 여부를 정한다. 실제 배포 전 Security Rules를 검증하며, 공개 read/write test mode로 운영하지 않는다.
- [ ] Android application ID와 iOS bundle ID를 정하고 Firebase에 등록한다. 예: `com.example.housingalerts`를 본인용 고유 ID로 바꾼다.
- [ ] 앱 등록에서 받은 `google-services.json`, `GoogleService-Info.plist`를 로컬에 보관하고 **경로만** 전달한다.
- [ ] 맥미니 수집기의 관리자 인증 수단을 준비한다. ADC 등 적절한 방식 또는 필요한 최소 권한의 service account 파일을 사용하고 경로만 전달한다. project Owner 같은 과도한 권한을 기본값으로 주지 않는다.

클라이언트 Firebase 설정과 서버 관리자 개인키는 용도가 다르다. 특히 **service account 개인키는 앱에 넣으면 안 된다.** 이 저장소의 키 커밋 금지 정책에 맞춰 값이 포함된 설정 파일도 로컬로 주입한다. 실제 파일을 Git에 넣지 않으며, 필요할 때 `.gitignore`에 해당 파일명·경로를 명시한다.

맥미니에서 FCM을 발송하면 Cloud Functions를 반드시 쓰지는 않아도 된다. FCM 자체는 무료지만 다른 Firebase 기능의 무료 한도·과금 요건은 별도다. 비용 상한과 허용 기능을 먼저 정한다. [Firebase 요금](https://firebase.google.com/pricing), [서버 환경 안내](https://firebase.google.com/docs/cloud-messaging/server-environment)

## 5. iPhone과 Android 준비를 구분한다

| 항목 | 개발·기기 검증 | 스토어 배포 |
| --- | --- | --- |
| iOS | Xcode, 서명 가능한 Apple 개발 계정, iPhone, Push capability, Firebase에 APNs 키 연결 | Apple Developer Program, App Store Connect, 스토어 정보·심사 |
| Android | Android SDK/JDK, Android 테스트 기기, 앱 알림 권한 | Play Console, 배포 서명, 계정 유형별 테스트·심사 |

iOS에서 준비할 것은 Apple **Team ID, bundle ID, APNs Key ID**, 그리고 Firebase에 APNs `.p8` 키를 연결했는지 여부다. `.p8` 파일 자체나 Apple 로그인 비밀번호를 채팅으로 보내지 않는다. 두 앱의 식별자와 Firebase 등록값이 일치해야 한다. [FCM iOS/Flutter 설정](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)

Android 13 이상에서는 알림 런타임 권한을 처리해야 한다. 사용자가 거절해도 앱 공고 목록은 사용할 수 있게 구현한다. [Android 알림 권한](https://developer.android.com/develop/ui/compose/notifications/notification-permission)

공식 안내 기준 Apple은 연 US$99 또는 현지 통화, Play 등록은 US$25 일회성이다. 새 개인 Play 계정에 적용되는 12명·14일 비공개 테스트도 미리 준비한다. 실제 결제 가격과 계정별 요구사항은 가입 화면에서 확인한다. [Apple](https://developer.apple.com/support/compare-memberships/), [Play 등록](https://support.google.com/googleplay/android-developer/answer/6112435?hl=ko), [Play 테스트](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)

Flutter나 Android Studio를 미리 설치하지 않았다면 설치 여부만 알려주면 된다. 필요한 버전 확인과 프로젝트 생성은 개발에서 수행한다. 본인확인·약관 동의·결제·기기 알림 허용은 사용자가 직접 처리해야 한다.

## 6. 맥미니 운영 조건과 선택 서비스

- [ ] 맥미니가 상시 켜져 있고 인터넷을 사용할 수 있는지 확인한다.
- [ ] 절전 방지, 재부팅 후 자동 시작 방식, 서비스 실행 계정을 결정한다. 지금 조사 단계에서 시스템 설정을 변경할 필요는 없다.
- [ ] 공고 수집은 30분, 실거래는 하루 1회라는 제안 주기를 수용할지 정한다.
- [ ] 수집 실패·오래된 데이터 상태를 운영자가 확인할 방법을 정한다. 맥미니 자체가 꺼져도 감지하려면 외부 heartbeat 감시가 필요하다.
- [ ] 로컬 원자료·DB의 백업 경로와 보관기간을 정한다. 백업에 포함되는 사용자 정보도 보호한다.
- [ ] 주소 좌표 변환은 카카오 Local 또는 다른 공식 서비스 하나를 선택한다. 이미 키가 있다면 서비스명·로컬 보관 위치만 전달한다. [카카오 공식 문서](https://developers.kakao.com/docs/ko/local/dev-guide)
- [ ] 월 운영비의 **예산 상한**을 정한다. 예: 월 30,000원은 사용자가 정할 수 있는 한도 예시이며 예상 요금 견적이 아니다.

일반 공개 전에 앱 이름, 지원 이메일, 운영자 표시명, 개인정보처리방침 공개 URL, 수집·보관·삭제 방침을 준비한다. 서비스 계정/토큰·관심지역·사용자 조건을 처리하는 SDK와 실제 데이터 흐름에 맞춰 스토어 개인정보 공개를 작성한다. 정책 문안의 초안과 앱 내 삭제 기능은 개발에서 만들 수 있다. [Apple 정책](https://developer.apple.com/app-store/review/guidelines/#privacy), [Google 정책](https://support.google.com/googleplay/android-developer/answer/10144311)

## 7. 나중에 전달할 답변 양식

아래 내용을 복사해 채우면 된다. 비밀 값이나 상세 집주소는 적지 않는다. 계정 준비가 안 된 것은 `미준비`로 적는다. 실제 배포·운영 반영은 허용된 범위만 수행하도록 구분한다.

```yaml
# 비밀 값 없는 개발 준비 정보
project_path: /Users/izowooi/git/creative-plate/housing-subscription
app_name: 미정
project_state: 빈 폴더 # 또는 기존 프로젝트 경로와 Flutter/Swift/Kotlin 등
preferred_stack: Flutter + Python + Firebase # 권장안, 수정 가능
target_platforms: [Android, iOS]
completion_target: 실기기 푸시가 검증된 베타 # 스토어 제출 준비까지 원하면 추가

coverage:
  interest_regions: 미정 # 시도/시군구
  housing_types: 미정 # 분양/무순위/잔여세대/재공급/임의공급/공공임대
  required_sources: [청약홈, LH, SH] # SH를 후속으로 미루려면 여기서 명시
  sh_if_incomplete: 미정 # 필수 유지 / 검증된 범위만 표시하고 나머지 후속
  unknown_region_eligibility: 확인 필요로 별도 알림
  nationwide_opportunities: 관심지역 적용, 전국 기회는 별도 선택

price:
  default_max_supply_price_krw: 미정 # 필터 꺼짐도 가능
  default_min_gap_krw: 500000000 # 예시 5억원, 원 단위
  default_min_discount_percent: 미정 # 필터 꺼짐도 가능
  price_basis: 주택형별 공고 분양최고가
  gap_basis: 비교 거래 중앙값 대비 차액, 추가비용 반영 전
  insufficient_data: 가격 알림 제외
  exclude_nonstandard_ownership_from_gap: true

api_approvals:
  applyhome_15098547: 미준비
  apartment_trade_15126468: 미준비
  lh_notice_15058530: 미준비
  lh_detail_15057999: 미준비
  lh_supply_15056765: 미준비
  myhome_15108420: 미준비
public_api_secret_locations: 미정 # 서비스별 환경변수 이름 또는 로컬 저장 위치만
api_quota_and_expiry_notes: 미정
geocoding_provider_and_secret_location: 미정

firebase:
  project_id: 미정
  firestore_location: 미정
  anonymous_auth_enabled: false
  android_application_id: 미정
  ios_bundle_id: 미정
  android_client_config_path: 미정
  ios_client_config_path: 미정
  server_auth_method_or_file_path: 미정 # 파일 내용 금지

apple:
  developer_membership_active: false
  team_id: 미정
  apns_key_id: 미정
  apns_uploaded_to_firebase: false
android:
  play_account_ready: false
  account_type_and_testing_requirement: 미정
test_devices: 미정 # Android/iPhone 보유 및 연결 가능 여부

operations:
  mac_mini_always_on: 미정
  collector_timezone: Asia/Seoul
  poll_interval_minutes: 30
  quiet_hours: 미정
  backup_location: 미정
  health_monitor_method: 미정
  monthly_budget_cap_krw: 미정
  development_project_test_upload_and_own_device_push_allowed: 미정
  production_deployment_allowed: false
  paid_resource_creation_allowed: false
  macos_system_setting_changes_allowed: false

official_notice_examples: [] # 원문 URL 몇 개가 있으면 유용, 없으면 개발에서 찾기
support_email: 미정
operator_display_name: 미정
privacy_policy_url: 미정 # 베타 개발에서는 초안 작성 가능
```

## 8. 어느 시점에 개발을 시작하면 되는가

**화면·로직 개발 시작:** 프로젝트 위치, 지원 유형·지역, SH 범위, 기술 선택이 정해지면 가능하다. 키가 없으면 fixture 기반 작업은 할 수 있지만 실제 서비스가 완료된 것은 아니다.

**한 번의 goal로 실사용 베타까지 진행:** API 6개 승인, Firebase 프로젝트·인증 준비, iOS 서명·APNs 준비, 두 플랫폼 테스트 기기, 개발환경 업로드·본인 기기 테스트 푸시 허용 범위를 함께 전달하는 것이 좋다. 키를 받았다고 SH 커버리지까지 검증된 것은 아니므로 개발의 첫 단계에 데이터 검증을 포함한다.

**공개 출시:** 실제 연결·기기 검증 후 스토어 계정·심사·개인정보 공개·서명·운영 안정성 검증이 추가된다. 공고 파싱 오류와 데이터 소스 변경에 대응할 유지보수도 계속 필요하다. ‘한 번 개발하면 운영 업무가 영구히 없어짐’을 전제로 하지 않는다.
