# 소리결 · Sori 개발·실행 안내

현재 앱은 `com.izowooi.dm`을 사용하는 SwiftUI iOS 앱과 Jetpack Compose Android 앱이다. 계정 소유자의 설정은 [user-setup.md](user-setup.md), 기능과 측정 원칙은 [spec.md](spec.md), 스토어 등록 자료는 [store-listing.md](store-listing.md)를 참조한다.

## 폴더

```text
decibel-meter/
├── docs/             # 명세, 설정, 조사, 검증, 스토어 자료
├── android/          # Android Studio에서 이 폴더 열기
├── ios/
│   └── dm.xcodeproj  # Xcode에서 이 프로젝트 열기
├── localization/     # 10개 언어의 공통 문구 원본
├── scripts/          # 문구 생성·검증 도구
├── assets/           # 생성 이미지와 스토어 자산
└── licenses/         # 외부 SDK 라이선스 고지
```

## Firebase 설정

제공된 두 앱 설정 파일의 앱 ID·프로젝트 일치를 확인하고 다음 위치에 배치했다.

- Android: `android/app/google-services.json`
- iOS: `ios/dm/GoogleService-Info.plist`

이 파일들은 Git에서 제외된다. 다른 Mac/checkout에서는 본인의 설정 파일을 같은 경로에 복사한다. 서비스 계정 private key는 필요하지 않다. Firebase Console에 실제로 등록된 두 앱 ID와 로컬 구성의 일치도 Firebase CLI로 확인했다.

Firebase Core와 Crashlytics를 사용하며 기본 데이터 수집과 오류 보고는 꺼져 있다. 사용자가 설정에서 진단 공유를 켜면 활성화된다. 원음·측정값·프로필 메모를 진단 보고서에 첨부하지 않는다.

## Android

Android Studio에서 `android/`를 연다. 현재 compile/target SDK는 36, 최소 버전은 API 26, Gradle 9.1.0 / AGP 9.0.1 / Compose compiler 2.2.10이다. Gradle JDK는 Android Studio 내장 JBR을 선택한다.

```sh
# cwd: decibel-meter/android
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ./gradlew --no-daemon :app:assembleDebug :app:testDebugUnitTest

# 연결된 emulator/device에서 UI·실제 AudioRecord 경로 검증
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ./gradlew --no-daemon :app:connectedDebugAndroidTest

# 출시용 최적화·lint·AAB
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' \
  ./gradlew --no-daemon :app:assembleRelease :app:bundleRelease :app:lintRelease
```

산출물:

- 개발 APK: `android/app/build/outputs/apk/debug/app-debug.apk`
- 미서명 Release APK: `android/app/build/outputs/apk/release/app-release-unsigned.apk`
- Release AAB: `android/app/build/outputs/bundle/release/app-release.aab`

출시에는 사용자 upload key로 서명해야 한다. 앱 ID에 debug 접미사를 추가하지 않아 Firebase 설정과 동일하게 유지한다. Debug 빌드는 screenshot fixture를 위해 `sori_demo=true` intent extra를 지원하며 화면에 예시 데이터라고 표시한다. Release에서는 비활성화된다.

## iOS

`ios/dm.xcodeproj`를 연다. 최소 iOS 17, Firebase Apple SDK 12.19.2를 Swift Package Manager로 고정한다. App ID·서명이 준비되기 전에는 simulator에서 실행할 수 있다.

```sh
# cwd: decibel-meter
xcodebuild -project ios/dm.xcodeproj -scheme dm -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build/DerivedData CODE_SIGNING_ALLOWED=NO build

# SIMULATOR_UDID를 xcrun simctl list devices의 실제 ID로 바꾼다.
xcodebuild -project ios/dm.xcodeproj -scheme dm -configuration Debug \
  -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' \
  -derivedDataPath ios/build/DerivedData -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO test

# 서명 없는 device archive 검증. App Store 제출용 서명은 별도다.
xcodebuild -project ios/dm.xcodeproj -scheme dm -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath ios/build/ReleaseDerivedData \
  -archivePath ios/build/Sori.xcarchive CODE_SIGNING_ALLOWED=NO archive
```

Crashlytics dSYM 업로드는 Release/iphoneos build phase에 연결되어 있다. User Script Sandboxing을 유지하고 필요한 입력 파일을 명시했다. `SORI_SOURCE_PACKAGES_DIR`은 기본적으로 `$(SDK_STAT_CACHE_DIR)/SourcePackages`를 사용한다. 별도의 `-clonedSourcePackagesDirPath`를 사용한다면 이 build setting도 같은 경로로 전달해야 한다.

Debug 빌드는 `--sori-demo` launch argument를 지원하며 예시 데이터라고 표시한다. 스크린샷을 위한 테스트 경로로, Release에는 포함하지 않는다.

## 번역 수정

`localization/messages.json`을 수정하고 아래 명령을 실행한다. 모든 언어에 같은 key가 있는지 검증한 뒤 Android XML·typed resource ID·iOS String Catalog와 InfoPlist 번역을 생성한다.

```sh
python3 scripts/generate_localizations.py
```

지원 언어: 한국어, 영어, 일본어, 중국어 간체·번체, 독일어, 프랑스어, 스페인어, 브라질 포르투갈어, 이탈리아어.

## 측정 데이터

- 100ms RMS 구간, 원시 PCM 저장 없음.
- 그래프 최대 600개 구간 / 최근 60초.
- CSV는 1초 에너지 평균으로 최대 4시간, 마지막 구간은 더 짧을 수 있음.
- 마지막 세션 하나와 최대 20개 보정 프로필을 로컬에 보관.
- iOS Application Support 폴더는 OS 백업 제외, Android는 noBackupFilesDir 사용.
- 세션·프로필을 지우는 기능은 앱 설정/요약에 있다.

## 검증 자료

[verification.md](verification.md)에 자동 검증 결과와 실기기에서 확인할 항목을 구분해 기록한다. 참조 계측기 없는 simulator/emulator 테스트를 물리적 음압 정확도 검증으로 해석하지 않는다.
