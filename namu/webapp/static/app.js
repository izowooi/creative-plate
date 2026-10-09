"use strict";

const $ = (selector) => document.querySelector(selector);
const STORE_KEY = "namu-crawler:entries";
const STATUS_ICON = { pending: "·", running: "", ok: "✓", not_found: "∅", error: "✕" };
const STATUS_LABEL = { not_found: "문서 없음", error: "실패" };

const state = { items: [], current: null, running: false, cancel: false, controller: null, tab: "page" };

function stored() { try { return localStorage.getItem(STORE_KEY) || ""; } catch { return ""; } }
function store(value) { try { localStorage.setItem(STORE_KEY, value); } catch { /* 저장 불가 환경 */ } }

async function post(url, body, signal) {
  const res = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

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

// ---------- 목록 ----------

function addItem(title, depth) {
  let item = state.items.find((i) => i.title === title);
  if (item) {
    Object.assign(item, { status: "pending", depth });
  } else {
    item = { title, status: "pending", depth, key: null, summary: null };
    state.items.push(item);
  }
  renderResults();
  return item;
}

function describe(item) {
  const s = item.summary;
  if (item.status === "running") {
    const seconds = Math.round((Date.now() - item.startedAt) / 1000);
    return `수집 중… ${seconds}초 (서버가 느리면 간격을 자동으로 늘리며 재시도합니다)`;
  }
  if (!s) return "대기 중";
  if (item.status === "error") return s.error || "알 수 없는 오류";
  if (item.status === "not_found") return "나무위키에 없는 문서입니다";
  const c = s.doc.counts;
  const redirect = s.doc.redirected_from ? `‘${s.doc.redirected_from}’에서 이동 · ` : "";
  return `${redirect}문단 ${c.sections} · 링크 ${c.links} · 이미지 ${c.images}`;
}

function buildItem(item, onClick) {
  const li = el("li", "item" + (state.current === item ? " active" : ""));
  const icon = el("span", `st-${item.status}`, STATUS_ICON[item.status]);
  if (item.status === "running") icon.append(el("span", "spin"));
  const body = el("div");
  body.append(el("div", "name", item.summary?.doc?.title || item.title), el("div", "detail", describe(item)));
  const badge = el("span", "badge");
  if (item.summary?.via) badge.textContent = item.summary.cached ? "캐시" : item.summary.via;
  else if (STATUS_LABEL[item.status]) badge.textContent = STATUS_LABEL[item.status];
  else badge.hidden = true;
  li.append(icon, body, badge);
  li.title = describe(item);
  li.addEventListener("click", onClick);
  return li;
}

function renderResults() {
  const list = $("#results");
  list.replaceChildren(...state.items.map((item) => buildItem(item, () => select(item))));
  const done = state.items.filter((i) => i.status === "ok").length;
  $("#count").textContent = state.items.length ? `${done}/${state.items.length}` : "";
  $("#zip").disabled = done === 0;
}

// ---------- 뷰어 ----------

function select(item) {
  state.current = item;
  renderResults();
  const ok = item.status === "ok";
  $("#empty").hidden = true;
  $("#viewer").hidden = false;
  const s = item.summary;
  $("#v-title").textContent = s?.doc?.title || item.title;
  const origin = $("#v-origin");
  origin.hidden = !s?.doc;
  if (s?.doc) origin.href = s.doc.url;
  $("#v-meta").textContent = s?.fetched_at ? `${s.fetched_at}${s.note ? " · " + s.note : ""}` : "";
  for (const id of ["dl-html", "dl-md", "dl-json", "open-tab"]) $("#" + id).hidden = !ok;
  if (ok) {
    $("#dl-html").href = `/api/export/${item.key}.html`;
    $("#dl-md").href = `/api/export/${item.key}.md`;
    $("#dl-json").href = `/api/export/${item.key}.json`;
    $("#open-tab").href = `/doc/${item.key}`;
  }
  showTab(state.tab);
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
        : `수집하지 못했습니다.\n${item?.summary?.error || ""}`;
    return;
  }
  if (tab === "page") {
    const src = `/doc/${item.key}`;
    if (frame.getAttribute("src") !== src) frame.src = src;
    return;
  }
  text.textContent = "불러오는 중…";
  const res = await fetch(`/api/export/${item.key}.${tab}?inline=1`);
  if (state.current === item && state.tab === tab) text.textContent = await res.text();
}

// ---------- 크롤링 ----------

async function crawlItem(item) {
  item.status = "running";
  item.startedAt = Date.now();
  renderResults();
  if (state.current === item) showTab(state.tab);
  state.controller = new AbortController();
  try {
    const summary = await post("/api/crawl/one",
      { title: item.title, refresh: $("#refresh").checked }, state.controller.signal);
    Object.assign(item, { key: summary.key, status: summary.status, summary });
  } catch (e) {
    item.status = "error";
    item.summary = { error: e.name === "AbortError" ? "중지했습니다" : `서버 오류: ${e.message}` };
  }
  renderResults();
  if (state.current === item || (!state.current && item.status === "ok")) select(item);
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
  let parsed;
  try {
    parsed = await post("/api/parse", { text });
  } catch (e) {
    setNotice(`서버에 연결하지 못했습니다: ${e.message}`);
    return;
  }
  const skipped = parsed.errors.map((e) => `${e.entry} — ${e.message}`);
  if (!parsed.targets.length) {
    setNotice(skipped.length ? "인식한 문서가 없습니다:\n" + skipped.join("\n") : "문서 URL이나 문서명을 입력하세요.");
    return;
  }
  setNotice(skipped.length ? "건너뛴 항목:\n" + skipped.join("\n") : "");

  const follow = $("#follow").value;
  const maxDepth = Number($("#depth").value) || 1;
  const limit = Number($("#limit").value) || 20;
  const queue = parsed.targets.map((t) => addItem(t.title, 0));
  const seen = new Set(queue.map((i) => i.title));
  let crawled = 0;

  state.cancel = false;
  setRunning(true);
  while (queue.length && !state.cancel) {
    const item = queue.shift();
    await crawlItem(item);
    crawled += 1;
    if (follow && item.status === "ok" && item.depth < maxDepth && !state.cancel) {
      const next = await post("/api/follow", { key: item.key, scope: follow });
      for (const t of next.targets) {
        if (seen.has(t.title) || crawled + queue.length >= limit) continue;
        seen.add(t.title);
        queue.push(addItem(t.title, item.depth + 1));
      }
    }
  }
  for (const item of queue) { // 중지로 남은 대기 항목
    item.status = "error";
    item.summary = { error: "중지했습니다" };
  }
  renderResults();
  setRunning(false);
  loadHistory();
}

function stop() {
  state.cancel = true;
  state.controller?.abort();
}

async function downloadZip() {
  const keys = state.items.filter((i) => i.status === "ok").map((i) => i.key);
  if (!keys.length) return;
  const format = $("#zip-format").value;
  const res = await fetch("/api/export.zip", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keys, format }),
  });
  if (!res.ok) { setNotice(`ZIP 생성 실패: HTTP ${res.status}`); return; }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: `namu-${format}.zip` });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- 이전 수집 기록 ----------

async function loadHistory() {
  let items = [];
  try { items = (await (await fetch("/api/history")).json()).items; } catch { return; }
  $("#history-count").textContent = items.length ? `(${items.length})` : "";
  const list = $("#history");
  list.replaceChildren(...items.map((h) => {
    const li = el("li", "item");
    li.append(el("span", `st-${h.status === 404 ? "not_found" : "ok"}`, h.status === 404 ? "∅" : "✓"),
      (() => { const d = el("div"); d.append(el("div", "name", h.title), el("div", "detail",
        new Date(h.fetched_at * 1000).toLocaleString("ko-KR"))); return d; })(),
      el("span", "badge", h.via));
    li.addEventListener("click", () => openFromHistory(h));
    return li;
  }));
}

async function openFromHistory(h) {
  const item = addItem(h.title, 0);
  try {
    const summary = await post("/api/crawl/one", { title: h.title, cache_only: true });
    Object.assign(item, { key: summary.key, status: summary.status, summary });
  } catch (e) {
    item.status = "error";
    item.summary = { error: `기록을 열지 못했습니다: ${e.message}` };
  }
  renderResults();
  select(item);
}

// ---------- 초기화 ----------

setInterval(() => { if (state.running) renderResults(); }, 1000); // 수집 중 경과 시간 갱신
$("#entries").value = stored();
$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", stop);
$("#zip").addEventListener("click", downloadZip);
$("#follow").addEventListener("change", (e) => { $("#follow-opts").hidden = !e.target.value; });
$("#entries").addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); start(); }
});
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
loadHistory();
