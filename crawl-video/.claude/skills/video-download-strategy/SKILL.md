---
name: video-download-strategy
description: "site-analyzer의 분석 결과를 바탕으로 Chrome Extension Manifest V3 다운로드 전략을 결정하는 스킬. video-strategy-analyst 에이전트가 사용한다. HLS/DASH/직접URL/blob URL별 구현 전략, Manifest V3 권한 매핑, 인증 처리, DRM 판별을 포함한다. 영상 다운로드 전략 수립이나 스트리밍 프로토콜 분석이 필요할 때 반드시 이 스킬을 사용할 것."
---

# Video Download Strategy

site-analyzer 분석 결과를 Chrome Extension Manifest V3 구현 전략으로 변환하는 가이드.

## 전략 결정 트리

### 1단계: DRM 체크 (최우선)

`drm_detected: true`이면 즉시 `feasible: false`, `abort_reason: "DRM 보호 콘텐츠"` 반환.

Widevine/FairPlay/PlayReady는 Chrome의 Content Decryption Module(CDM)에 의해 보호되며, Extension이 접근할 수 있는 계층이 아니다.

### 2단계: 영상 타입별 전략

#### 직접 MP4/WebM URL

- **인증 없음:** content_script에서 `<a href="{url}" download>` 동적 생성 후 클릭
- **쿠키 인증:** background SW에서 `fetch(url, {credentials: 'include'})` 후 `chrome.downloads.download()`
- **Bearer 토큰:** background SW에서 `fetch(url, {headers: {Authorization: token}})` — 토큰은 `chrome.cookies.getAll()`로 런타임 획득

#### HLS (m3u8)

1. background SW에서 m3u8 플레이리스트 fetch
2. `#EXTINF` 이후 라인에서 `.ts` 세그먼트 URL 파싱
3. 세그먼트를 순서대로 fetch → ArrayBuffer 수집
4. Blob으로 병합 후 `chrome.downloads.download({url: blobUrl})`
5. 최종 파일명: `{site}_{timestamp}.ts`

상세 구현: `references/hls-download-pattern.md` 참조

#### DASH (mpd)

1. MPD XML fetch 후 파싱
2. 최고 화질 `AdaptationSet` + `Representation` 선택
3. `SegmentTemplate` 또는 `SegmentList`에서 세그먼트 URL 추출
4. 세그먼트 순서대로 다운로드

#### Blob URL

- Blob URL은 해당 탭 컨텍스트에서만 유효 → 직접 다운로드 불가
- 전략 1: `declarativeNetRequest`로 원본 미디어 요청을 캡처하여 실제 URL 획득
- 전략 2: content_script에서 `MediaSource` `onsourceopen` 이벤트 후킹하여 세그먼트 캡처

### 3단계: Manifest V3 권한 매핑

| 필요 기능 | 권한 |
|-----------|------|
| 다운로드 실행 | `"downloads"` |
| 쿠키 읽기 | `"cookies"` (optional_permissions 권장) |
| 네트워크 요청 캡처 | `"declarativeNetRequest"` |
| 상태 저장 | `"storage"` |
| 대상 도메인 접근 | `host_permissions: ["https://example.com/*"]` |

**최소 권한 원칙:** 전략에 필요한 권한만 포함한다. `<all_urls>`는 사용하지 않는다.

### 4단계: UI 삽입 전략

```json
{
  "selector": ".video-container",
  "position": "afterend",
  "button_label": "영상 다운로드",
  "button_class": "cvp-downloader-btn"
}
```

`selector`는 site-analyzer의 `dom_selectors.download_button_candidate` 값을 우선 사용한다. 없으면 `video` 부모 요소를 fallback으로 사용한다.

## 결과 저장

`_workspace/02_video-strategy_spec.json`에 저장. 형식은 `video-strategy-analyst.md`의 출력 스키마를 따른다.
