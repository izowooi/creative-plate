import { handleMessage } from "./lib/agent-handler.js";
import { makeTabFetcher } from "./lib/crawler.js";

// 호스팅 페이지는 manifest 의 externally_connectable 이 허용한 도메인에서만 메시지를 보낼 수 있고,
// handleMessage 가 출처를 한 번 더 검사한다.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, {
    tabFetch: makeTabFetcher(),
    version: chrome.runtime.getManifest().version,
  }).then(sendResponse, (e) => sendResponse({ error: e?.message || String(e) }));
  return true; // 비동기 응답
});
