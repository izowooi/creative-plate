# 기본 dB 추정

일반 사용자는 보정 없이 측정을 시작하고 현재·최소·평균·최대 값을 dB로 본다. 화면은 '휴대폰으로 추정한 값이에요'라는 한 줄만 표시하고, 그래프·원본 dBFS·환산 기준·보정은 접힌 고급 설정에 둔다. 이 정책은 2026-09-23의 사용자 피드백으로 초기의 dBFS 중심 화면을 대체한다.

## 환산 기준

| 조건 | offset | 저장되는 basis |
| --- | --- | --- |
| 현재 입력과 일치하는 사용자 보정 | 참조값 − 원본 입력값 | `reference_calibration` |
| Android 내장 마이크, UNPROCESSED 입력 | 130 dB | `android_unprocessed_nominal_v1` |
| Android 내장 마이크, VOICE_RECOGNITION 입력 | 112.35 dB | `android_voice_nominal_v1` |
| iOS 및 그 외 입력 | 110 dB | `generic_estimate_v1` |

기본 추정은 `max(0, raw_dbfs + offset)`이며 디지털 무음(원본 계산 하한 −120 dBFS)은 0으로 표시한다. 기본 화면은 정수로 반올림하고 CSV에는 반올림 전 추정값과 원본값을 함께 남긴다. 평균은 dB 숫자의 산술평균이 아니라 기존의 샘플 에너지 평균을 환산한다.

Android nominal 값은 [Android CDD의 오디오 입력 기준](https://source.android.com/docs/compatibility/17/android-17-cdd)에서 유도했다. UNPROCESSED는 94 dB SPL의 1 kHz 입력이 −36 dBFS가 되는 기준이고, VOICE_RECOGNITION은 90 dB SPL이 약 −22.35 dBFS가 되는 권고 기준이다. 이는 각 실기기의 실측 교정을 대신하지 않는다. 실제 내장 마이크 경로와 선택된 입력 source가 확인되는 경우에만 이 모델을 적용한다.

iOS의 110 dB offset은 **제품의 공통 추정 가정**이다. Apple이 제공한 기종별 감도나 실측 교정값이 아니며, iPhone 15 Plus 등 특정 기종의 정확도를 검증한 값으로 설명하지 않는다. [Apple의 오디오 레벨 설명](https://developer.apple.com/documentation/avfaudio/avaudiorecorder/averagepower(forchannel:))도 dBFS를 디지털 full scale 기준으로 정의하므로 단위만 바꾸지 않고 환산 가정을 명시적으로 분리했다. 사용자가 같은 환경의 기준 소음계로 보정하면 이 기본 가정 대신 해당 프로필을 적용한다.

## 데이터와 고급 설정

- 오디오 처리·필터·원본 통계는 그대로 유지한다. 원음은 저장하지 않는다.
- 새 종료 세션에는 추정 모델의 offset과 basis를 함께 저장해 다시 열거나 공유해도 같은 수치를 사용한다. 이전 버전의 기록은 보존된 원본과 보정 정보로 기본 추정 모델을 선택한다.
- CSV는 `estimate_basis`, `offset_db`, `display_floor_db`, `calibrated`, `raw_unit`과 원본 `raw_dbfs`를 포함한다. 추정 결과와 원본 입력을 구분한다.
- 유효한 보정은 우선 적용하며 입력 조건이 바뀌면 이전 보정을 적용하지 않는다. 기본 추정으로 돌아가는 경우도 고급 설정에 표시한다.
- 추정 모델과 저장·표시 일관성을 자동 테스트한다. 실제 마이크의 음압 정확도 검증은 참조 계측기를 사용한 별도 작업이다.
