# 소리결 · Sori 검증 기록

검증일: 2026-09-23. 앱 ID는 두 플랫폼 모두 `com.izowooi.dm`이다. 아래 자동 검증은 디지털 계산과 소프트웨어 동작의 증거다. 실제 마이크의 음압 정확도나 계측 규격 인증을 의미하지 않는다.

## 자동 검증 결과

| 영역 | 확인한 내용 | 결과 |
| --- | --- | --- |
| Android 단위 테스트 | 8개: 진폭 절반, 에너지 평균·샘플 수, 무음/NaN/Infinity, clipping/부분 구간, A 응답, 입력 조건별 보정 무효화, 그래프/CSV 경계, CSV formula escaping | 통과 |
| iOS 단위 테스트 | 9개 정의 / A 응답의 3개 샘플레이트를 포함한 11개 경우. 계산·보정·안정도·JSON/CSV round-trip·버퍼 경계·초기 진단 기본값 | iOS 17.5 및 27.0에서 통과 |
| Android native UI | 실제 AudioRecord 입력, 중복 시작/종료, 백그라운드 마이크 해제와 비자동 재시작, 설정과 기본 진단 꺼짐, 수치 CSV 공유 | Android 15 emulator에서 4개 통과 |
| iOS native UI | 영어 측정/요약/설정, 한국어 보정 입력 제한, 실제 마이크 시작/종료·백그라운드 중단, 권한 거부 후 설정 이동 안내 | iOS 27.0에서 4개 통과 |
| 작은 iPhone / 이전 OS | iPhone SE 3세대, iOS 17.5의 계산 테스트와 측정·요약·설정 흐름 | 통과 |
| iPad | iPad Pro 13인치에서 한국어/영어 주요 화면과 실제 시스템 CSV share sheet | 통과 |
| 큰 글자 | Android 독일어 font scale 1.6 화면, iOS accessibility-extra-extra-large에서 주요 화면과 설정 스크롤 | 시각 확인 및 iOS UI 테스트 통과 |
| 다크 모드 | iOS·Android 한국어/영어 native 화면 | 캡처·확인 |
| Android Release | R8/resource shrinking, APK, AAB, lint, 실제 OS 권한 거부/복구 안내 | 빌드 통과, lint error 0 |
| Android 16KB | 최종 APK ZIP alignment 및 포함된 native ELF의 LOAD segment alignment | 16KB 정렬 확인 |
| iOS Release | 실제 iphoneos arm64 타깃의 서명 없는 archive, Firebase symbols build phase | 통과 |
| Firebase | 두 앱의 클라우드 등록 ID와 로컬 구성 일치, 런타임 초기화, iOS Crashlytics dSYM 서버 업로드 | 확인 |
| 로컬 검증 스크립트 | 82개 UI key × 10개 언어, native resources, 진단 기본값, privacy manifest, 라이선스·Git 제외 | 통과 |

Android lint의 남은 warning은 SDK/의존성 새 버전 알림, SharedPreferences KTX 사용 제안, API 33 이상에서만 쓰이는 localeConfig 안내다. 실제 config는 compile/target 36·min 26이며 그 범위에 맞춘 의존성을 유지한다. Xcode의 AppIntents metadata 미추출 안내는 AppIntents 기능을 포함하지 않아서 발생한다.

## 실행 환경과 명령

- Xcode 27.0, SwiftUI, iOS 17 최소 타깃.
- Android Studio JBR 21, Gradle 9.1.0, AGP 9.0.1, Compose compiler 2.2.10.
- Android emulator: API 35 / Android 15, arm64. 기존 API 37.1 image는 호스트에서 부팅 문제가 있어 검증 결과에 포함하지 않았다.
- iOS simulator: iPhone 18 Pro/Pro Max (27.0), iPhone SE 3세대 (17.5), iPad Pro 13인치 (27.0).

재현 명령은 [setup.md](setup.md)에 있다. `scripts/verify_project.py`는 로컬 Firebase 설정 파일을 요구하지만 키 값을 출력하지 않는다. 빌드·테스트 원본 보고서는 `android/app/build/reports/`, `android/app/build/outputs/androidTest-results/`, `ios/build/DerivedData/Logs/Test/`에 생성된다.

## 측정 정의

- PCM 샘플은 기기 내 메모리에서만 처리한다.
- 현재 레벨·최소/최대는 100ms RMS 구간이다. 전체 평균은 실제 제곱합 / 샘플 수에 대해 로그를 취한다.
- 디지털 0의 표시 하한은 −120 dBFS다. NaN/Infinity 입력은 유효 측정으로 처리하지 않는다.
- A 가중은 3개 second-order section으로 구현하고 1kHz에서 정규화한다. 44.1/48/96kHz 입력에서 31.5Hz~8kHz의 참조 응답과 비교했다. 8kHz 초과 대역과 실제 마이크 응답의 오차는 별도다.
- clipping 표시는 정규화된 원본 PCM의 절댓값 0.999 이상을 감지한다. 기기 내부 AGC나 마이크 자체 포화를 모두 감지할 수 있다는 뜻은 아니다.
- CSV는 1초 에너지 평균과 최종 부분 구간, 단위·보정·기기/경로·샘플레이트·가중·gain·profile 정보를 포함한다. `elapsed_seconds`는 구간 종료 시각이며, `raw_dbfs`는 보정 offset을 더하기 전의 선택한 가중 방식 입력 레벨이다.
- 60초 그래프는 최대 600개, 세션은 최대 4시간, 프로필은 최대 20개다.

## 개인정보·권한 확인

- Android Release merged manifest: RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, INTERNET, Firebase의 ACCESS_NETWORK_STATE 및 앱 내부 signature receiver permission. 광고 ID·위치·사진/외부 저장소 권한은 없다.
- 두 플랫폼에서 Firebase 기본 데이터 수집과 Crashlytics 자동 보고를 false로 시작한다. iOS는 `Config/Info.plist`에 명시하고 실제 빌드된 앱의 Info dictionary까지 회귀 테스트로 확인한다.
- Firebase Analytics·광고·인증·Firestore·Storage SDK를 기능에 연결하지 않았다. SwiftPM lockfile에 다른 Firebase 제품의 의존성 저장소가 보일 수 있으나, 실제 링크한 제품은 Core/Crashlytics와 필요한 하위 모듈이다.
- iOS archive에 앱과 Firebase 종속 모듈의 privacy manifest가 포함됨을 확인했다.
- Firebase 설정 파일과 APK/AAB/IPA·서명 키는 Git에서 제외한다.

## 스크린샷

`assets/store/screenshots/`에 28개 native PNG를 준비했다.

- Android: 한국어·영어 각 5장, 1080 × 1920.
- iPhone 6.9인치: 한국어·영어 각 6장, 1320 × 2868.
- iPad 13인치: 한국어·영어 각 3장, 2064 × 2752.

수치가 들어간 샷은 Debug의 명시적인 예시 데이터이며 화면과 파일명에 demo로 구분한다. Alpha가 모두 불투명함을 확인한 후 RGB로 저장했으며 화면 내용은 수정하지 않았다. 실제 장치 정확도를 홍보하는 증거로 사용하지 않는다.

[Apple 스크린샷 규격](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications), [Google Play 이미지 규격](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).

## 실기기·참조 계측기 검증 계획

아래는 계정 설정·실기기 서명이 준비된 뒤 실행할 항목이다. 자동 테스트로 완료했다고 간주하지 않는다.

| 항목 | 절차 | 기록할 내용 |
| --- | --- | --- |
| 기본 동작 | iPhone·Android 각각 권한 허용/거부, 10회 시작/정지, 화면 잠금/홈 전환 | 기종·OS, 오류/중복 입력 여부, 마이크 표시가 꺼지는지 |
| 오디오 중단 | 통화 또는 다른 녹음 앱을 실행하고 돌아온 뒤 다시 시작 | 자동 중단, 중단 안내, 명시적 재시작 여부 |
| 입력 변경 | 측정 중 이어폰/USB 마이크 연결·해제, 다시 측정 | 실제 입력 장치·샘플레이트·보정 무효화 여부 |
| 기준 보정 | 앱과 참조 계측기의 가중을 일치시키고 일정한 소리에서 프로필 생성 | 계측기 모델·교정 상태, 거리/각도, 참조 레벨, 환경, profile |
| 여러 레벨·주파수 | 한 지점 보정 뒤 조용함/중간/큰 소리 및 주파수별로 비교 | 앱·참조값 차이, clipping, 기기 노이즈 플로어, 측정 불가능 범위 |
| 장시간·배터리 | 30분 이상 및 필요하면 4시간 경계까지 실행 | 평균 UI 갱신, 메모리 증가, 배터리·발열, 종료 CSV 샘플 수 |
| 실제 배포 | 서명한 TestFlight/Play 내부 테스트 빌드 설치 | release 권한·저장·공유·업데이트·진단 opt-in |
| Firebase 첫 보고서 | 별도 테스트 빌드의 합성 오류를 사용해 콘솔 수신 확인 | 실제 보고서 수신과 symbolication. 원음·측정값 첨부 없음 |

자동 필터 테스트는 스마트폰 마이크의 물리적 음압 교정, IEC/ANSI 규격 적합성, 의료적 판단이나 법적 계측 유효성을 증명하지 않는다.

## 로컬 배포 산출물

- Android 미서명 Release APK: 약 1.75 MB. Release AAB: 약 3.77 MB. 정확한 크기·SHA-256은 [release-artifacts.json](research/release-artifacts.json)에 있다. 테스트용 debug key로 서명한 복사본에서 Release 실행·권한 거부 안내를 확인했다. 이 테스트 서명본을 출시하지 않는다.
- iOS: `ios/build/Sori.xcarchive`. iphoneos arm64의 서명 없는 archive다. 사용자 Team의 실제 배포 서명 후 App Store Connect에 업로드한다.
- 심볼 업로드는 실제 Firebase 서버의 성공 응답을 확인했다. 실제 충돌 보고서의 콘솔 수신은 별도 실기기/테스트 빌드 사전 점검으로 남겨두었다.
