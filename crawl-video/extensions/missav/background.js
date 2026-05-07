'use strict';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_HLS') {
    downloadHLS(message.m3u8Url, message.filename)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function downloadHLS(m3u8Url, filename) {
  const res = await fetch(m3u8Url);
  if (!res.ok) throw new Error(`m3u8 fetch failed: ${res.status}`);
  const text = await res.text();

  const baseDir = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const segments = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => (l.startsWith('http') ? l : baseDir + l));

  if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

  const CHUNK = 5;
  const buffers = [];
  for (let i = 0; i < segments.length; i += CHUNK) {
    const chunk = segments.slice(i, i + CHUNK);
    const results = await Promise.all(chunk.map(url => fetch(url).then(r => r.arrayBuffer())));
    buffers.push(...results);
  }

  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }

  const blob = new Blob([merged], { type: 'video/mp2t' });
  const blobUrl = URL.createObjectURL(blob);

  const downloadId = await chrome.downloads.download({
    url: blobUrl,
    filename: filename || 'missav_video.ts',
    saveAs: false,
  });

  chrome.downloads.onChanged.addListener(function cleanup({ id, state }) {
    if (id === downloadId && state?.current === 'complete') {
      URL.revokeObjectURL(blobUrl);
      chrome.downloads.onChanged.removeListener(cleanup);
    }
  });

  return { success: true, downloadId, segments: segments.length };
}
