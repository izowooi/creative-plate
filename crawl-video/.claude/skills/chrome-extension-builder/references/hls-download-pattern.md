# HLS 다운로드 구현 패턴

## 기본 구조

HLS 다운로드는 3단계: m3u8 파싱 → 세그먼트 수집 → 결합 다운로드

```javascript
async function downloadHLS(m3u8Url, filename, authCookies = null) {
  // 1. 마스터 플레이리스트 fetch
  const masterResponse = await fetch(m3u8Url, {
    credentials: authCookies ? 'include' : 'omit'
  });
  const masterText = await masterResponse.text();

  // 마스터 플레이리스트인지 미디어 플레이리스트인지 구분
  const isMedia = masterText.includes('#EXTINF');
  const mediaM3u8Url = isMedia ? m3u8Url : await getBestQualityStream(masterText, m3u8Url);

  // 2. 미디어 플레이리스트에서 세그먼트 URL 파싱
  const segments = await parseMediaPlaylist(mediaM3u8Url);

  // 3. 세그먼트 순서대로 수집
  const buffers = [];
  for (const segUrl of segments) {
    const segResponse = await fetch(segUrl, { credentials: 'include' });
    buffers.push(await segResponse.arrayBuffer());
  }

  // 4. Blob 생성 + 다운로드
  const blob = new Blob(buffers, { type: 'video/mp2t' });
  const blobUrl = URL.createObjectURL(blob);
  await chrome.downloads.download({
    url: blobUrl,
    filename: filename || 'video.ts',
    saveAs: false
  });

  // 5. Blob URL 해제 (메모리 누수 방지)
  // Service Worker에서는 setTimeout 사용 불가 — 다운로드 완료 이벤트 활용
  chrome.downloads.onChanged.addListener(function revoker({ id, state }) {
    if (state?.current === 'complete') {
      URL.revokeObjectURL(blobUrl);
      chrome.downloads.onChanged.removeListener(revoker);
    }
  });

  return { success: true };
}

// 마스터 플레이리스트에서 최고 화질 스트림 선택
async function getBestQualityStream(masterText, baseUrl) {
  const lines = masterText.split('\n');
  let bestBandwidth = 0;
  let bestUrl = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF')) {
      const bandwidth = parseInt(lines[i].match(/BANDWIDTH=(\d+)/)?.[1] || '0');
      const streamUrl = lines[i + 1]?.trim();
      if (streamUrl && bandwidth > bestBandwidth) {
        bestBandwidth = bandwidth;
        bestUrl = streamUrl.startsWith('http') ? streamUrl : new URL(streamUrl, baseUrl).href;
      }
    }
  }
  return bestUrl || baseUrl;
}

// 미디어 플레이리스트 파싱
async function parseMediaPlaylist(m3u8Url) {
  const response = await fetch(m3u8Url, { credentials: 'include' });
  const text = await response.text();
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

  return text.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.startsWith('http') ? line.trim() : new URL(line.trim(), baseUrl).href);
}
```

## 주의사항

- 대용량 HLS 영상(1시간+)은 메모리 부족 가능 → 세그먼트별 개별 다운로드 후 사용자가 FFmpeg로 병합하도록 안내
- 암호화된 HLS (`#EXT-X-KEY` 태그)는 키 없이 다운로드 불가
- 세그먼트 수가 많으면 병렬 fetch (Promise.all)로 속도 개선 가능 — 단, 서버 요청 제한 확인 필요
