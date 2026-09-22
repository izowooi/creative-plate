# 사용자가 완료할 설정

이 문서는 앱 구현과 별개로 계정 소유자가 처리할 항목이다. 앱 ID는 두 플랫폼 모두 `com.izowooi.dm`, 제품명은 `소리결 · Sori`다. 아래 항목을 모두 끝내기 전에도 simulator/emulator와 앱 개발은 가능하다.

## Apple Developer / App Store Connect

- [ ] 멤버십 갱신이 계정에 반영됐는지 확인하고 최신 약관에 동의한다.
- [ ] Certificates, Identifiers & Profiles → Identifiers에서 Explicit App ID `com.izowooi.dm`을 등록한다. 기존에 있으면 재사용한다.
- [ ] 별도로 추가할 Capabilities는 없다. 마이크는 코드의 사용 목적 문구와 런타임 권한으로 처리한다. 푸시·iCloud·HealthKit·Sign in with Apple·백그라운드 녹음은 현재 앱 기능에 포함하지 않는다.
- [ ] App Store Connect → Apps → New App에서 iOS 앱을 만든다. 이름은 `소리결 - 소음계` 또는 영어 `Sori - Sound Meter`, Bundle ID는 위와 동일, SKU는 예를 들어 `sori-ios-001`로 입력한다. 스토어 이름 사용 가능 여부는 실제 등록 화면에서 확인한다.
- [ ] `ios/dm.xcodeproj` → dm target → Signing & Capabilities에서 본인의 Team과 Automatically manage signing을 확인한다.
- [ ] 실제 iPhone에서 Developer Mode·Mac 신뢰를 완료하고, Xcode에서 기기를 실행 대상으로 선택해 Run한다. 시뮬레이터 빌드와 실제 기기 서명은 별개다.
- [ ] 업로드 시 개인정보처리방침 URL·지원 URL·연락처를 실제 운영 주소로 입력한다.

App ID 등록 공식 안내: https://developer.apple.com/help/account/identifiers/register-an-app-id
앱 레코드 생성 공식 안내: https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app

## Firebase

- [x] 전달한 Android·iOS 설정 파일이 같은 Firebase 프로젝트와 `com.izowooi.dm`에 대응하는지 확인했다.
- [x] Android는 `android/app/google-services.json`, iOS는 `ios/dm/GoogleService-Info.plist`에 로컬로 배치했다. 파일은 Git에서 제외한다.
- [x] Firebase Console에 등록된 두 앱 ID와 로컬 설정의 일치를 Firebase CLI로 확인했다.
- [x] iOS Release archive와 Crashlytics dSYM 서버 업로드를 검증했다.
- [x] Firebase Core / Crashlytics SDK를 코드에 연결했다. Analytics·광고·로그인·Cloud Storage·Firestore는 사용하지 않는다.
- [ ] Firebase Console에서 해당 프로젝트의 Crashlytics 화면을 확인한다. 실제 오류 보고는 앱 설정에서 **오류 진단 공유**를 켠 사용자에 한해서 수집한다.
- [ ] 출시 전 별도 테스트 빌드에서 진단 공유를 켜고 Firebase의 테스트 충돌 절차로 실제 콘솔 수신을 확인한다. 일반 사용자 앱에는 충돌 유발 버튼을 제공하지 않는다.
- [ ] 보고서 수집을 선택한 사용자의 오류·앱/기기 정보·설치 식별자가 Firebase로 전송됨을 스토어 데이터 공개 항목에 반영한다. 원음·측정값·보정 메모는 전송하지 않는다.

API key, 서비스 계정 private key, Apple 인증서 파일을 채팅이나 Git으로 전달할 필요는 없다. 클라이언트 설정 파일은 현재 로컬 위치를 유지하면 된다.

## Android / Play Console

- [ ] 출시할 Play Console 계정의 본인·기기 확인을 완료한다.
- [ ] 앱을 무료로 생성한다. 광고 없음, 로그인 없음, 마이크는 소리 레벨 측정에만 사용한다.
- [ ] Play App Signing을 설정한다. 출시용 upload keystore와 비밀번호는 저장소 밖에서 보관한다. 개발용 debug 서명으로 출시하지 않는다.
- [ ] Android Studio의 Generate Signed App Bundle에서 `com.izowooi.dm` release AAB를 본인의 upload key로 서명한다.
- [ ] 신규 개인 계정에 해당하면 비공개 테스트 12명/연속 14일 및 프로덕션 접근 신청을 진행한다. 실제 요건은 계정 대시보드와 아래 공식 문서를 확인한다.
- [ ] 개인정보처리방침 URL·Data safety·콘텐츠 등급·앱 접근성·광고 여부와 스토어 설명·스크린샷을 작성한다.

Play 개인 계정 테스트 안내: https://support.google.com/googleplay/android-developer/answer/14151465?hl=en
Play 앱 설정 안내: https://support.google.com/googleplay/android-developer/answer/9859152?hl=en

## 기기 측정 확인

- [ ] iPhone과 Android 기기에서 마이크 권한 허용/거부, 시작/종료, 홈 화면 전환, 통화/다른 녹음 앱, 이어폰·USB 마이크 연결 변경을 확인한다.
- [ ] 실제 음압 수치를 사용하려면 참조 소음계와 가중 방식을 맞춰 보정한다. 참조 장비 없이 기종별 기본 보정값을 추측해서 입력하지 않는다.
- [ ] 조용한 환경·보통 소리·큰 소리에서 기준 계측기와 나란히 비교하고, 기기별 오차·입력 한계를 기록한다. 시뮬레이터나 수식 테스트는 실제 마이크 정확도 증거가 아니다.
