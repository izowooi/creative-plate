# 소리결 · Sori 구현 계획

목표: com.izowooi.dm Android·iOS 무료 소음계. SwiftUI와 Jetpack Compose로 플랫폼별 네이티브 UI를 구현한다. 사용자 원문의 docs/spec.md와 추가된 10개 언어 요구를 유지한다.

## 완료 기준

- [x] 경쟁 앱 공개 화면/기능 및 접근 가능한 APK의 SDK·라이브러리 조사. 확인한 사실과 추정을 구분.
- [x] SwiftUI·Compose 측정 화면: 큰 수치, 60초 그래프, 100 ms RMS, 에너지 평균과 최소/최대, 시작/정지.
- [x] 실제 마이크 수집. 권한 거부·중단·백그라운드·입력 경로 변경·중복 시작/정지 처리.
- [x] dBFS / 보정 추정 음압을 명확하게 구분. 원음 미저장. 보정 프로필·조건 무효화.
- [x] 검증한 A-weighting과 Flat 입력 옵션. 앱이 수행하는 디지털 필터 검증과 실제 기기 음압 정확도 검증 구분.
- [x] 종료 요약·CSV 공유. 그래프·세션 메모리 상한.
- [x] Firebase Core·Crashlytics 연결. 진단은 사용자가 켜는 옵션, 오디오·측정값 전송 없음.
- [x] 한국어·영어·일본어·중국어 간체·번체·독일어·프랑스어·스페인어·포르투갈어·이탈리아어.
- [x] ImageGen 앱 아이콘과 실제 앱 스크린샷. Light/Dark·작은 화면·큰 글자 확인.
- [x] 두 플랫폼 자동 테스트, Debug/Release 빌드, emulator/simulator 상호작용 검증.
- [x] 사용자 설정 체크리스트, 스토어 문구, 개인정보처리방침 초안, 수동 실기기 검증표.
- [x] 커밋 대상·민감 파일 제외 검토. 모노레포 main 커밋·푸시 결과는 최종 Git 상태로 확인한다.

## 설계 결정

- 제품명: 소리결 · Sori. 한국어는 소리의 변화를, 영문은 짧고 발음하기 쉬운 이름을 사용한다. 스토어 이름 사용 가능 여부는 등록 시 확인한다.
- 기본 화면은 측정 하나에 집중한다. 보정·진단 설정과 완료한 세션 공유는 sheet로 제공한다. 로그인·광고·GPS·녹음·클라우드 측정 동기화는 추가하지 않는다.
- 기본값을 실제 음압처럼 보이게 하는 임의 offset은 넣지 않는다. 유효한 사용자 보정만 추정 dB SPL/dBA로 변환한다.
- iOS 17+, Android API 26+. compile/target SDK는 빌드와 배포 요건을 별도로 검증한다.
- 2026-09-22 현재 실제 Firebase 설정 파일 두 개의 앱 ID와 프로젝트 일치를 확인했고 플랫폼 위치에 복사했다. 설정 값은 출력하거나 커밋하지 않는다.
- iOS App ID/배포 서명은 사용자가 멤버십 갱신 반영 후 진행한다. 시뮬레이터와 코드 작업을 계속한다.

## 진행

- [x] 현재 코드·설정 및 사용자 spec 변경 확인.
- [x] Firebase 구성 파일 위치 정리 및 식별자 일치 확인.
- [x] 핵심 DSP·상태 모델 구현.
- [x] 네이티브 마이크·UI·Firebase 연결.
- [x] 테스트·디자인 검토·배포 자료 정리.

## 검증과 인계

- 구체적인 결과와 남은 실기기·참조 계측기 확인은 [verification.md](verification.md)에 기록한다.
- Apple App ID·출시 서명·운영자 연락처/공개 URL은 사용자가 [user-setup.md](user-setup.md)를 따라 완료한다.
- 앱스토어 출시 문구는 [store-listing.md](store-listing.md), 이미지 출처·프롬프트는 [design.md](design.md), 경쟁 앱 조사는 [research/competitors.md](research/competitors.md)에 있다.
