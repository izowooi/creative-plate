# 소리결 · Sori 스토어 등록 자료

Bundle ID / applicationId: `com.izowooi.dm`. 가격: 무료. 광고·구독·앱 내 구입·로그인 없음.

이 문서는 등록용 초안이다. 앱 이름의 실제 사용 가능 여부, 운영자 연락처와 공개 URL은 계정 소유자가 확정한다. 앱 기능과 검증 범위에 맞춰 작성했으며 공인 계측 정확도나 청력 보호 효과를 주장하지 않는다.

## 한국어

- 앱 이름: **소리결 - 소음계**
- App Store 부제: **소리의 변화를 한눈에**
- Google Play 짧은 설명: **측정 한 번으로 현재·최소·평균·최대 데시벨을 쉽게. 원음 저장 없이 무료로.**
- App Store 키워드 초안: `소음계,데시벨,소리,측정,마이크,보정,그래프,사운드,소음측정`
- 카테고리 후보: App Store 유틸리티 / Google Play 도구.

### 상세 설명

소리의 변화를 한눈에, 소리결.

측정을 누르면 내 주변의 소리 크기를 큰 dB 숫자로 알려드려요. 어려운 설정 없이 최소·평균·최대 데시벨도 한눈에 확인하세요.

• 현재·최소·평균·최대 데시벨 추정치
• 측정 버튼 하나로 바로 시작하는 간단한 화면
• 고급 설정 안의 그래프·원본 입력·가중 선택
• 원할 때 사용하는 기준 소음계 보정
• 측정 결과 요약과 공유
• 밝은 화면과 어두운 화면, 10개 언어 지원
• 광고와 구독 없이 무료

원음은 저장하거나 전송하지 않습니다. 측정은 기기 안에서 처리되며 보정 프로필과 마지막 측정 결과가 기기에 보관됩니다. 측정은 앱을 사용하는 동안만 진행하며 백그라운드로 전환하면 마이크를 해제합니다.

측정값은 휴대폰으로 계산한 대략적인 추정치예요. 기본 추정 방식으로 바로 사용할 수 있으며, 기준 소음계가 있다면 고급 설정에서 보정할 수 있어요. 원본 입력(dBFS)과 환산 기준도 고급 설정에서 확인할 수 있습니다.

휴대폰 마이크의 특성과 입력 한계에 따라 결과가 달라질 수 있습니다. 공인 소음계, 의료기기 또는 법적 측정을 위한 도구를 대체하지 않습니다.

선택적으로 오류 진단 공유를 켤 수 있습니다. 이 경우 Firebase Crashlytics에 오류·앱/기기 정보·설치 식별자 등 진단 정보가 전달되며 원음·측정값·보정 메모는 포함하지 않습니다.

### 버전 1.0 출시 노트

첫 출시입니다. 간단한 dB 측정 화면과 최소·평균·최대, 결과 공유를 제공합니다. 그래프와 보정은 고급 설정에서 사용할 수 있어요.

## English

- Name: **Sori - Sound Level Meter**
- Subtitle: **Sound, in focus.**
- Google Play short description: **Tap to see current, minimum, average and maximum decibels. No audio saved.**
- Keywords draft: `sound,meter,decibel,noise,level,microphone,calibration,graph,measurement`

### Description

A little clarity in the noise.

Tap Measure to see the sound around you in large, easy-to-read dB numbers. Minimum, average and maximum readings are right there, with no setup needed.

• Readings refreshed about every 100 ms
• Simple current, minimum, average and maximum dB estimates
• Graphs, raw input and weighting controls tucked inside Advanced
• Optional calibration using a reference sound level meter
• Session summaries and CSV sharing
• Light and dark appearance
• Ten interface languages
• Free, with no ads, subscriptions or account

Audio is processed on your device and is never saved or uploaded. Calibration profiles and your last completed session stay on the device. Measurement stops and the microphone is released when the app moves to the background.

Readings are approximate phone-based estimates. Start with the default estimate, or use an optional reference calibration in Advanced. Original digital input levels (dBFS) and the conversion method are also available there.

Results depend on your phone’s microphone and its limits. Sori is not a certified sound level meter or a medical device and is not intended for legal measurements or hearing assessments.

Optional crash diagnostics use Firebase Crashlytics. Diagnostic reports may include app/device information and an installation identifier, but never audio, sound levels or calibration notes.

### What’s new

Introducing Sori: simple dB estimates, minimum, average and maximum readings, and result sharing. Open Advanced for graphs and optional calibration.

## 추가 언어의 제목·짧은 설명

| 언어 | 제목 | Google Play 짧은 설명 |
| --- | --- | --- |
| 日本語 | Sori - 騒音計 | タップするだけで周りの音をdBで推定。最小・平均・最大を表示。音声保存なし。 |
| 简体中文 | Sori 声级计 | 一键估算周围的分贝，轻松查看最小、平均和最大值。不保存音频。 |
| 繁體中文 | Sori 聲級計 | 一鍵估算周圍的分貝，輕鬆查看最小、平均和最大值。不儲存音訊。 |
| Deutsch | Sori - Schallpegelmesser | Ein Tipp: dB-Schätzung, Minimum, Durchschnitt und Maximum. Ohne Audioaufnahme. |
| Français | Sori - Sonomètre | Estimez les dB : minimum, moyenne et maximum. Aucun son enregistré. |
| Español | Sori - Sonómetro | Estima los dB con un toque: mínimo, promedio y máximo. Sin guardar audio. |
| Português (Brasil) | Sori - Medidor de Som | Estime os dB com um toque: mínimo, média e máximo. Sem salvar áudio. |
| Italiano | Sori - Fonometro | Stima i dB con un tocco: minimo, media e massimo. Nessun audio salvato. |

## 심사 메모 / Review notes

- 로그인과 서버 계정이 필요하지 않다. Start measuring을 누른 후 마이크 권한을 허용하면 측정할 수 있다.
- 권한을 거부해도 앱 설정·설명은 볼 수 있고, 시스템 설정으로 이동해 권한을 변경할 수 있다.
- 기본 화면은 dB 추정치이며 짧은 안내를 표시한다. 원본 dBFS·환산 기준·선택적 보정은 고급 설정에 있다. 기본 추정 모델을 실측 기종별 교정으로 주장하지 않는다. [환산 기준](estimation.md)을 참조한다.
- 보정은 측정 중 3초 이상 안정된 입력과 동일 가중 방식의 참조 계측기를 요구한다. 프로필 저장 후 다음 세션에 적용된다.
- 백그라운드 오디오 녹음이나 원음 파일 저장을 수행하지 않는다.
- 보정값·측정 기록·CSV 공유는 무료다.
- 진단 공유는 기본 꺼짐이다. 설정에서 선택할 수 있으며 측정과 독립적으로 동작한다.

## 데이터 공개 작성 기준

최종 업로드 바이너리의 SDK 목록과 Xcode Privacy Report를 확인한 뒤 입력한다. Firebase를 포함하므로 앱 전체를 일괄적으로 ‘수집하는 데이터 없음’으로 표시하지 않는다.

| 데이터 | 앱 동작 | 작성 시 확인 |
| --- | --- | --- |
| 마이크 원음 | 기기 내 임시 처리, 저장·서버 전송 없음 | 마이크 권한 사용 목적과 서버 수집 여부를 구분 |
| 측정 수치·보정 프로필 | 기기에 저장, 사용자가 CSV를 공유할 때만 선택한 앱으로 전달 | 자동 서버 수집 없음. 공유 흐름을 설명 |
| 충돌·진단 정보 | 사용자 진단 공유 선택 시 Crashlytics 이용 | Crash data / Diagnostics와 SDK의 기기·설치 식별자 처리 반영 |
| SDK 부수 메타데이터 | Firebase Core의 종속 SDK에 따라 앱·OS·SDK 상태 정보 처리 가능 | FirebaseInstallations, GoogleDataTransport 등의 실제 manifest와 공개 안내 확인 |
| 로그인·광고·위치 | 관련 기능·SDK 미포함 | 해당 수집 기능 없음 |

[Firebase Apple 데이터 공개 안내](https://firebase.google.com/docs/ios/app-store-data-collection), [Firebase Android 데이터 공개 안내](https://firebase.google.com/docs/android/play-data-disclosure).

## 파일

- iOS 원본 앱 아이콘: `ios/dm/Assets.xcassets/AppIcon.appiconset/AppIcon.png` — 1024 × 1024.
- Google Play 아이콘: `assets/store/play-icon-512.png` — 512 × 512.
- Google Play feature graphic: `assets/store/play-feature-1024x500.png` — 1024 × 500.
- 기기 화면 캡처는 `assets/store/screenshots/`에 저장한다. 예시 수치 화면은 파일명과 화면에 demo/예시 데이터로 구분한다. 이 수치를 실제 계측 정확도의 증거로 사용하지 않는다.
- 개인정보처리방침 초안: `docs/privacy-policy.md`. 운영자명·문의 주소·공개 URL을 채운 뒤 게시한다.

스크린샷·설명에 ‘공인’, ‘정확도 보장’, ‘NIOSH 인증’, ‘청력 보호 진단’, ‘안전한 노출 시간’을 추가하지 않는다. 앱이 구현하거나 검증하지 않은 기능을 스토어 문구에 넣지 않는다.
