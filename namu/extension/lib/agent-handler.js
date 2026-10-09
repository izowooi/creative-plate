// 호스팅 페이지(namu.zowoo.uk)의 요청을 받아 나무위키 문서를 대신 받아 주는 에이전트 로직.
// 나무위키는 Cloudflare Workers 와 서버 IP 를 막으므로, 사용자의 실제 브라우저(쿠키·TLS 지문)가 받아야 한다.
// 순서: 확장 fetch -> (차단되면) 실제 탭 열기. 챌린지가 뜨면 탭을 앞으로 꺼내 사람이 풀 때까지 기다린다.
import { checkResponse, ExtractError } from "./extract.js";

export const ALLOWED_ORIGINS = ["https://namu.zowoo.uk"];
const DOC_URL = /^https:\/\/namu\.wiki\/w\/[^\s#]+$/;
const TRANSIENT_STATUSES = new Set([429, 502, 504]);

function originOf(sender) {
  if (sender?.origin) return sender.origin;
  try {
    return new URL(sender?.url).origin;
  } catch {
    return "";
  }
}

export async function handleMessage(message, sender, { fetchImpl = (...a) => fetch(...a), tabFetch = null, version = "", timeoutMs = 90000 } = {}) {
  if (!ALLOWED_ORIGINS.includes(originOf(sender))) return { error: "허용되지 않은 출처입니다" };
  if (message?.type === "ping") return { ok: true, version };
  if (message?.type !== "fetch") return { error: "알 수 없는 요청입니다" };
  if (typeof message.url !== "string" || !DOC_URL.test(message.url)) {
    return { error: "나무위키 문서 URL(https://namu.wiki/w/...)만 받을 수 있습니다" };
  }
  return fetchDocument(message.url, { fetchImpl, tabFetch, timeoutMs });
}

async function fetchDocument(url, { fetchImpl, tabFetch, timeoutMs }) {
  let failure = "응답을 받지 못했습니다";
  try {
    const res = await fetchImpl(url, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const html = await res.text();
    const retryAfter = Number(res.headers?.get?.("Retry-After")) || null;
    if (TRANSIENT_STATUSES.has(res.status)) return { status: res.status, html: "", url: res.url || url, retryAfter, via: "확장 fetch" };
    try {
      checkResponse(res.status, html);
      return { status: res.status, html, url: res.url || url, via: "확장 fetch" };
    } catch (e) {
      if (!(e instanceof ExtractError)) throw e;
      if (e.kind === "not_found") return { status: 404, html, url: res.url || url, via: "확장 fetch" };
      failure = e.message; // 차단·챌린지·구조 변경: 아래에서 실제 탭으로 다시 시도한다
    }
  } catch (e) {
    if (e instanceof ExtractError) failure = e.message;
    else failure = e?.message || failure;
  }
  if (!tabFetch) return { error: `차단되어 문서를 받지 못했습니다 (${failure})` };
  try {
    const page = await tabFetch(url);
    return { status: page.status, html: page.html, url: page.url || url, via: "확장 탭" };
  } catch (e) {
    return { error: `탭으로도 문서를 받지 못했습니다 (${failure}; ${e?.message || e})` };
  }
}
