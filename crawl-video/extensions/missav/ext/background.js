'use strict';

const DB_NAME = 'ts-downloader';
const STORE = 'segments';
const CONCURRENCY = 5;
const SEGMENT_RETRIES = 3;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DOWNLOAD_HLS') {
    downloadHLS(message.m3u8Url, message.filename)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'CLEAR_CACHE') {
    clearAll()
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: ['sessionId', 'idx'] });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// m3u8 URL의 origin+pathname으로 세션 식별자 도출.
// 동일 영상·동일 화질이면 쿼리스트링(만료 토큰 등)이 바뀌어도 동일 키가 되도록 한다.
function deriveSessionId(m3u8Url) {
  try {
    const u = new URL(m3u8Url);
    return u.origin + u.pathname;
  } catch {
    return m3u8Url;
  }
}

function putSegment(db, sessionId, idx, buffer) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ sessionId, idx, buffer });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

function getSegment(db, sessionId, idx) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get([sessionId, idx]);
    req.onsuccess = () => resolve(req.result ? req.result.buffer : null);
    req.onerror = () => reject(req.error);
  });
}

function getExistingIndices(db, sessionId) {
  return new Promise((resolve, reject) => {
    const indices = new Set();
    const tx = db.transaction(STORE, 'readonly');
    const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
    const req = tx.objectStore(STORE).openKeyCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        indices.add(cursor.key[1]);
        cursor.continue();
      } else {
        resolve(indices);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

function clearSession(db, sessionId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const range = IDBKeyRange.bound([sessionId, -Infinity], [sessionId, Infinity]);
    tx.objectStore(STORE).delete(range);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function fetchSegment(url) {
  let lastErr;
  for (let i = 0; i <= SEGMENT_RETRIES; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.arrayBuffer();
    } catch (e) {
      lastErr = e;
      if (i < SEGMENT_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

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

  const sessionId = deriveSessionId(m3u8Url);
  const db = await openDB();
  const existing = await getExistingIndices(db, sessionId);
  const resumedFrom = existing.size;

  const missing = [];
  for (let i = 0; i < segments.length; i++) {
    if (!existing.has(i)) missing.push(i);
  }

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const chunk = missing.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(async idx => {
      const buf = await fetchSegment(segments[idx]);
      await putSegment(db, sessionId, idx, buf);
    }));
  }

  // 모든 세그먼트를 순서대로 읽어 단일 Blob 으로 합친다.
  const parts = [];
  for (let i = 0; i < segments.length; i++) {
    const buf = await getSegment(db, sessionId, i);
    if (!buf) throw new Error(`세그먼트 ${i} 누락`);
    parts.push(buf);
  }

  const blob = new Blob(parts, { type: 'video/mp2t' });
  const blobUrl = URL.createObjectURL(blob);

  const downloadId = await chrome.downloads.download({
    url: blobUrl,
    filename: filename || 'video.ts',
    saveAs: false,
  });

  // 다운로드가 디스크 저장까지 끝났을 때만 캐시 삭제. 실패하면 캐시 유지 → 다음 시도에 이어받기.
  chrome.downloads.onChanged.addListener(async function cleanup({ id, state }) {
    if (id !== downloadId) return;
    if (state?.current === 'complete') {
      URL.revokeObjectURL(blobUrl);
      try {
        await clearSession(db, sessionId);
      } catch (e) {
        console.warn('clearSession failed', e);
      }
      chrome.downloads.onChanged.removeListener(cleanup);
    } else if (state?.current === 'interrupted') {
      URL.revokeObjectURL(blobUrl);
      chrome.downloads.onChanged.removeListener(cleanup);
    }
  });

  return {
    success: true,
    downloadId,
    segments: segments.length,
    resumed: resumedFrom,
    downloaded: missing.length,
  };
}
