# 소리결 · Sori 개인정보처리방침 초안

시행일: [게시일 입력]
운영자: [실제 운영자명 입력]
문의: [실제 문의 이메일 입력]

게시 전에 위 항목을 실제 값으로 채우고 공개 URL을 `docs/user-setup.md`의 스토어 설정에 입력한다. 아래 내용은 현재 앱과 포함된 SDK의 동작에 맞춘 초안이다.

## 1. 마이크와 측정

소리결은 사용자가 측정을 시작하고 마이크 사용을 허용하면 기기에서 입력을 처리해 소리 레벨을 계산합니다. 마이크 원음을 파일로 녹음하거나 서버에 전송하지 않습니다. 앱이 백그라운드로 전환되거나 측정을 종료하면 마이크 사용을 중단합니다.

보정 전에는 디지털 입력 레벨(dBFS)을 표시합니다. 기준 계측기를 사용한 보정 후의 음압 수치는 추정치입니다. 앱은 의료기기나 공인 계측기가 아닙니다.

## 2. 기기에 보관하는 정보

다음 정보는 앱의 로컬 저장 영역에 보관합니다.

- 사용자가 만든 보정 프로필: 프로필 이름, 참조 수치, 메모, 날짜, 기기·마이크 입력 경로, 샘플레이트, 가중 방식 및 세션 설정.
- 마지막 완료 세션: 측정 시각·시간, 수치 통계·그래프, 입력 조건, 보정 여부 및 CSV 내보내기에 필요한 숫자 데이터.
- 가중 방식, 화면 켜두기, 진단 공유 등 앱 설정.

새로운 완료 세션은 이전 마지막 세션을 대체합니다. 앱에서 마지막 세션과 보정 프로필을 삭제할 수 있습니다. 로컬 측정·프로필 파일은 OS 클라우드 백업 대상에서 제외하도록 구성합니다. 앱을 삭제하면 해당 앱의 기기 내 데이터도 삭제됩니다.

## 3. 사용자가 선택하는 CSV 공유

사용자가 CSV 공유를 누르고 공유 대상을 선택하면 숫자 데이터와 입력 조건을 담은 파일이 선택한 앱으로 전달됩니다. 마이크 원음은 포함되지 않습니다. 선택한 서비스가 파일을 처리하는 방식은 해당 서비스의 개인정보처리방침을 따릅니다.

CSV에는 사용자가 작성한 보정 이름·메모가 포함될 수 있으므로 공유 전에 내용을 확인할 수 있습니다.

## 4. 선택적 오류 진단

오류 진단 공유는 기본적으로 꺼져 있습니다. 사용자가 앱 설정에서 켜면 Google Firebase Crashlytics를 통해 앱 품질 개선을 위한 오류 진단을 처리합니다. 이 정보에는 충돌 스택, 앱 상태, 앱·OS·기기 정보와 설치 식별자 등 SDK 진단 정보가 포함될 수 있습니다.

소리결은 원음, 소리 레벨 수치, 보정 프로필 이름·메모를 Crashlytics의 custom key·log·user ID에 전달하지 않습니다. Firebase Analytics, 광고 SDK, 로그인 SDK는 포함하지 않습니다. 진단 SDK의 종속 모듈은 SDK 운영·성능 관련 메타데이터를 처리할 수 있습니다.

설정에서 진단 공유를 끌 수 있으며, 앱은 Crashlytics의 미전송 오류 보고서 삭제를 요청합니다. 이미 전송된 진단 자료는 앱의 로컬 삭제와 별개로 Firebase의 처리·보관 정책을 따릅니다. 진단 정보 처리에 관한 문의는 위 운영자 이메일로 연락해주세요.

[Firebase 개인정보 및 보안](https://firebase.google.com/support/privacy), [Firebase Apple 데이터 공개 안내](https://firebase.google.com/docs/ios/app-store-data-collection), [Firebase Android 데이터 공개 안내](https://firebase.google.com/docs/android/play-data-disclosure).

## 5. 계정·광고·위치

소리결은 계정 생성을 요구하지 않으며 광고를 표시하지 않습니다. 앱은 위치, 연락처, 사진 라이브러리를 측정 기능에 사용하지 않습니다.

## 6. 변경과 문의

기능이나 데이터 처리 방식이 바뀌면 이 방침과 스토어 공개 정보를 업데이트합니다. 문의는 위 운영자 연락처를 이용해주세요.

---

# Sori Privacy Policy — English draft

Effective date: [insert publication date]
Operator: [insert operator name]
Contact: [insert support email]

## Microphone and measurement

When you start a measurement and grant microphone access, Sori processes audio on your device to calculate sound levels. Microphone audio is never saved as a recording or sent to a server. Measurement stops and microphone access is released when you stop or the app moves to the background.

Uncalibrated readings are digital input levels (dBFS), not physical sound pressure. Reference-calibrated readings are estimates. Sori is not a medical device or a certified measuring instrument.

## On-device information

Sori stores calibration profiles, your last completed measurement, and app preferences locally. Profiles include your chosen name, reference reading, notes, date and input settings. A completed session includes numeric readings, summary statistics, timing, input conditions and calibration information.

A new completed session replaces the previous one. You can delete the last session and calibration profiles in the app. Measurement and profile files are configured to be excluded from OS cloud backups. Removing the app removes its local app data.

## Sharing

When you choose to share a CSV, the selected app receives a file containing numeric measurements and input conditions. It does not contain audio. Profile names and notes may be included. The receiving service processes the file under its own privacy policy.

## Optional diagnostics

Crash diagnostics are off by default. If you enable them, Google Firebase Crashlytics processes diagnostic information to help improve the app, including crash stacks, app state, app/device/OS information and installation identifiers. Sori does not attach audio, sound levels or calibration names/notes to Crashlytics reports. Firebase Analytics, advertising and sign-in SDKs are not included. Diagnostic SDK dependencies may process operational and performance metadata.

You can turn diagnostics off. The app then requests deletion of unsent Crashlytics reports. Information already transmitted is handled under Firebase’s processing and retention policies, independently of deletion of local app data. Contact the operator above with privacy requests.

[Firebase privacy and security](https://firebase.google.com/support/privacy).

## Accounts and permissions

Sori does not require an account or display ads. The measurement feature does not use your location, contacts or photo library.

We update this policy and store disclosures when our data practices change. Contact us using the address above.
