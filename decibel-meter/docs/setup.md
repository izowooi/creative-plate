# 데시벨 측정기 개발 준비

확인일: 2026-09-22. 계정 화면·비용·스토어 정책은 아래 공식 문서를 기준으로 확인했다.

현재 단계는 폴더 정리와 개발 환경 준비다. 앱은 아직 Android·iOS 기본 템플릿이며, 측정 기능은 다음 작업에서 구현한다. 기존 [spec.md](spec.md)는 iOS 중심의 출발점으로 보존했다. 다음 구현에서는 측정 원칙을 두 플랫폼에 공통 적용하고 필요한 부분을 개선한다.

## 1. 준비할 항목과 시점

권장 출발점은 **SwiftUI iOS 앱 + Kotlin/Jetpack Compose Android 앱, 기기 내 처리, Firebase 미사용**이다. 현재 명세의 측정·보정·그래프·CSV 공유에는 서버나 로그인이 필요하지 않다.

| 항목 | 지금 할 일 | 필요한 시점 |
| --- | --- | --- |
| 앱 식별자 | 두 플랫폼의 `com.izowooi.dm`을 유지할지 확정 | 외부 콘솔 앱 등록 전 |
| Apple Account / Xcode Team | Xcode 로그인 및 사용할 Team 확인 | iPhone 실기기 실행 전 |
| Apple Developer Program | 배포 계획이 있으면 기존 멤버십 확인 또는 가입 | TestFlight / App Store 배포 전 |
| Apple App ID / App Store Connect 앱 | 유료 멤버십이 있으면 아래 절차로 미리 등록 가능 | 첫 빌드 업로드 전 |
| Google Play Console | 출시할 계정의 가입·본인 확인 및 앱 초안 생성 | Play 배포 전 |
| Firebase | 기본안에서는 설정하지 않음 | 클라우드 기능을 채택할 때 |
| 테스트용 iPhone·Android 기기 | 모델과 OS 버전 확인, 개발 기기로 연결 | 마이크·입력 경로 검증 시 |
| 개인정보처리방침·지원 페이지 | 공개 URL과 문의 이메일 준비 | 스토어 등록 마무리 전 |

스토어 계정 등록을 모두 마쳐야 코드 개발을 시작할 수 있는 것은 아니다. Apple의 무료 Personal Team도 개인 실기기 테스트를 지원하며, TestFlight·App Store 배포에는 유료 멤버십이 필요하다. [Apple 멤버십 비교](https://developer.apple.com/support/compare-memberships/)

## 2. 폴더와 IDE 열기

```text
decibel-meter/
├── .gitattributes
├── .gitignore
├── docs/
│   ├── spec.md
│   └── setup.md
├── android/                 # Android Studio에서 이 폴더를 Open
│   ├── settings.gradle.kts
│   ├── build.gradle.kts
│   ├── gradlew
│   ├── gradle/
│   └── app/
└── ios/
    ├── dm.xcodeproj/         # Xcode에서 이 프로젝트를 Open
    ├── dm/                  # Swift 소스와 Assets
    ├── dmTests/
    └── dmUITests/
```

이전 `dm/`을 `android/`로 옮기고, `ios/dm/` 아래의 프로젝트와 소스 폴더를 `ios/` 바로 아래로 이동했다. 기존 프로젝트·타깃 이름 `dm`은 유지한다.

Android Studio에서는 `android/` 자체가 Gradle 프로젝트다. Xcode에서는 일반 폴더 대신 `ios/dm.xcodeproj`를 선택한다. 추가 프로젝트 생성이나 import 작업은 필요 없다.

프로젝트 루트에서 실행:

```sh
open -a "Android Studio" android
open ios/dm.xcodeproj
```

## 3. 먼저 확정할 앱 식별자

| 플랫폼 | 현재 값 | 설정 파일 |
| --- | --- | --- |
| iOS Bundle ID | `com.izowooi.dm` | `ios/dm.xcodeproj/project.pbxproj` |
| Android applicationId / namespace | `com.izowooi.dm` | `android/app/build.gradle.kts` |
| 사용자에게 보일 이름 | 명세의 가칭 `바로 소음계` | 다음 구현에서 적용 |

별도 선호가 없으면 현재 식별자를 유지하면 된다. 표시 이름과 내부 식별자는 달라도 된다. 변경하려면 콘솔 등록 전에 알려주면 코드도 함께 맞출 수 있다. Apple App ID는 Xcode의 Bundle ID와 일치해야 하고, Google Play 패키지명은 등록 후 지속되는 식별자다. [Apple App ID 등록](https://developer.apple.com/help/account/identifiers/register-an-app-id), [Google Play 앱 설정](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)

## 4. Apple에서 할 일

### 계정과 멤버십

- [ ] Xcode → Settings → Apple Accounts에서 사용할 Apple Account로 로그인한다.
- [ ] TestFlight·App Store 출시를 원하면 Apple Developer Program 멤버십이 활성 상태인지 확인한다. 미가입이면 개인/조직 중 실제 배포 주체에 맞게 가입한다.
- [ ] App Store Connect에서 요청하는 최신 약관에 동의한다.

가입에는 2단계 인증을 사용하는 Apple Account가 필요하다. 일반 멤버십은 연 US$99이며 실제 결제 금액은 지역별로 표시된다. 개인 가입은 개인의 법적 이름, 조직 가입은 조직 이름으로 판매자가 표시되므로 가입 유형을 먼저 결정한다. [Apple 가입 안내](https://developer.apple.com/programs/enroll/)

### App ID 등록

Apple Developer → Certificates, Identifiers & Profiles → Identifiers에서 기존 ID가 있는지 확인한다. 없다면 `+` → App IDs → App으로 등록한다.

| 입력란 | 권장 값 |
| --- | --- |
| Description | `Decibel Meter` |
| Bundle ID 유형 | Explicit |
| Bundle ID | `com.izowooi.dm` |
| 추가 Capabilities | 현재 기능을 위해 별도로 활성화할 항목 없음 |

이미 같은 Team에 ID가 있으면 재사용한다. 계정·푸시·iCloud 기능이 없는 기본안에는 Sign in with Apple, Push Notifications, iCloud, HealthKit 설정이 필요하지 않다. [Apple App ID 등록 절차](https://developer.apple.com/help/account/identifiers/register-an-app-id)

### App Store Connect 앱 생성

App Store Connect → Apps → `+` → New App에서 앱 레코드를 만든다.

| 입력란 | 권장 값 |
| --- | --- |
| Platforms | iOS |
| Name | `바로 소음계` — 사용 가능한 이름으로 조정 가능 |
| Primary Language | Korean |
| Bundle ID | 위에서 등록한 `com.izowooi.dm` |
| SKU | 예: `decibel-meter-ios-001` |
| User Access | 현재 팀의 접근 정책에 맞게 선택 |

SKU는 내부 관리용이다. 앱 레코드 생성은 빌드 업로드 전에 필요하며, 생성만으로 앱이 출시되지는 않는다. [Apple 앱 레코드 생성 안내](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app)

### Xcode 서명과 실기기

- [ ] `ios/dm.xcodeproj` → `dm` target → Signing & Capabilities에서 실제 사용할 Team을 선택한다.
- [ ] Automatically manage signing을 켜고 Bundle Identifier를 확인한다. 프로젝트에는 이미 Team 값과 자동 서명이 설정되어 있지만 멤버십·인증서 유효성은 별도 확인 대상이다.
- [ ] iPhone을 연결하고 기기에서 Mac을 신뢰한다. Xcode의 안내에 따라 Developer Mode를 활성화하고 실행 대상으로 선택한다.

자동 서명으로 인증서·프로비저닝 프로필을 관리할 수 있으므로 이번 준비에 인증서 파일이나 API용 `.p8` 키를 따로 만들 필요는 없다. [Apple 자동 서명 안내](https://developer.apple.com/tutorials/develop-in-swift/get-your-beta-app-ready-for-testing), [실기기 실행 안내](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices)

**마이크 권한은 Apple Developer 사이트의 별도 신청 항목이 아니다.** 앱의 `NSMicrophoneUsageDescription`과 실행 중 권한 요청을 다음 구현에서 추가한다. 현재 템플릿에는 측정용 마이크 권한이 아직 없다. [Apple 마이크 권한 안내](https://developer.apple.com/library/archive/documentation/Audio/Conceptual/AudioSessionProgrammingGuide/RequestingPermission/RequestingPermission.html)

## 5. Android / Google Play에서 할 일

Android Studio와 SDK는 이 Mac에 이미 설치되어 있다. 앱을 로컬에서 개발·테스트하는 단계에서는 Play Console 앱 등록을 기다릴 필요가 없다.

- [ ] Android Studio에서 `android/`를 열고 Gradle Sync를 완료한다.
- [ ] Gradle JDK는 Android Studio에 포함된 JBR을 사용한다. 이번 검증에서는 JBR 21과 설치된 Android SDK 36 / Build Tools 36.0.0을 사용했다.
- [ ] 테스트용 Android 기기의 개발자 옵션·USB 디버깅을 활성화하고 연결을 승인한다.
- [ ] Google Play 출시를 계획한다면 배포할 계정으로 Play Console 가입 및 콘솔에 표시되는 본인·기기 확인을 완료한다. 일반 등록비는 US$25 일회성이다. [Play Console 가입 안내](https://support.google.com/googleplay/android-developer/answer/6112435?hl=en)
- [ ] Play Console → Create app에서 이름 `바로 소음계`, 기본 언어 한국어, 유형 App을 선택한다. 현재 무료 도구 기획을 유지하면 Free로 만들고 필요한 선언에 동의한다. [Google Play 앱 생성 안내](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)

업로드할 AAB의 applicationId는 확정한 `com.izowooi.dm`과 같아야 한다. 앱 초안을 만드는 단계와 빌드를 등록하는 단계는 구분한다. Play App Signing과 upload key는 첫 배포 빌드를 준비할 때 설정하면 된다. [Google Play 서명·앱 번들 설정](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en)

2023-11-13 이후 생성한 개인 개발자 계정은 프로덕션 접근 신청 전에 **최소 12명이 연속 14일 참여하는 비공개 테스트**가 필요하다. 빌드가 나온 뒤 진행하는 절차이므로 지금은 테스터 확보만 준비하면 된다. 테스트 완료 후 프로덕션 접근 신청·심사가 이어진다. [Google Play 개인 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)

마이크는 앱의 `RECORD_AUDIO` 선언과 실행 중 권한 요청으로 처리한다. 다음 구현에 포함하며, 현재의 화면 내 측정 기획에는 백그라운드 마이크 서비스가 필요하지 않다. [Android 마이크 권한 안내](https://developer.android.com/media/platform/mediarecorder#requesting_permission_to_record_audio)

## 6. Firebase는 선택 사항

**권장: 첫 버전은 Firebase 없이 진행한다.** 마이크 입력 처리, 보정 프로필 저장, 측정 통계와 CSV 내보내기는 기기 안에서 구현할 수 있다. 서버 생성, 데이터베이스 생성, 서비스 계정 키 발급은 이번 준비의 선행 조건이 아니다.

나중에 Crashlytics, Analytics, 계정 간 동기화 등을 채택하기로 했다면 다음 순서로 준비한다.

1. Firebase 프로젝트 하나를 만들고 Android 앱과 Apple 앱을 각각 등록한다. 프로젝트 이름은 예를 들어 `decibel-meter`로 정하되 고유 Project ID는 콘솔에서 확정한다.
2. Android 패키지명과 Apple Bundle ID에 실제 앱의 `com.izowooi.dm`을 입력한다. Analytics는 선택 기능이므로 수집을 원하지 않으면 활성화하지 않는다.
3. Android 설정 파일은 `android/app/google-services.json`, iOS 설정 파일은 `ios/dm/GoogleService-Info.plist`에 로컬로 둔다. iOS는 앱 타깃에 포함되도록 연결해야 한다.
4. SDK 연결·초기화는 후속 구현에 포함한다. 파일을 다운로드하거나 배치하는 것만으로 연동이 완료되지는 않는다.

Firebase는 등록한 앱의 패키지명/Bundle ID를 나중에 바꿀 수 없으므로 앱 식별자를 먼저 확정한다. 이 저장소에서는 설정 파일을 Git에서 제외한다. [Firebase Android 설정](https://firebase.google.com/docs/android/setup), [Firebase Apple 설정](https://firebase.google.com/docs/ios/setup)

## 7. 출시 전에 준비할 정보

- 앱 이름, 문의 이메일, 공개된 지원 페이지와 개인정보처리방침 URL을 준비한다. Firebase를 사용하지 않아도 개인정보처리방침은 필요하다. Apple은 모든 앱에 해당 URL을 요구하며, Google Play는 데이터 미수집 앱도 해당 정책과 Data safety 작성 대상이라고 안내한다. 내부 테스트 전용 트랙에는 Data safety 예외가 있다. [Apple 개인정보 설정](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy), [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- App Privacy / Data safety는 최종 앱과 포함된 SDK를 확인한 후 작성한다. 기기 내 측정만 하는 설계에 맞추되, 진단·분석 SDK를 추가했다면 그 SDK가 전송하는 데이터도 반영한다.
- 앱 아이콘·스크린샷·설명·연령 등급·광고 여부는 출시 준비 단계에서 작성한다. 지금은 가칭과 무료·광고 없음이라는 초기 방향만 정해도 된다.
- 실제 dB SPL 추정 정확도 검증을 하려면 참조 소음계와 측정 조건을 마련한다. 참조 장비가 없어도 미보정 dBFS 기능 개발은 진행할 수 있다. 원음 저장·전송 없이 입력을 처리한다는 명세의 원칙을 유지한다.

## 8. 다음 구현에서 정리할 항목

| 항목 | 현재 템플릿 | 권장 출발점 — 아직 적용하지 않음 |
| --- | --- | --- |
| iOS 최소 버전 | 27.0 | 명세에 맞춰 iOS 17.0 이상 |
| iOS 지원 기기 | iPhone + iPad | iPhone 우선, iPad 대응 범위 확인 |
| Android 최소 버전 | API 36 / Android 16 | Android 8.0 / API 26 이상을 우선 검토 |
| Android compileSdk / targetSdk | 36 / 36 | 최소 지원 버전과 별도로 관리, 출시 시 정책 확인 |
| 측정 구현 | 없음 | AVAudioEngine / AudioRecord 기반 구현 |
| 계정·서버·광고 | 없음 | 첫 버전은 로컬·무료·광고 없음 |

현재 템플릿을 그대로 실기기에 설치할 때는 위의 **현재 최소 버전** 조건을 충족해야 한다. 낮은 OS 지원은 다음 구현에서 실제 API·라이브러리와 함께 조정하고 검증한다.

명세의 `dBFS`와 `dB SPL` 구분, 유효한 보정이 없는 상태의 안내, 에너지 평균 계산, 원음 미저장 원칙은 두 플랫폼에 공통 적용할 권장 기준이다. Android 입력 처리에서는 기기별 오디오 처리와 입력 경로 차이도 검증 대상으로 삼는다.

## 9. 준비가 끝나면 알려줄 내용

아래 값과 원하는 기능·화면 방향을 다음 요청에 적으면 된다. 계정 비밀번호, 인증서, private key는 전달할 필요가 없다.

```text
앱 표시 이름: 바로 소음계 / 변경 이름
iOS Bundle ID: com.izowooi.dm / 변경 값
Android applicationId: com.izowooi.dm / 변경 값
Apple: 로컬 테스트만 / 유료 멤버십 활성
Apple Team: 현재 프로젝트 설정 유지 / 변경할 Team ID
App Store Connect 앱: 생성 완료 / 나중에 생성
Google Play: 계정·앱 생성 완료 / 나중에 준비
Firebase: 사용 안 함 / 사용할 서비스
테스트 기기: iPhone 모델·OS, Android 모델·OS
지원 OS: 권장안 / 원하는 범위
지원·개인정보처리방침 URL: 준비된 URL / 추후 준비
```

후속 작업 프롬프트 예시:

```text
/goal
docs/setup.md와 docs/spec.md를 출발점으로 Android·iOS 데시벨 측정기 MVP를 완성해줘.
설정 완료 정보는 다음과 같아: [위 준비 결과를 붙여넣기].

ios/는 SwiftUI, android/는 Kotlin·Jetpack Compose 네이티브 앱으로 유지해줘.
지원 OS는 iOS 17 이상, Android 8.0(API 26) 이상을 기준으로 검증해줘.
첫 버전은 무료·광고 없음·로그인 없음·Firebase 없음으로 만들어줘.
현재 수치, 약 100ms 갱신, 최근 60초 그래프, 시작/정지, 측정 통계,
수동 보정 프로필, 종료 요약, CSV 공유를 구현해줘.
dBFS와 보정 기반 dB SPL 추정치를 구분하고 원음은 저장·전송하지 마.
마이크 권한 거부, 입력 변경, 오디오 중단, 백그라운드 전환을 처리해줘.
미정 사항은 합리적으로 정하고 명세 개선 이유를 기록해줘.
양쪽 계산 로직 테스트와 빌드를 완료하고, 실기기 검증이 남은 항목은 구분해줘.
완료 후 모노레포의 현재 브랜치에 커밋·푸시해줘.
```

Firebase 사용 여부·최소 OS·화면 요구가 달라지면 위 예시를 수정해서 요청하면 된다.

## 10. 이번 준비 작업의 검증

폴더 이동 직후 기존 소스·프로젝트 파일 49개가 바뀌지 않았음을 해시로 확인했다. Android 첫 빌드에서 기존 Core 1.19.0 / Lifecycle 2.11.0의 SDK 37·AGP 9.1 요구를 확인하여, 현재 SDK 36·AGP 9.0.1에서 사용할 수 있는 Core 1.17.0 / Lifecycle 2.10.0으로 맞췄다. 새 라이브러리를 추가하지 않았다. 커밋 검사에서 발견한 Swift 템플릿의 공백 한 줄을 정리하고, Gradle 실행 파일의 플랫폼별 줄바꿈 규칙을 `.gitattributes`에 명시했다.

Android Debug APK 빌드와 iOS Simulator 빌드가 모두 성공했다. Xcode 프로젝트 문법과 Git 제외 규칙도 확인했다. 빌드 명령은 다음과 같다. Android는 터미널의 기본 Java 설정 대신 설치된 Android Studio JBR을 명령 단위로 지정한다.

```sh
# cwd: decibel-meter/android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ./gradlew --no-daemon :app:assembleDebug
```

```sh
# cwd: decibel-meter
xcodebuild -project ios/dm.xcodeproj -scheme dm -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/DerivedData CODE_SIGNING_ALLOWED=NO build
```

빌드는 기본 템플릿의 경로·의존성 확인용이며, 실기기 서명·마이크 측정·음압 정확도 검증은 후속 작업 대상이다. IDE 개인 설정, build 산출물, Firebase 설정, 서명 키는 프로젝트의 `.gitignore`에서 제외한다.
