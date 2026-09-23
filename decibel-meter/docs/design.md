# 소리결 · Sori 디자인과 이미지

## 제품 화면

- 일반 사용자가 측정 버튼만 누르면 이해할 수 있게 한다. 주 화면은 이름·상태·큰 정수 dB·최소/평균/최대·시작/정지로 구성한다.
- 기본 색은 따뜻한 밝은 배경, 짙은 청록색 텍스트, 옅은 민트 액션이다. Dark Mode는 짙은 녹색 배경과 밝은 민트로 전환한다.
- iOS: SwiftUI, SF Symbols, 시스템 Form/Picker/Toggle/share sheet. Android: Compose Material 3의 Button/Chip/Switch/ModalBottomSheet와 시스템 공유.
- 고정된 하단 주 액션을 유지하고, 작은 화면이나 큰 글자에서는 본문을 스크롤한다. 시작 준비 중에는 취소할 수 있다.
- 게이지·그래프에는 접근성 설명을 제공하고, 경고 상태는 색만으로 구분하지 않는다.
- 기본 화면에는 '휴대폰으로 추정한 값이에요'를 짧게 안내한다. 미보정·상대 입력·RMS 같은 전문 용어는 첫 화면에 표시하지 않는다.
- 그래프·원본 dBFS·입력 장치·보정·필터 선택은 기본으로 접힌 고급 설정에서만 보여준다. 요약도 정수 dB 통계부터 보여주며 같은 원칙으로 정보를 접는다.
- 환산 모델의 가정과 저장·공유 일관성은 [estimation.md](estimation.md)에 기록한다.

## 생성 이미지

모두 내장 ImageGen 도구로 생성했다. 프로젝트 안에 실제 파일을 복사했고, 플랫폼 규격에 필요한 크기 변경만 수행했다.

| 파일 | 용도 |
| --- | --- |
| `assets/sori-icon-master.png` | 생성된 아이콘 원본 |
| `ios/dm/Assets.xcassets/AppIcon.appiconset/AppIcon.png` | iOS 1024px 앱 아이콘 |
| `android/app/src/main/res/drawable-nodpi/sori_icon.png` | Android adaptive icon foreground |
| `android/app/src/main/res/drawable/ic_launcher_monochrome.xml` | Android 시스템 테마용 단색 코드 자산 |
| `assets/store/play-icon-512.png` | Play Console 512px 아이콘 |
| `assets/sori-feature-master.png` | 생성된 feature graphic 원본 |
| `assets/store/play-feature-1024x500.png` | Play Console feature graphic |

## 아이콘 생성 프롬프트

```text
Use case: logo-brand. Create an original premium app icon for Sori, a beautifully simple real-time decibel sound level meter for iOS and Android. Deliver a single square 1024x1024 bitmap, full bleed opaque background, no rounded outer corners and no device mockup. Flat minimal contemporary design. Solid very dark petrol teal background #102E2C. Center a bold distinctive ivory mint sound-wave mark: five softly rounded vertical pill-shaped strokes, carefully balanced heights forming a smooth rising and falling wave, the center tallest and two outer strokes shortest; an elegant compact symbol that reads clearly at very small app-icon sizes. The central symbol fills approximately the middle 56% of the canvas with generous equal safe space on every side so Android adaptive masks cannot crop it. Warm light mint #D4F5CC mark, restrained single smaller coral #EE986C accent at the upper right of the waveform if harmonious. Perfectly crisp, clean graphic edges, refined optical balance. No text, no letters, no microphone drawing, no chart grid, no gradients, no shadows, no 3D effects, no extra objects, no watermark. This is final shipping icon artwork.
```

## Feature graphic 생성 프롬프트

참조 이미지는 위 아이콘 원본이다.

```text
Use case: ads-marketing. Create a new final Google Play feature graphic for the Sori sound meter app, landscape 1024 x 500, approximately 2.048:1 aspect ratio. Reference image role: the existing Sori app icon, preserve its distinctive five mint pill soundwave bars and small coral circle as the brand mark. Design a refined, very flat, modern editorial banner on warm off-white #F6F6F1. Left side: large highly legible dark petrol wordmark with the exact text 'Sori', below it smaller exact text 'Sound, in focus.' Right side: a large, beautifully balanced version of the reference icon with its original dark petrol tile, mint wave and coral dot. Generous negative space, impeccable typography and simple alignment, calm precision, native mobile utility brand. All essential content within the middle 85% safe area. No phone mockups, no extra text, no numeric sound readings, no medical or accuracy claims, no gradients, no lighting effects, no watermarks. Opaque full bleed image suitable as a store feature graphic.
```

실제 앱 스크린샷은 ImageGen으로 만들지 않는다. 네이티브 앱을 simulator/emulator에서 실행해 캡처한다. 예시 신호를 쓴 화면에는 예시 데이터임을 표시한다.
