// 수집 에이전트 = 사용자 브라우저에 설치된 확장 프로그램.
// 나무위키는 Cloudflare Workers 와 일반 서버 IP(AWS 등)를 WAF 로 막기 때문에 서버가 대신 받아 올 수 없다.
// 이 페이지는 확장 프로그램에 메시지를 보내 문서 HTML 을 받아 온다(확장의 externally_connectable 이 이 도메인만 허용).
export const EXTENSION_ID = "mpnnkficphmndekicabfdchhcpfhdmmp";
export const SKIN_PREFIX = "https://namu.wiki/skins/";

export class AgentUnavailable extends Error {}

export function send(message, { chromeApi = globalThis.chrome, extensionId = EXTENSION_ID, timeoutMs = 240000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!chromeApi?.runtime?.sendMessage) {
      reject(new AgentUnavailable("이 브라우저에서는 확장 프로그램과 통신할 수 없습니다"));
      return;
    }
    const timer = setTimeout(() => reject(new AgentUnavailable("확장 프로그램이 응답하지 않습니다")), timeoutMs);
    try {
      chromeApi.runtime.sendMessage(extensionId, message, (response) => {
        clearTimeout(timer);
        const error = chromeApi.runtime.lastError;
        if (error) reject(new AgentUnavailable(error.message));
        else resolve(response);
      });
    } catch (e) {
      clearTimeout(timer);
      reject(new AgentUnavailable(e.message));
    }
  });
}

export async function detectAgent(options = {}) {
  try {
    const reply = await send({ type: "ping" }, { ...options, timeoutMs: options.timeoutMs ?? 1500 });
    return reply?.ok ? { available: true, version: reply.version } : { available: false };
  } catch {
    return { available: false };
  }
}

export async function fetchPage(url, options = {}) {
  const reply = await send({ type: "fetch", url }, options);
  if (!reply || reply.error) throw new AgentUnavailable(reply?.error || "확장 프로그램이 빈 응답을 돌려줬습니다");
  return reply; // {status, html, url, via}
}

// Crawler 의 fetchImpl 로 쓴다: 스킨 CSS/폰트는 서버 프록시로, 문서는 확장 프로그램으로 받는다.
export function makeFetchImpl({ pageFetcher = fetchPage, fetchImpl = (...a) => fetch(...a) } = {}) {
  return async (url, init = {}) => {
    if (url.startsWith(SKIN_PREFIX)) {
      return fetchImpl(`/api/skin?path=${encodeURIComponent(url.slice(SKIN_PREFIX.length))}`, { credentials: "same-origin", signal: init.signal });
    }
    if (url.startsWith("https://namu.wiki/w/")) {
      const page = await pageFetcher(url);
      return {
        status: page.status, ok: page.status >= 200 && page.status < 300, url: page.url || url,
        headers: { get: (name) => (name.toLowerCase() === "retry-after" && page.retryAfter ? String(page.retryAfter) : null) },
        text: async () => page.html,
      };
    }
    throw new Error(`지원하지 않는 주소입니다: ${url}`);
  };
}
