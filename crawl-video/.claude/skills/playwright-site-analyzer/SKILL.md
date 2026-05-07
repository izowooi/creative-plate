---
name: playwright-site-analyzer
description: "Playwright MCP 도구(browser_navigate, browser_network_requests, browser_evaluate, browser_screenshot, browser_click)를 사용하여 웹사이트의 영상 스트리밍 구조를 분석하는 스킬. site-analyzer 에이전트가 이 스킬을 사용한다. 웹사이트에서 m3u8, mpd, mp4, blob URL, HLS, DASH, 스트리밍 영상을 찾거나 분석해야 할 때 반드시 이 스킬을 사용할 것."
---

# Playwright Site Analyzer

Playwright MCP를 이용해 웹사이트의 영상 전송 구조를 분석하는 절차 가이드.

## 분석 순서

### Step 1: 페이지 접근

```
browser_navigate(url)
browser_screenshot()   ← 접근 성공 여부 시각 확인
```

페이지 로드 후 즉시 `browser_network_requests()`를 호출하지 않는다. 영상 관련 요청은 사용자 상호작용(재생 버튼 클릭) 후에 발생한다.

### Step 2: 플레이어 라이브러리 탐지

```javascript
browser_evaluate(`
  JSON.stringify({
    videojs: !!window.videojs,
    hlsjs: !!window.Hls,
    shaka: !!window.shaka,
    jwplayer: !!window.jwplayer,
    plyr: !!window.Plyr,
    native: !!document.querySelector('video')
  })
`)
```

### Step 3: 영상 재생 트리거

영상이 재생되어야 실제 스트리밍 요청이 발생한다. 다음 순서로 시도한다:

```javascript
// 1. 네이티브 video 요소 직접 재생
browser_evaluate(`document.querySelector('video')?.play()`)

// 2. 재생 버튼이 있는 경우
browser_click("selector: .play-button, [aria-label*='play'], [class*='play-btn']")
```

재생 후 5~10초 대기하여 세그먼트 요청이 발생할 시간을 확보한다.

### Step 4: 네트워크 요청 수집 및 분류

```
browser_network_requests()
```

반환된 요청 목록에서 영상 관련 URL 필터링:

| 패턴 | 타입 | 우선순위 |
|------|------|---------|
| `*.m3u8`, `*playlist*` | HLS | 높음 |
| `*.mpd`, `*manifest*` | DASH | 높음 |
| `*.mp4`, `*.webm` | 직접 다운로드 | 높음 |
| `*.ts`, `*segment*` | HLS 세그먼트 | 중간 |
| `blob:` 스킴 | Blob URL | 높음 (별도 처리 필요) |
| `*/video/*`, `*/stream/*` | 추정 영상 API | 중간 |

### Step 5: 인증 구조 파악

```javascript
browser_evaluate(`
  // 쿠키 이름 목록 (HttpOnly 쿠키는 JS에서 값 접근 불가)
  document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)
`)
```

`browser_network_requests()` 응답의 request headers 필드에서 `Authorization`, `X-Auth-Token` 등 인증 헤더 탐지.

### Step 6: DRM 감지

```javascript
browser_evaluate(`
  JSON.stringify({
    hasEME: !!(navigator.requestMediaKeySystemAccess),
    hasMSMediaKeys: !!window.MSMediaKeys,
    hasWebKitMediaKeys: !!window.WebKitMediaKeys
  })
`)
```

`hasEME: true`이면 DRM 보호 가능성이 높다. 추가로 video 요소의 `encrypted` 이벤트 리스너 여부 확인:

```javascript
browser_evaluate(`
  const v = document.querySelector('video');
  v ? getEventListeners ? JSON.stringify(Object.keys(getEventListeners(v))) : 'check-manually' : 'no-video'
`)
```

DRM 확정 시 분석 즉시 중단. `drm_detected: true`로 결과 저장.

### Step 7: Blob URL 처리

`blob:` URL은 직접 다운로드 불가. 원본 세그먼트 URL을 네트워크 요청 목록에서 찾는다:

```javascript
browser_evaluate(`
  const v = document.querySelector('video');
  JSON.stringify({ currentSrc: v?.src, sources: Array.from(document.querySelectorAll('source')).map(s=>s.src) })
`)
```

MSE 사용 시 `*.ts` 또는 `*.m4s` 패턴의 네트워크 요청이 실제 세그먼트다.

### Step 8: DOM 선택자 확인

다운로드 버튼 삽입 후보 위치를 파악한다:

```javascript
browser_evaluate(`
  const candidates = ['#player', '.video-container', '.player-wrap', '[class*="video-wrap"]', 'video'].map(s => ({
    selector: s,
    exists: !!document.querySelector(s)
  }));
  JSON.stringify(candidates.filter(c => c.exists))
`)
```

## 결과 저장

분석 완료 후 `_workspace/01_site-analyzer_report.json`에 결과를 저장한다. 형식은 `site-analyzer.md` 에이전트 정의의 출력 스키마를 따른다.

상세 URL 패턴 레퍼런스: `references/video-url-patterns.md` 참조
