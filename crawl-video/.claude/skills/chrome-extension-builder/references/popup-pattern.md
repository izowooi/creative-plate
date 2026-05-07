# Popup UI 패턴

## popup.html

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>영상 다운로드</title>
  <style>
    body { width: 300px; padding: 16px; font-family: sans-serif; }
    h2 { font-size: 14px; margin: 0 0 12px; }
    #status { font-size: 12px; color: #666; margin-bottom: 8px; min-height: 18px; }
    button { width: 100%; padding: 10px; background: #1a73e8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    #progress { display: none; margin-top: 8px; }
    progress { width: 100%; }
  </style>
</head>
<body>
  <h2>⬇ 영상 다운로드</h2>
  <div id="status">현재 페이지에서 영상을 탐지 중...</div>
  <button id="downloadBtn" disabled>다운로드</button>
  <div id="progress">
    <progress id="progressBar" max="100" value="0"></progress>
    <span id="progressText">0%</span>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

## popup.js

```javascript
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('status');
  const downloadBtn = document.getElementById('downloadBtn');

  // 현재 탭에서 영상 URL 탐지
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.tabs.sendMessage(tab.id, { type: 'GET_VIDEO_URL' }, (response) => {
    if (chrome.runtime.lastError || !response?.videoUrl) {
      statusEl.textContent = '이 페이지에서 영상을 찾을 수 없습니다.';
      return;
    }
    statusEl.textContent = `영상 발견: ${response.videoUrl.substring(0, 50)}...`;
    downloadBtn.disabled = false;

    downloadBtn.addEventListener('click', () => {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '다운로드 중...';
      statusEl.textContent = '다운로드를 시작합니다.';

      chrome.runtime.sendMessage({
        type: 'DOWNLOAD_VIDEO',
        videoUrl: response.videoUrl,
        filename: response.filename
      }, (result) => {
        if (result?.success) {
          statusEl.textContent = '다운로드가 시작되었습니다.';
          downloadBtn.textContent = '완료';
        } else {
          statusEl.textContent = `오류: ${result?.error || '알 수 없는 오류'}`;
          downloadBtn.disabled = false;
          downloadBtn.textContent = '다시 시도';
        }
      });
    });
  });
});
```

## content_script에 GET_VIDEO_URL 응답 추가

popup.js가 `GET_VIDEO_URL` 메시지를 보내므로, content_script.js에도 리스너 추가 필요:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_VIDEO_URL') {
    sendResponse({
      videoUrl: getCurrentVideoUrl(),
      filename: generateFilename()
    });
  }
});
```
