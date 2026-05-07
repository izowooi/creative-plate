'use strict';

(function () {
  if (document.getElementById('missav-dl-wrapper')) return;

  function getHlsInfo() {
    if (!window.hls) return null;
    return {
      masterUrl: window.hls.url,
      levels: (window.hls.levels || []).map(l => ({
        height: l.height,
        url: Array.isArray(l.url) ? l.url[0] : l.url,
      })),
      currentLevel: window.hls.currentLevel,
    };
  }

  function buildUI() {
    const container = document.querySelector('.aspect-w-16');
    if (!container || document.getElementById('missav-dl-wrapper')) return false;
    const info = getHlsInfo();
    if (!info || !info.levels.length) return false;

    const wrapper = document.createElement('div');
    wrapper.id = 'missav-dl-wrapper';
    wrapper.style.cssText = 'padding:8px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;';

    const qualitySelect = document.createElement('select');
    qualitySelect.style.cssText = 'padding:6px;border-radius:4px;border:1px solid #555;background:#222;color:#fff;';
    const sorted = [...info.levels].sort((a, b) => b.height - a.height);
    sorted.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.url;
      opt.textContent = `${l.height}p`;
      if (l.height === 720) opt.selected = true;
      qualitySelect.appendChild(opt);
    });

    const dlBtn = document.createElement('button');
    dlBtn.textContent = '⬇ 영상 다운로드 (.ts)';
    dlBtn.style.cssText = 'padding:8px 16px;background:#e50914;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '🔗 m3u8 URL 복사';
    copyBtn.style.cssText = 'padding:8px 12px;background:#333;color:#fff;border:1px solid #555;border-radius:4px;cursor:pointer;font-size:13px;';

    const status = document.createElement('span');
    status.style.cssText = 'font-size:12px;color:#aaa;';

    dlBtn.addEventListener('click', () => {
      const selectedUrl = qualitySelect.value;
      const qualityLabel = qualitySelect.selectedOptions[0]?.textContent || '720p';
      const titleWord = document.title.replace(/[^\x00-\x7F].*$/, '').trimEnd().split(' ')[0] || 'video';
      const filename = `missav_${titleWord}_${qualityLabel}.ts`;

      dlBtn.disabled = true;
      dlBtn.textContent = '다운로드 중...';
      status.textContent = '';

      chrome.runtime.sendMessage({ type: 'DOWNLOAD_HLS', m3u8Url: selectedUrl, filename }, res => {
        if (res && res.success) {
          dlBtn.textContent = '✓ 완료';
          status.textContent = `저장: ${filename} (${res.segments}개 세그먼트)`;
        } else {
          dlBtn.textContent = '⬇ 영상 다운로드 (.ts)';
          dlBtn.disabled = false;
          status.textContent = `오류: ${res?.error || '알 수 없는 오류'}`;
        }
      });
    });

    copyBtn.addEventListener('click', () => {
      const current = getHlsInfo();
      if (!current) return;
      navigator.clipboard.writeText(current.masterUrl).then(() => {
        copyBtn.textContent = '✓ 복사됨';
        setTimeout(() => { copyBtn.textContent = '🔗 m3u8 URL 복사'; }, 2000);
      });
    });

    wrapper.append(qualitySelect, dlBtn, copyBtn, status);
    container.insertAdjacentElement('afterend', wrapper);
    return true;
  }

  function tryInsert() {
    if (buildUI()) return;
    const timer = setInterval(() => { if (buildUI()) clearInterval(timer); }, 500);
    setTimeout(() => clearInterval(timer), 15000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(tryInsert, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(tryInsert, 500));
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'GET_HLS_INFO') {
      sendResponse(getHlsInfo());
    }
  });
})();
