---
name: chrome-extension-builder
description: "Chrome Extension Manifest V3 파일을 구현하는 스킬. extension-builder 에이전트가 사용한다. manifest.json, content_script.js, background service worker, popup.html/js를 생성하는 패턴과 MV3 제약 사항을 포함한다. Chrome 익스텐션 생성·수정·업데이트 또는 manifest/content_script/background/popup 파일 작성이 필요할 때 반드시 이 스킬을 사용할 것."
---

# Chrome Extension Builder

Chrome Extension Manifest V3 파일 생성 가이드. `extensions/{site_name}/` 디렉토리에 배포 가능한 익스텐션을 생성한다.

## 파일 구조

```
extensions/{site_name}/
├── manifest.json           ← extension-manifest-engineer 담당
├── content_script.js       ← extension-content-engineer 담당
├── background.js           ← extension-background-engineer 담당
├── popup.html              ← extension-background-engineer 담당
└── popup.js                ← extension-background-engineer 담당
```

## manifest.json 구조 (MV3)

```json
{
  "manifest_version": 3,
  "name": "{site_name} Video Downloader",
  "version": "1.0",
  "description": "{site_name}에서 영상을 다운로드하는 익스텐션",
  "permissions": ["downloads", "storage"],
  "optional_permissions": ["cookies"],
  "host_permissions": ["{target_domain}/*"],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["{target_domain}/*"],
      "js": ["content_script.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup.html",
    "default_title": "{site_name} Video Downloader"
  }
}
```

**MV3 필수 체크:**
- `manifest_version: 3` 명시
- `background.service_worker` 키 사용 (background.scripts 아님)
- `persistent` 키 사용하지 않음

상세 MV3 API 레퍼런스: `references/manifest-v3.md` 참조

## content_script.js 패턴

```javascript
// Site: {site_name} | Strategy: {strategy} | Generated: {date}
(function() {
  'use strict';

  if (document.getElementById('cvp-downloader-container')) return;

  function insertDownloadButton(container) {
    const btn = document.createElement('button');
    btn.id = 'cvp-downloader-btn';
    btn.className = 'cvp-downloader-btn';
    btn.textContent = '⬇ 영상 다운로드';
    btn.style.cssText = [
      'position:relative', 'z-index:9999', 'padding:8px 16px',
      'background:#1a73e8', 'color:#fff', 'border:none',
      'border-radius:4px', 'cursor:pointer', 'font-size:14px',
      'margin:8px 0'
    ].join(';');

    btn.addEventListener('click', () => {
      btn.textContent = '다운로드 중...';
      btn.disabled = true;
      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_VIDEO',
        videoUrl: getCurrentVideoUrl(),
        filename: generateFilename()
      }, (response) => {
        btn.textContent = response?.success ? '완료!' : '오류';
        setTimeout(() => { btn.textContent = '⬇ 영상 다운로드'; btn.disabled = false; }, 2000);
      });
    });

    container.insertAdjacentElement('afterend', btn);
  }

  function getCurrentVideoUrl() {
    // 전략별 URL 추출 — strategy_spec.json의 approach에 따라 구현
    const video = document.querySelector('video');
    return video?.currentSrc || video?.src || '';
  }

  function generateFilename() {
    const title = document.title.replace(/[^\w\s-]/g, '').trim().substring(0, 50);
    return `${title}_${Date.now()}.mp4`;
  }

  // DOM 변화 감지 후 버튼 삽입
  const observer = new MutationObserver(() => {
    const container = document.querySelector('{ui_insertion.selector}');
    if (container && !document.getElementById('cvp-downloader-btn')) {
      insertDownloadButton(container);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // 초기 실행
  const container = document.querySelector('{ui_insertion.selector}');
  if (container) insertDownloadButton(container);
})();
```

## background.js (Service Worker) 패턴

```javascript
// Site: {site_name} | Strategy: {strategy} | Generated: {date}
'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_VIDEO') {
    handleDownload(message).then(sendResponse).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // 비동기 응답을 위해 true 반환 필수
  }
});

async function handleDownload({ videoUrl, filename }) {
  if (!videoUrl) return { success: false, error: '영상 URL을 찾을 수 없습니다' };

  if (videoUrl.includes('.m3u8')) {
    return await downloadHLS(videoUrl, filename);
  }
  return await downloadDirect(videoUrl, filename);
}

async function downloadDirect(url, filename) {
  const downloadId = await chrome.downloads.download({
    url,
    filename: filename || 'video.mp4',
    saveAs: false
  });
  return { success: true, downloadId };
}

async function downloadHLS(m3u8Url, filename) {
  // HLS 구현 상세: references/hls-download-pattern.md 참조
  const response = await fetch(m3u8Url);
  const playlist = await response.text();
  const segments = playlist.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.startsWith('http') ? line : new URL(line, m3u8Url).href);

  const buffers = await Promise.all(
    segments.map(url => fetch(url).then(r => r.arrayBuffer()))
  );

  const blob = new Blob(buffers, { type: 'video/mp2t' });
  const blobUrl = URL.createObjectURL(blob);
  const downloadId = await chrome.downloads.download({
    url: blobUrl,
    filename: filename?.replace('.mp4', '.ts') || 'video.ts'
  });
  return { success: true, downloadId };
}
```

**MV3 Service Worker 제약:**
- DOM API 접근 불가 (`document`, `window` 없음)
- `XMLHttpRequest` 사용 불가 → `fetch()` 사용
- `chrome.runtime.onMessage` 리스너가 SW를 깨움

## popup.html + popup.js 패턴

popup은 다운로드 상태 표시와 수동 다운로드 버튼을 제공한다.

상세 popup 구현: `references/popup-pattern.md` 참조

## 참조 문서

- `references/manifest-v3.md` — MV3 API 레퍼런스
- `references/hls-download-pattern.md` — HLS 세그먼트 다운로드 완전 구현
- `references/popup-pattern.md` — popup UI 패턴
