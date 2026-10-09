import { parseTargets, parseEntry } from "./lib/targets.js";

const $ = (selector) => document.querySelector(selector);
const STORE_KEY = "namu-crawler:entries";

function stored() { try { return localStorage.getItem(STORE_KEY) || ""; } catch { return ""; } }
function store(value) { try { localStorage.setItem(STORE_KEY, value); } catch { /* 저장 불가 환경 */ } }

function setNotice(message) {
  const el = $("#notice");
  el.textContent = message || "";
  el.hidden = !message;
}

async function openViewer(inbox) {
  await chrome.storage.local.set({ inbox });
  await chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
  window.close();
}

$("#entries").value = stored();

$("#start").addEventListener("click", async () => {
  const text = $("#entries").value;
  store(text);
  const { targets, errors } = parseTargets(text);
  if (!targets.length) {
    setNotice(errors.length ? errors.map((e) => `${e.entry} — ${e.message}`).join("\n") : "문서 URL이나 문서명을 입력하세요.");
    return;
  }
  await openViewer({ entries: text, autostart: true });
});

// 지금 보고 있는 탭이 나무위키 문서면, 그 탭의 DOM 을 그대로 가져온다(차단 걱정이 없는 경로).
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;
  let title;
  try {
    title = parseEntry(tab.url).title;
  } catch {
    return;
  }
  $("#grab-title").textContent = title;
  $("#current").hidden = false;
  $("#grab").addEventListener("click", async () => {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: () => ({ url: location.href, html: document.documentElement.outerHTML }),
      });
      await openViewer({ live: [result] });
    } catch (e) {
      setNotice(`이 탭을 읽지 못했습니다: ${e.message}`);
    }
  });
})();
