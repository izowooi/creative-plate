# Manifest V3 핵심 레퍼런스

## MV3 vs MV2 주요 변경사항

| 항목 | MV2 | MV3 |
|------|-----|-----|
| Background | `background.scripts: []` | `background.service_worker: "bg.js"` |
| 지속 실행 | `persistent: true` 가능 | 항상 non-persistent |
| 네트워크 변조 | `webRequest` (blocking) | `declarativeNetRequest` |
| 원격 코드 | 가능 | 불가 (eval 포함) |
| Content Security Policy | 유연 | 엄격 (외부 스크립트 불가) |

## background.js Service Worker 제약

```javascript
// 가능
self.importScripts('util.js');  // 같은 익스텐션 패키지 내 파일만
fetch('https://...');
chrome.downloads.download();
chrome.storage.local.set();

// 불가
document.querySelector();      // DOM 없음
window.localStorage;           // localStorage 없음
XMLHttpRequest;                 // 사용 불가
eval('code');                   // 불가
new Function('return 1')();    // 불가
```

## 주요 권한 설명

| 권한 | 용도 | 주의 |
|------|------|------|
| `downloads` | `chrome.downloads.download()` 사용 | 필수 |
| `storage` | `chrome.storage.local/sync` 사용 | 상태 저장 시 |
| `cookies` | `chrome.cookies.getAll()` 사용 | 민감, optional 권장 |
| `declarativeNetRequest` | 네트워크 요청 규칙 | blob URL 캡처 시 |
| `tabs` | 탭 URL/쿼리 | 최소화 권장 |

## content_scripts 설정

```json
"content_scripts": [{
  "matches": ["https://example.com/*"],
  "js": ["content_script.js"],
  "run_at": "document_idle",    // document_start, document_end, document_idle
  "all_frames": false           // iframe 포함 여부
}]
```

`run_at: "document_idle"`: DOM 파싱 완료 + 외부 리소스 로드 완료 후 실행. 동적 SPA에서는 MutationObserver 사용 권장.

## chrome.downloads API

```javascript
chrome.downloads.download({
  url: 'https://...',      // 또는 blob URL
  filename: 'video.mp4',  // 다운로드 폴더 내 경로
  saveAs: false,           // true면 저장 다이얼로그
  conflictAction: 'uniquify'  // rename, overwrite, prompt
});
```

## chrome.runtime 메시지 패턴

```javascript
// content_script → background (단방향)
chrome.runtime.sendMessage({ type: 'ACTION', data: {} });

// content_script → background (응답 대기)
chrome.runtime.sendMessage({ type: 'ACTION' }, (response) => {
  console.log(response);
});

// background 수신
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ACTION') {
    doAsync().then(result => sendResponse(result));
    return true; // 비동기 응답 시 반드시 true 반환
  }
});
```
