import { parseTargets } from "./lib/targets.js";
import { Crawler, followTargets, sha1Hex } from "./lib/crawler.js";
import { renderPage, safeFilename, toJson } from "./lib/page.js";
import { toMarkdown } from "./lib/markdown.js";
import { buildZip } from "./lib/zip.js";
import { detectAgent, makeFetchImpl } from "./agent.js";
import { DbError, SupabaseStore } from "./store.js";

const $ = (selector) => document.querySelector(selector);
const STORE_KEY = "namu-web:entries";
const STATUS_ICON = { pending: "·", queued: "⌛", running: "", ok: "✓", not_found: "∅", error: "✕" };
const STATUS_LABEL = { queued: "대기열", not_found: "문서 없음", error: "실패" };
const JOB_ICON = { pending: "⌛", running: "", done: "✓", not_found: "∅", error: "✕" };
const MIME = { html: "text/html", md: "text/markdown", json: "application/json" };
const OPEN_JOB = new Set(["pending", "running"]);

const db = new SupabaseStore();
const crawler = new Crawler({ store: db, fetchImpl: makeFetchImpl(), tabFetch: null });
const state = { items: [], current: null, running: false, cancel: false, tab: "page", agent: { available: false }, jobs: [], history: [], signedIn: false };

function stored() { try { return localStorage.getItem(STORE_KEY) || ""; } catch { return ""; } }
function remember(value) { try { localStorage.setItem(STORE_KEY, value); } catch { /* 저장 불가 환경 */ } }

function setNotice(message) {
  const node = $("#notice");
  node.textContent = message || "";
  node.hidden = !message;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// DB 가 401 을 돌려주면 세션이 끝난 것이다. 로그인 화면으로 돌아간다.
function handleAuth(error) {
  if (error instanceof DbError && error.status === 401) {
    showLogin("로그인이 만료되었습니다. 다시 입력하세요.");
    return true;
  }
  return false;
}

// ---------- 로그인 ----------

function showLogin(message) {
  state.signedIn = false;
  $("#login").hidden = false;
  $("#app").hidden = true;
  $("#logout").hidden = true;
  const error = $("#login-error");
  error.textContent = message || "";
  error.hidden = !message;
  $("#login-token").focus();
}

async function showApp() {
  state.signedIn = true;
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#logout").hidden = false;
  await Promise.all([updateAgent(), loadLibrary(), refreshJobs()]);
}

async function boot() {
  const res = await fetch("/api/me", { credentials: "same-origin" }).catch(() => null);
  if (res?.ok) await showApp();
  else showLogin();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const res = await fetch("/api/login", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: $("#login-token").value }),
  }).catch(() => null);
  if (res?.ok) {
    $("#login-token").value = "";
    await showApp();
  } else {
    const error = $("#login-error");
    error.textContent = res ? "토큰이 올바르지 않습니다." : "서버에 연결하지 못했습니다.";
    error.hidden = false;
  }
});

$("#logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST", credentials: "same-origin" }).catch(() => null);
  showLogin();
});

// ---------- 수집 에이전트 ----------

async function updateAgent() {
  state.agent = await detectAgent();
  const badge = $("#agent-status");
  badge.hidden = false;
  badge.className = "agent " + (state.agent.available ? "ok" : "none");
  badge.textContent = state.agent.available ? `수집 에이전트 연결됨 (확장 v${state.agent.version})` : "수집 에이전트 없음 · 대기열 사용";
  badge.title = state.agent.available
    ? "이 브라우저의 확장 프로그램이 나무위키 문서를 대신 받아 옵니다."
    : "나무위키는 서버에서 접근하는 것을 막습니다. 확장 프로그램을 설치하면 바로 수집하고, 없으면 대기열에 올려 집 컴퓨터가 수집합니다.";
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

// ---------- 결과 목록 ----------

function addItem(title, depth) {
  let item = state.items.find((i) => i.title === title);
  if (item) Object.assign(item, { status: "pending", depth, result: null });
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
  if (item.status === "queued") return "대기열에 등록됨 · 집 컴퓨터 워커가 수집하면 자동으로 열립니다";
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
  if (item.result?.page?.via) badge.textContent = item.result.page.cached ? "저장본" : item.result.page.via;
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
      : item?.status === "running" || item?.status === "pending" || item?.status === "queued"
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

// ---------- 수집 ----------

function applyResult(item, result, show = true) {
  item.result = result;
  item.status = result.status;
  renderResults();
  if (show && (state.current === item || (!state.current && item.status === "ok"))) select(item);
}

async function crawlItem(item) {
  item.status = "running";
  item.startedAt = Date.now();
  renderResults();
  if (state.current === item) showTab(state.tab);
  try {
    applyResult(item, await crawler.crawl(item.title, { refresh: $("#refresh").checked }));
  } catch (e) {
    if (!handleAuth(e)) applyResult(item, { status: "error", error: `수집 중 오류: ${e.message}`, title: item.title });
  }
}

function setRunning(running) {
  state.running = running;
  $("#start").disabled = running;
  $("#stop").disabled = !running;
}

// DB 에 신선한 저장본이 있으면 수집하지 않고 그걸 연다.
async function savedResult(title) {
  const key = await sha1Hex(title);
  const page = await crawler.readPage(key);
  return page && crawler.fresh(page) ? crawler.load(key) : null;
}

async function enqueueTargets(targets) {
  let queued = 0, duplicate = 0, saved = 0;
  for (const target of targets) {
    const item = addItem(target.title, 0);
    const result = $("#refresh").checked ? null : await savedResult(target.title);
    if (result) {
      applyResult(item, result);
      saved += 1;
      continue;
    }
    const outcome = await db.enqueue(target.title);
    item.status = "queued";
    if (outcome.queued) queued += 1; else duplicate += 1;
  }
  renderResults();
  await refreshJobs();
  const parts = [`대기열에 ${queued}건 등록`];
  if (duplicate) parts.push(`이미 대기 중 ${duplicate}건`);
  if (saved) parts.push(`저장된 문서 ${saved}건은 바로 열었습니다`);
  setNotice(parts.join(", ") + ". 집 컴퓨터 워커가 수집하면 이 화면에 자동으로 나타납니다.");
}

async function start() {
  if (state.running) return;
  const text = $("#entries").value;
  remember(text);
  const { targets, errors } = parseTargets(text);
  const skipped = errors.map((e) => `${e.entry} — ${e.message}`);
  if (!targets.length) {
    setNotice(skipped.length ? "인식한 문서가 없습니다:\n" + skipped.join("\n") : "문서 URL이나 문서명을 입력하세요.");
    return;
  }
  setNotice(skipped.length ? "건너뛴 항목:\n" + skipped.join("\n") : "");

  setRunning(true);
  try {
    await updateAgent();
    if ($("#use-queue").checked || !state.agent.available) {
      await enqueueTargets(targets);
      if (skipped.length) setNotice($("#notice").textContent + "\n\n건너뛴 항목:\n" + skipped.join("\n"));
      return;
    }
    await crawlNow(targets);
  } catch (e) {
    if (!handleAuth(e)) setNotice(`오류: ${e.message}`);
  } finally {
    setRunning(false);
    loadLibrary();
  }
}

async function crawlNow(targets) {
  crawler.minInterval = (Number($("#interval").value) || 3) * 1000;
  const follow = $("#follow").value;
  const maxDepth = Number($("#depth").value) || 1;
  const limit = Number($("#limit").value) || 20;
  const queue = targets.map((t) => addItem(t.title, 0));
  const seen = new Set(queue.map((i) => i.title));
  let crawled = 0;

  state.cancel = false;
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
}

// ---------- 대기열 ----------

function describeJob(job) {
  if (job.status === "error") return job.error || "수집 실패";
  if (job.status === "not_found") return "나무위키에 없는 문서";
  if (job.status === "running") return `수집 중 · ${job.agent || "워커"}`;
  if (job.status === "done") return `완료 · ${job.agent || "워커"}`;
  return "대기 중";
}

async function openByTitle(title) {
  const item = addItem(title, 0);
  const result = await crawler.load(await sha1Hex(title));
  applyResult(item, result ?? { status: "error", error: "저장된 문서를 찾지 못했습니다", title }, false);
  select(item); // 한 번만 그린다(두 번 그리면 첫 렌더링의 이미지 요청이 중단된다)
}

function renderJobs() {
  const open = state.jobs.filter((j) => OPEN_JOB.has(j.status)).length;
  $("#jobs-count").textContent = state.jobs.length ? `(대기·진행 ${open})` : "";
  $("#jobs-empty").hidden = state.jobs.length > 0;
  $("#jobs").replaceChildren(...state.jobs.map((job) => {
    const li = el("li", "item job");
    const icon = el("span", `st-${job.status === "done" ? "ok" : job.status === "pending" ? "queued" : job.status}`, JOB_ICON[job.status]);
    if (job.status === "running") icon.append(el("span", "spin"));
    const body = el("div");
    body.append(el("div", "name", job.title), el("div", `detail${job.status === "error" ? " err" : ""}`, describeJob(job)));
    li.append(icon, body);
    if (job.status === "done") {
      const open = el("button", "", "열기");
      open.type = "button";
      open.addEventListener("click", () => openByTitle(job.title));
      li.append(open);
    } else if (job.status === "error") {
      const retry = el("button", "", "다시");
      retry.type = "button";
      retry.addEventListener("click", async () => { await db.enqueue(job.title); refreshJobs(); });
      li.append(retry);
    } else {
      li.append(el("span", ""));
    }
    return li;
  }));
}

// 대기열 변화를 결과 목록에 반영한다: 끝난 작업의 문서를 자동으로 연다.
async function syncQueuedItems() {
  for (const item of state.items.filter((i) => i.status === "queued")) {
    const job = state.jobs.find((j) => j.title === item.title);
    if (!job || OPEN_JOB.has(job.status)) continue;
    if (job.status === "done") await openByTitle(item.title);
    else if (job.status === "not_found") applyResult(item, { status: "not_found", title: item.title });
    else applyResult(item, { status: "error", error: job.error || "워커가 수집하지 못했습니다", title: item.title });
  }
}

async function refreshJobs() {
  if (!state.signedIn) return;
  try {
    state.jobs = await db.jobs();
    renderJobs();
    await syncQueuedItems();
    if (state.jobs.some((j) => j.status === "done")) loadLibrary();
  } catch (e) {
    handleAuth(e);
  }
}

$("#jobs-clear").addEventListener("click", async () => {
  try { await db.clearFinishedJobs(); } catch (e) { handleAuth(e); }
  refreshJobs();
});

setInterval(() => {
  const waiting = state.jobs.some((j) => OPEN_JOB.has(j.status)) || state.items.some((i) => i.status === "queued");
  if (!document.hidden && waiting) refreshJobs();
}, 5000);

// ---------- 저장된 문서(라이브러리) ----------

function renderLibrary() {
  const needle = $("#history-filter").value.trim().toLowerCase();
  const items = state.history.filter((h) => !needle || h.title.toLowerCase().includes(needle));
  $("#history-count").textContent = state.history.length ? `(${state.history.length})` : "";
  $("#history").replaceChildren(...items.map((h) => {
    const li = el("li", "item");
    const info = el("div");
    info.append(el("div", "name", h.title), el("div", "detail", new Date(h.fetched_at * 1000).toLocaleString("ko-KR")));
    li.append(el("span", `st-${h.status === 404 ? "not_found" : "ok"}`, h.status === 404 ? "∅" : "✓"), info, el("span", "badge", h.via));
    li.addEventListener("click", () => openByTitle(h.title));
    return li;
  }));
}

async function loadLibrary() {
  if (!state.signedIn) return;
  try {
    state.history = await crawler.history();
    renderLibrary();
  } catch (e) {
    handleAuth(e);
  }
}

// ---------- 초기화 ----------

setInterval(() => { if (state.running) renderResults(); }, 1000); // 수집 중 경과 시간 갱신
document.addEventListener("visibilitychange", () => { if (!document.hidden && state.signedIn) updateAgent(); });
$("#entries").value = stored();
$("#start").addEventListener("click", start);
$("#stop").addEventListener("click", () => { state.cancel = true; });
$("#zip").addEventListener("click", downloadZip);
$("#history-filter").addEventListener("input", renderLibrary);
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
boot();
