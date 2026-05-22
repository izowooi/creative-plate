'use strict';

const main = document.getElementById('main');
const noVideo = document.getElementById('noVideo');
const qualitySelect = document.getElementById('qualitySelect');
const dlBtn = document.getElementById('dlBtn');
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');

let hlsInfo = null;

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab || !tab.url || !tab.url.startsWith('https://missav.ai/')) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'GET_HLS_INFO' }, info => {
    if (chrome.runtime.lastError || !info || !info.levels || !info.levels.length) {
      noVideo.textContent = '영상 정보를 불러올 수 없습니다. 페이지를 새로고침해 보세요.';
      return;
    }
    hlsInfo = info;
    main.style.display = 'block';
    noVideo.style.display = 'none';

    const sorted = [...info.levels].sort((a, b) => b.height - a.height);
    sorted.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l.url;
      opt.textContent = `${l.height}p`;
      if (l.height === 720) opt.selected = true;
      qualitySelect.appendChild(opt);
    });
  });
});

dlBtn.addEventListener('click', () => {
  if (!hlsInfo) return;
  const selectedUrl = qualitySelect.value;
  const qualityLabel = qualitySelect.selectedOptions[0]?.textContent || '720p';

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    const titleWord = (tab.title || 'video').replace(/[^\x00-\x7F].*$/, '').trimEnd().split(' ')[0] || 'video';
    const filename = `missav_${titleWord}_${qualityLabel}.ts`;

    dlBtn.disabled = true;
    dlBtn.textContent = '다운로드 중...';
    status.textContent = '';

    chrome.runtime.sendMessage({ type: 'DOWNLOAD_HLS', m3u8Url: selectedUrl, filename }, res => {
      if (res && res.success) {
        dlBtn.textContent = '✓ 완료';
        const resumedMsg = res.resumed ? ` (이어받기 ${res.resumed}/${res.segments})` : '';
        status.textContent = `${res.segments}개 세그먼트 저장됨${resumedMsg}`;
      } else {
        dlBtn.textContent = '다운로드 (.ts 파일)';
        dlBtn.disabled = false;
        status.textContent = `오류: ${res?.error || '알 수 없는 오류'}`;
      }
    });
  });
});

copyBtn.addEventListener('click', () => {
  if (!hlsInfo) return;
  navigator.clipboard.writeText(hlsInfo.masterUrl).then(() => {
    copyBtn.textContent = '✓ 복사됨';
    setTimeout(() => { copyBtn.textContent = 'm3u8 URL 복사'; }, 2000);
  });
});

clearBtn.addEventListener('click', () => {
  if (!confirm('이어받기 캐시를 모두 비웁니다. 다음 다운로드는 처음부터 시작합니다. 진행할까요?')) return;
  chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' }, res => {
    if (res && res.success) {
      status.textContent = '캐시 비움';
    } else {
      status.textContent = `오류: ${res?.error || '알 수 없는 오류'}`;
    }
  });
});
