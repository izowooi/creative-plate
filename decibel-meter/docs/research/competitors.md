# 경쟁 앱 및 기술 조사

확인: 2026-09-22~23. 목적은 측정의 가독성·반응성·입력 처리·보정 흐름을 비교하고, 필요한 기술을 소리결에 적용하는 것이다.

## 직접 확인한 화면과 기능

| 앱 | 확인 방법 | 관찰 | 소리결에 반영 |
| --- | --- | --- | --- |
| Decibel X | Edge에서 App Store 상세 페이지와 공개 스크린샷 확인 | 큰 수치, 측정 그래프, 현재/평균/최대, 보정 프로필, 밝은/어두운 테마. 주파수 분석·사진·건강 연동 등 추가 기능도 제공 | 측정 중심의 큰 수치, 실시간 그래프와 에너지 평균, 보정 프로필, 시스템 Light/Dark. 주 화면은 하나의 측정 흐름에 집중 |
| Sound Decibel Meter / Splend Apps | Edge에서 Google Play 상세 페이지와 스크린샷 확인 | 숫자·아날로그 게이지·통계·그래프를 한 화면에 배치. 개발자가 마이크 한계와 AGC 영향을 안내 | 수치·게이지·통계·그래프의 위계, 입력 한도 안내, 가능한 입력 처리 비활성화 및 실제 설정 기록 |
| NoiseCapture 1.3.1 | F-Droid 배포 APK 다운로드, DEX namespace와 ZIP 구성 직접 조사 | AudioRecord, MPAndroidChart, JTransforms, Commons Math, Jackson, SLF4J 흔적. 네이티브 `.so` 파일은 해당 APK에서 없음 | AudioRecord로 PCM 직접 수집, 표본 기반 RMS·에너지 평균, 원음 미저장. 검증 가능한 3개 SOS 디지털 필터를 양쪽 플랫폼에 구현 |
| NoiseCapture Client 2 | 공개 저장소의 `gradle/libs.versions.toml` 확인 | Kotlin Multiplatform/Compose, Material 3, KoalaPlot, Koin, Ktor 등의 선언 | 네이티브 Compose/Material 3의 타당성을 확인. 현재 앱에는 네트워크 동기화·지도·FFT가 없어 해당 기능용 dependency는 추가하지 않음 |

공식 페이지: [Decibel X](https://apps.apple.com/us/app/decibel-x-db-sound-level-meter/id448155923), [Splend Sound Decibel Meter](https://play.google.com/store/apps/details?id=com.splendapps.decibel&hl=en_US), [NoiseCapture F-Droid](https://f-droid.org/en/packages/org.noise_planet.noisecapture/), [NoiseCapture Client](https://github.com/Universite-Gustave-Eiffel/NoiseCaptureClient).

## APK 증거와 해석 범위

- 파일: `org.noise_planet.noisecapture_65.apk`, NoiseCapture 1.3.1, 7,101,466 bytes.
- 출처: `https://f-droid.org/repo/org.noise_planet.noisecapture_65.apk`.
- SHA-256: `f18b8602673740fdf38154239c1dc15045e87ca876cf98096eeb50bfcef262b5`.
- 상세 기계 판독 결과: [noisecapture-apk-audit.json](noisecapture-apk-audit.json).
- DEX namespace 존재는 해당 코드가 패키지에 포함된다는 증거다. 특정 화면의 런타임 호출 여부나 정확한 dependency version까지 증명하지 않는다.
- legacy NoiseCapture APK와 새로운 NoiseCapture Client 2의 현재 main branch는 서로 다른 조사 대상이다. 버전이나 기술 구성을 혼동하지 않는다.
- Decibel X·Splend의 비공개 소스나 내부 SDK는 확인하지 못했다. 공개 화면만으로 사용 SDK를 추정해 사실처럼 기록하지 않았다. 해당 상용 앱의 IPA는 확보하지 않았다.
- 조사 APK는 로컬 `.research/`에만 두며 Git에 포함하지 않는다. 배포 앱에는 타 앱의 바이너리·리소스·코드를 포함하지 않는다.

## 실제 채택한 SDK와 구현

| 영역 | iOS | Android | 이유 |
| --- | --- | --- | --- |
| UI | SwiftUI, SF Symbols, Canvas | Jetpack Compose, Material 3, Canvas | 플랫폼 기본 접근성·시스템 글자 크기·색상 모드·공유 흐름을 유지 |
| 입력 | AVAudioEngine / AVAudioSession `.measurement` | AudioRecord, UNPROCESSED 지원 시 사용, 아니면 VOICE_RECOGNITION | PCM·실제 샘플레이트·입력 경로를 제어하고 기록 |
| 신호 처리 | 동일 수학 정의의 Swift SOS/RMS | 동일 수학 정의의 Kotlin SOS/RMS | 한 기능에 필요한 작은 DSP를 테스트하며 유지. FFT·지도용 코드는 현재 범위 밖 |
| 품질 진단 | Firebase Core / Crashlytics 12.19.2 | Firebase BoM 34.19.0 / Crashlytics | 사용자 동의에 따른 오류 진단. 원음·측정값·메모는 SDK에 전달하지 않음 |
| 저장·내보내기 | Codable, Application Support, native share sheet | JSON, noBackupFilesDir, FileProvider/share sheet | 기기 안에 프로필·마지막 세션만 보관. 숫자 CSV를 명시적으로 공유 |

## 정확도 해석

NIOSH의 연구 및 앱 자료는 특정 기기와 참조 장비를 사용한 검증을 강조한다. 다른 앱의 정확도 주장이나 실험 결과를 소리결의 성능으로 옮기지 않는다. 소리결은 다음을 구분한다.

1. 디지털 계산 검증: 진폭 절반의 −6.0206 dB 변화, 샘플 수를 반영한 에너지 평균, A 가중 주파수 응답, 무음·clipping·보정 무효화.
2. 소프트웨어 동작 검증: 실제 오디오 API 연결, 권한·시작/종료·백그라운드·CSV 공유.
3. 실제 음압 검증: 기기 마이크와 참조 계측기를 이용한 후속 수동 검증. 기종 공통 sensitivity offset이나 공인 정확도는 제공하지 않는다.

[NIOSH 스마트폰 측정 연구](https://stacks.cdc.gov/view/cdc/203723).

## 플랫폼 가이드

큰 수치·명확한 단위·짧은 액션과 시스템 제어를 우선했다. 그래프는 데이터가 중심이며 별도 접근성 요약을 제공한다. 정보가 길어지거나 글자 크기가 커져도 스크롤할 수 있고 시작/정지는 하단에 유지한다.

[Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Apple Charts](https://developer.apple.com/design/human-interface-guidelines/charts), [Material 3 Layout](https://m3.material.io/foundations/layout/canonical-examples/overview).
