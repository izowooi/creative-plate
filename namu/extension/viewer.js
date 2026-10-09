import { parseTargets } from "./lib/targets.js";
import { Crawler, followTargets, makeTabFetcher } from "./lib/crawler.js";
import { renderPage, safeFilename, toJson } from "./lib/page.js";
import { toMarkdown } from "./lib/markdown.js";
import { buildZip } from "./lib/zip.js";

const $ = (selector) => document.querySelector(selector);
const STORE_KEY = "namu-crawler:entries";
const STATUS_ICON = { pending: "·", running: "", ok: "✓", not_found: "∅", error: "✕" };
const STATUS_LABEL = { not_found: "문서 없음", error: "실패" };
const MIME = { html: "text/html", md: "text/markdown", json: "application/json" };

const crawler = new Crawler({ tabFetch: makeTabFetcher({ onNotice: (m) => setNotice(m) }) });
const state = { items: [], current: null, running: false, cancel: false, tab: "page" };

function stored() { try { return localStorage.getItem(STORE_KEY) || ""; } catch { return ""; } }
function store(value) { try { localStorage.setItem(STORE_KEY, value); } catch { /* 저장 불가 환경 */ } }

function setNotice(message) {
  const el = $("#notice");
  el.textContent = message || "";
  el.hidden = !message;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- 내보내기 ----------

async function pageHtml(result) {
  const css = [];
  for (const url of result.doc?.stylesheets || []) {
    const key = result.css?.[url];
    const text = key ? await crawler.exportCss(key, result.doc.html) : null;
    css.push(text ?? `@import url("${url}");`); // CSS 를 못 받았으면 원본 주소를 참조
  }
  return renderPage(result, css);
}

async function render(result, fmt) {
  if (fmt === "html") return pageHtml(result);
  const markdown = toMarkdown(result);
  return fmt === "md" ? markdown : toJson(result, markdown);
}

function saveBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function downloadOne(fmt) {
  const result = state.current?.result;
  if (result?.status !== "ok") return;
  saveBlob(`${safeFilename(result.doc.title)}.${fmt}`, new Blob([await render(result, fmt)], { type: `${MIME[fmt]};charset=utf-8` }));
}

async function downloadZip() {
  const results = state.items.filter((i) => i.status === "ok").map((i) => i.result);
  if (!results.length) return;
  const fmt = $("#zip-format").value;
  const used = new Set();
  const files = [];
  for (const result of results) {
    let name = safeFilename(result.doc.title);
    if (used.has(name)) name = `${name}_${result.key.slice(0, 6)}`;
    used.add(name);
    files.push({ name: `${name}.${fmt}`, text: await render(result, fmt) });
  }
  saveBlob(`namu-${fmt}.zip`, await buildZip(files));
}

// ---------- 목록 ----------

function addItem(title, depth) {
  let item = state.items.find((i) => i.title === title);
  if (item) Object.assign(item, { status: "pending", depth });
  else {
    item = { title, status: "pending", depth, result: null };
    state.items.push(item);
  }
  renderResults();
  return item;
}

function describe(item) {
  const r = item.result;
  if (item.status === "running") {
    const seconds = Math.round((Date.now() - item.startedAt) / 1000);
    return `수집 중… ${seconds}초 (서버가 느리면 간격을 자동으로 늘리며 재시도합니다)`;
  }
  if (!r) return "대기 중";
  if (item.status === "error") return r.error || "알 수 없는 오류";
  if (item.status === "not_found") return "나무위키에 없는 문서입니다";
  const d = r.doc;
  const redirect = r.redirected_from ? `‘${r.redirected_from}’에서 이동 · ` : "";
  return `${redirect}문단 ${d.sections.length} · 링크 ${d.links.length} · 이미지 ${d.images.length}`;
}

function buildItem(item, onClick) {
  const li = el("li", "item" + (state.current === item ? " active" : ""));
  const icon = el("span", `st-${item.status}`, STATUS_ICON[item.status]);
  if (item.status === "running") icon.append(el("span", "spin"));
  const body = el("div");
  body.append(el("div", "name", item.result?.doc?.title || item.title), el("div", "detail", describe(item)));
  const badge = el("span", "badge");
  if (item.result?.page?.via) badge.textContent = item.result.page.cached ? "캐시" : item.result.page.via;
  else if (STATUS_LABEL[item.status]) badge.textContent = STATUS_LABEL[item.status];
  else badge.hidden = true;
  li.append(icon, body, badge);
  li.title = describe(item);
  li.addEventListener("click", onClick);
  return li;
}

function renderResults() {
  $("#results").replaceChildren(...state.items.map((item) => buildItem(item, () => select(item))));
  const done = state.items.filter((i) => i.status === "ok").length;
  $("#count").textContent = state.items.length ? `${done}/${state.items.length}` : "";
  $("#zip").disabled = done === 0;
}

// ---------- 뷰어 ----------

async function select(item) {
  state.current = item;
  renderResults();
  const result = item.result;
  const ok = item.status === "ok";
  $("#empty").hidden = true;
  $("#viewer").hidden = false;
  $("#v-title").textContent = result?.doc?.title || item.title;
  const origin = $("#v-origin");
  origin.hidden = !result?.doc;
  if (result?.doc) origin.href = result.doc.url;
  $("#v-meta").textContent = result?.page ? `${new Date(result.page.fetched_at * 1000).toLocaleString("ko-KR")}${result.page.note ? " · " + result.page.note : ""}` : "";
  for (const id of ["dl-html", "dl-md", "dl-json"]) $("#" + id).hidden = !ok;
  await showTab(state.tab);
}

async function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const item = state.current;
  const frame = $("#frame"), text = $("#text"), message = $("#message");
  const ok = item?.status === "ok";
  frame.hidden = !(ok && tab === "page");
  text.hidden = !(ok && tab !== "page");
  message.hidden = ok;
  if (!ok) {
    message.textContent = item?.status === "not_found"
      ? `나무위키에 ‘${item.title}’ 문서가 없습니다.`
      : item?.status === "running" || item?.status === "pending"
        ? "수집 중입니다…"
        : `수집하지 못했습니다.\n${item?.result?.error || ""}`;
    return;
  }
  if (tab === "page") {
    frame.srcdoc = await pageHtml(item.result);
    return;
  }
  const out = await render(item.result, tab);
  if (state.current === item && state.tab === tab) text.textContent = out;
}

// ---------- 크롤링 ----------

function applyResult(item, result) {
  item.result = result;
  item.status = result.status;
  renderResults();
  if (state.current === item || (!state.current && item.status === "ok")) select(item);
}

async function crawlItem(item) {
  item.status = "running";
  item.startedAt = Date.now();
  renderResults();
  if (state.current === item) showTab(state.tab);
  try {
    applyResult(item, await crawler.crawl(item.title, { refresh: $("#refresh").checked }));
  } catch (e) {
    applyResult(item, { status: "error", error: `수집 중 오류: ${e.message}`, title: item.title });
  }
}

function setRunning(running) {
  state.running = running;
  $("#start").disabled = running;
  $("#stop").disabled = !running;
}

async function start() {
  if (state.running) return;
  const text = $("#entries").value;
  store(text);
  const { targets, errors } = parseTargets(text);
  const skipped = errors.map((e) => `${e.entry} — ${e.message}`);
  if (!targets.length) {
    setNotice(skipped.length ? "인식한 문서가 없습니다:\n" + skipped.join("\n") : "문서 URL이나 문서명을 입력하세요.");
    return;
  }
  setNotice(skipped.length ? "건너뛴 항목:\n" + skipped.join("\n") : "");

  crawler.minInterval = (Number($("#interval").value) || 3) * 1000;
  crawler.tabFetch = $("#use-tab").checked ? makeTabFetcher({ onNotice: setNotice }) : null;
  const follow = $("#follow").value;
  const maxDepth = Number($("#depth").value) || 1;
  const limit = Number($("#limit").value) || 20;
  const queue = targets.map((t) => addItem(t.title, 0));
  const seen = new Set(queue.map((i) => i.title));
  let crawled = 0;

  state.cancel = false;
  setRunning(true);
  while (queue.length && !state.cancel) {
    const item = queue.shift();
    await crawlItem(item);
    crawled += 1;
    if (follow && item.status === "ok" && item.depth < maxDepth && !state.cancel) {
      for (const t of followTargets(item.result, follow)) {
        if (seen.has(t.title) || crawled + queue.length >= limit) continue;
        seen.add(t.title);
        queue.push(addItem(t.title, item.depth + 1));
      }
    }
  }
  for (const item of queue) { // 중지로 남은 대기 항목
    item.status = "error";
    item.result = { status: "error", error: "중지했습니다", title: item.title };
  }
  renderResults();
  setRunning(false);
  loadHistory();
}

// ---------- 이전 수집 기록 ----------

async function loadHistory() {
  const items = await crawler.history();
  $("#history-count").textContent = items.length ? `(${items.length})` : "";
  $("#history").replaceChildren(...items.map((h) => {
    const li = el("li", "item");
    const info = el("div");
    info.append(el("div", "name", h.title), el("div", "detail", new Date(h.fetched_at * 1000).toLocaleString("ko-KR")));
    li.append(el("span", `st-${h.status === 404 ? "not_found" : "ok"}`, h.status === 404 ? "∅" : "✓"), info, el("span", "badge", h.via));
    li.addEventListener("click", async () => {
      const item = addItem(h.title, 0);
      const result = await crawler.load(h.key);
      if (result) applyResult(item, result);
      select(item);
    });
    return li;
  }));
}

// ---------- 초기화 ----------

async function consumeInbox() {
  const { inbox } = await chrome.storage.local.get("inbox");
  if (!inbox) return;
  await chrome.storage.local.remove("inbox");
  if (inbox.entries) $("#entries").value = inbox.entries;
  for (const live of inbox.live || []) {
    try {
      const result = await crawler.ingestLive(live.url, live.html);
      const item = addItem(result.title, 0);
      applyResult(item, result);
      select(item);
    } catch (e) {
      setNotice(`현재 탭 문서를 읽지 못했습니다: ${e.message}`);
    }
  }
  loadHistory();
  if (inbox.autostart) start();
}

setInterval(() => { if (state.running) renderResults(); }, 1000); // 수집 중 경과 시간 갱신
$("#entries").value = stored();
$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", () => { state.cancel = true; });
$("#zip").addEventListener("click", downloadZip);
$("#follow").addEventListener("change", (e) => { $("#follow-opts").hidden = !e.target.value; });
$("#entries").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); start(); }
});
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
for (const fmt of ["html", "md", "json"]) {
  const link = $(`#dl-${fmt}`);
  link.addEventListener("click", () => downloadOne(fmt));
  link.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); downloadOne(fmt); } });
}
loadHistory();
consumeInbox();
