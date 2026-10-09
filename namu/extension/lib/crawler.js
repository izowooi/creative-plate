// 문서 수집·캐시·스킨 CSS 처리. webapp/namu_crawler 의 fetch.py + crawler.py 에 해당한다.
//
// 방법 순서: 브라우저 fetch(사용자의 실제 쿠키·TLS 지문) -> 브라우저 탭(챌린지를 사람이 풀 수 있음).
// 모든 외부 요청은 직렬화하고, 응답이 느릴수록 다음 요청까지의 간격을 늘린다.
import { BASE_URL, parseEntry, titleToUrl } from "./targets.js";
import { checkResponse, ExtractError, extractDocument } from "./extract.js";

const SKIN_PREFIX = `${BASE_URL}/skins/`;
const TRANSIENT_STATUSES = new Set([429, 502, 504]);
const NOT_FOUND_TTL = 600;
const FONT_PATH = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:woff2|woff|ttf|otf|eot|svg)$/;
const WOFF2_URL = /url\((['"]?)https:\/\/namu\.wiki\/skins\/([A-Za-z0-9_\-/]+\.woff2)(?:\?[^)'"]*)?\1\)/g;
// 링크를 따라갈 때 건너뛰는 이름공간 (문서가 아닌 분류·파일·틀 등)
const SKIP_NAMESPACES = new Set(["분류", "파일", "틀", "사용자", "나무위키", "휴지통"]);

class Transient extends Error {
  constructor(message, retryAfter = null) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export class FetchFailed extends Error {
  constructor(failures) {
    super(failures.join(" / "));
    this.failures = failures;
  }
}

export async function sha1Hex(text) {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export function absolutizeCssUrls(css) {
  return css.replace(/url\((['"]?)(\/(?!\/)[^)'"]*)\1\)/g, (_, q, path) => `url(${q}${BASE_URL}${path}${q})`);
}

function base64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export const chromeStore = {
  get: (keys) => chrome.storage.local.get(keys),
  set: (items) => chrome.storage.local.set(items),
};

export class Crawler {
  constructor({
    store = chromeStore, fetchImpl = (...a) => fetch(...a), tabFetch = null, minInterval = 3000,
    staticInterval = 300, ttl = 86400, retries = 3, timeoutMs = 90000, now = () => Date.now() / 1000,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)), clock = () => performance.now(),
  } = {}) {
    Object.assign(this, { store, fetchImpl, tabFetch, minInterval, staticInterval, ttl, retries, timeoutMs, now, sleep, clock });
    this.notBefore = { doc: 0, static: 0 };
    this.queue = Promise.resolve();
    this.memo = new Map();
  }

  // ----- 외부 요청 직렬화 -----

  request(kind, fn) {
    const run = async () => {
      const wait = this.notBefore[kind] - this.clock();
      if (wait > 0) await this.sleep(wait);
      const started = this.clock();
      try {
        return await fn();
      } finally {
        const elapsed = this.clock() - started;
        const interval = kind === "doc" ? this.minInterval : this.staticInterval;
        // 응답이 느리다는 건 서버가 힘들어한다는 신호라 그만큼 더 쉰다
        this.notBefore[kind] = this.clock() + Math.max(interval, elapsed);
      }
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  penalize(seconds) {
    this.notBefore.doc = Math.max(this.notBefore.doc, this.clock() + seconds * 1000);
  }

  // ----- 수집 -----

  async crawl(title, { refresh = false } = {}) {
    const started = this.clock();
    const key = await sha1Hex(title);
    try {
      let page = null;
      if (!refresh) {
        const cached = await this.readPage(key);
        if (cached && this.fresh(cached)) page = { ...cached, cached: true };
      }
      if (!page) {
        page = await this.download(title);
        await this.writePage(key, page);
      }
      return await this.finish(key, title, page, started);
    } catch (e) {
      if (!(e instanceof FetchFailed)) throw e;
      return { key, title, status: "error", error: `모든 수집 방법이 실패했습니다: ${e.message}`, elapsed: (this.clock() - started) / 1000 };
    }
  }

  // 사용자가 보고 있는 탭의 DOM 을 그대로 받아 저장한다(차단 걱정이 없는 경로).
  async ingestLive(url, html) {
    const { title } = parseEntry(url);
    checkResponse(200, html);
    const key = await sha1Hex(title);
    const page = { title, url, status: 200, html, via: "현재 탭", fetched_at: this.now(), note: "" };
    await this.writePage(key, page);
    return this.finish(key, title, page, this.clock());
  }

  async load(key) {
    const page = await this.readPage(key);
    return page ? this.finish(key, page.title, { ...page, cached: true }, this.clock()) : null;
  }

  fresh(page) {
    return this.now() - page.fetched_at < (page.status === 404 ? NOT_FOUND_TTL : this.ttl);
  }

  async download(title) {
    const url = titleToUrl(title);
    // 탭 방법은 사람이 챌린지를 푸는 흐름이라 재시도하지 않는다
    const tiers = [["fetch", "브라우저 fetch", (u) => this.httpTier(u), this.retries]];
    if (this.tabFetch) tiers.push(["tab", "브라우저 탭", (u) => this.tabFetch(u), 0]);
    const failures = [];
    for (const [name, label, tier, retries] of tiers) {
      try {
        const resp = await this.tryTier(tier, url, retries);
        return { title, url: resp.url, status: resp.status, html: resp.html, via: label, fetched_at: this.now(), note: "" };
      } catch (e) {
        if (!(e instanceof ExtractError)) throw e;
        if (e.kind === "not_found") return { title, url, status: 404, html: "", via: label, fetched_at: this.now(), note: "" };
        failures.push(`${name}: ${e.message}`);
      }
    }
    throw new FetchFailed(failures);
  }

  async tryTier(tier, url, retries) {
    let backoff = 2;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let resp;
      try {
        resp = await this.request("doc", () => tier(url));
        if (TRANSIENT_STATUSES.has(resp.status)) throw new Transient(`HTTP ${resp.status}`, resp.retryAfter);
      } catch (e) {
        if (!(e instanceof Transient)) throw e;
        if (attempt === retries) throw new ExtractError("blocked", `재시도 ${retries}회 초과 (${e.message})`);
        this.penalize(e.retryAfter || backoff);
        backoff *= 2;
        continue;
      }
      checkResponse(resp.status, resp.html);
      return resp;
    }
    throw new Error("unreachable");
  }

  async httpTier(url) {
    let res;
    try {
      res = await this.fetchImpl(url, {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(this.timeoutMs),
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
    } catch (e) {
      throw new Transient(`네트워크 오류: ${e.message}`);
    }
    const retryAfter = Number(res.headers.get("Retry-After"));
    return { status: res.status, html: await res.text(), url: res.url || url, retryAfter: retryAfter > 0 ? retryAfter : null };
  }

  // ----- 추출 -----

  async finish(key, title, page, started) {
    const elapsed = () => (this.clock() - started) / 1000;
    if (page.status === 404) return { key, title, status: "not_found", page, elapsed: elapsed() };
    let doc;
    try {
      doc = this.extract(key, page);
    } catch (e) {
      if (!(e instanceof ExtractError)) throw e;
      return { key, title, status: "error", page, error: e.message, elapsed: elapsed() };
    }
    const css = await this.ensureCss(doc.stylesheets);
    return { key, title, status: "ok", doc, page, css, elapsed: elapsed(), redirected_from: doc.title !== title ? title : null };
  }

  extract(key, page) {
    const memoKey = `${key}:${page.fetched_at}`;
    if (this.memo.has(memoKey)) return this.memo.get(memoKey);
    const dom = new DOMParser().parseFromString(page.html, "text/html");
    const doc = extractDocument(dom, page.url);
    this.memo.set(memoKey, doc);
    if (this.memo.size > 32) this.memo.delete(this.memo.keys().next().value);
    return doc;
  }

  // ----- 저장소 -----

  async readPage(key) {
    const name = `page:${key}`;
    return (await this.store.get(name))[name] || null;
  }

  async writePage(key, page) {
    const { cached, ...saved } = page;
    await this.store.set({ [`page:${key}`]: saved });
    const index = (await this.store.get("index")).index || {};
    index[key] = { title: page.title, status: page.status, via: page.via, fetched_at: page.fetched_at };
    await this.store.set({ index });
  }

  async history(limit = 100) {
    const index = (await this.store.get("index")).index || {};
    return Object.entries(index).map(([key, v]) => ({ key, ...v })).sort((a, b) => b.fetched_at - a.fetched_at).slice(0, limit);
  }

  // ----- 스킨 CSS / 폰트 -----

  // 스킨 CSS 를 받아 보관하고 {원본 URL: 저장 키} 를 돌려준다. 해시가 배포마다 바뀌므로 문서와 같은 시점의 CSS 를 쓴다.
  async ensureCss(urls) {
    const map = {};
    for (const url of urls) {
      if (!url.startsWith(SKIN_PREFIX)) continue; // robots.txt 가 허용하고 우리가 기대하는 경로만 받는다
      const key = await sha1Hex(url);
      const name = `css:${key}`;
      if ((await this.store.get(name))[name] === undefined) {
        const text = await this.staticFetch(url, "text");
        if (text === null) continue;
        await this.store.set({ [name]: absolutizeCssUrls(text) });
      }
      map[url] = key;
    }
    return map;
  }

  // 저장·표시용 CSS. 폰트는 CORS 때문에 iframe 안에서 직접 못 불러오므로
  // 아이콘 폰트(Ionicons)와, 수식이 있는 문서의 KaTeX 폰트를 data URI 로 내장한다.
  async exportCss(key, html) {
    const name = `css:${key}`;
    const css = (await this.store.get(name))[name];
    if (css === undefined) return null;
    const hasMath = html.includes("katex");
    let out = "";
    let last = 0;
    for (const face of css.matchAll(/@font-face\s*\{[^}]*\}/g)) {
      out += css.slice(last, face.index) + (await this.embedFace(face[0], hasMath));
      last = face.index + face[0].length;
    }
    return out + css.slice(last);
  }

  async embedFace(face, hasMath) {
    const family = /font-family:\s*["']?([^;"']+)/.exec(face);
    const name = family ? family[1].trim() : "";
    if (!(name === "Ionicons" || (hasMath && name.startsWith("KaTeX")))) return face;
    let result = face;
    for (const url of face.matchAll(WOFF2_URL)) {
      const data = await this.fontBase64(url[2]);
      if (data) result = result.replace(url[0], `url(data:font/woff2;base64,${data})`);
    }
    return result;
  }

  async fontBase64(rel) {
    if (!FONT_PATH.test(rel)) return null;
    const name = `font:${rel}`;
    const cached = (await this.store.get(name))[name];
    if (cached) return cached;
    const bytes = await this.staticFetch(`${SKIN_PREFIX}${rel}`, "bytes");
    if (bytes === null) return null;
    const data = base64(bytes);
    await this.store.set({ [name]: data });
    return data;
  }

  staticFetch(url, as) {
    return this.request("static", async () => {
      try {
        const res = await this.fetchImpl(url, { credentials: "omit", signal: AbortSignal.timeout(this.timeoutMs) });
        if (!res.ok) return null;
        return as === "text" ? await res.text() : new Uint8Array(await res.arrayBuffer());
      } catch {
        return null;
      }
    });
  }
}

// 링크를 따라갈 후보. subdocs 는 '문서명/...' 하위 문서만, links 는 본문 내 모든 문서 링크.
export function followTargets(result, scope) {
  if (!result.doc) return [];
  const prefix = result.doc.title + "/";
  const found = [];
  for (const link of result.doc.links) {
    let title;
    try {
      title = decodeURIComponent(new URL(link.url).pathname.slice("/w/".length));
    } catch {
      continue;
    }
    if (!title || title === result.doc.title) continue;
    if (title.includes(":") && SKIP_NAMESPACES.has(title.split(":", 1)[0])) continue;
    if (scope === "subdocs" && !title.startsWith(prefix)) continue;
    found.push({ title, url: link.url });
  }
  return found;
}

// 막혔을 때 실제 탭을 열어 DOM 을 읽는다. 챌린지가 뜨면 탭을 앞으로 꺼내 사람이 풀 때까지 기다린다.
export function makeTabFetcher({ timeoutMs = 180000, onNotice = () => {} } = {}) {
  return async function fetchViaTab(url) {
    const tab = await chrome.tabs.create({ url, active: false });
    const started = Date.now();
    let activated = false;
    try {
      while (Date.now() - started < timeoutMs) {
        await new Promise((r) => setTimeout(r, 1500));
        let result;
        try {
          [{ result }] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => ({
              ready: document.readyState !== "loading",
              hasArticle: Boolean(document.querySelector("h1") && document.querySelector('a[href*="creativecommons.org/licenses"]')),
              status: (performance.getEntriesByType("navigation")[0] || {}).responseStatus || 0,
              html: document.documentElement.outerHTML,
              url: location.href,
            }),
          });
        } catch {
          continue; // 탐색 중이라 주입에 실패 - 다음 주기에 다시 시도
        }
        const isNotFound = result.status === 404 && result.html.includes('content="the seed"');
        if (result.ready && (result.hasArticle || isNotFound)) {
          return { status: result.status || 200, html: result.html, url: result.url };
        }
        if (!activated && Date.now() - started > 5000) {
          activated = true;
          await chrome.tabs.update(tab.id, { active: true });
          onNotice("확인 절차가 필요할 수 있습니다. 열린 나무위키 탭에서 확인을 마치면 자동으로 이어집니다.");
        }
      }
      throw new Transient("탭에서 문서를 읽지 못했습니다(시간 초과)");
    } finally {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  };
}
