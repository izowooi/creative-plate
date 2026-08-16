const API = {
  dashboard: "/api/dashboard",
  jobs: "/api/jobs",
  jobActions: "/api/jobs/actions",
  settings: "/api/settings",
  events: "/api/events",
  ranges: "/api/ranges/expand",
  health: "/api/health",
};

const ACTIVE_STATUSES = new Set(["queued", "analyzing", "downloading", "paused"]);
const STATUS_META = {
  queued: { label: "대기", description: "다운로드 순서를 기다리는 중" },
  analyzing: { label: "분석 중", description: "스트림 정보를 확인하는 중" },
  downloading: { label: "다운로드 중", description: "세그먼트를 저장하는 중" },
  paused: { label: "일시정지", description: "재개하면 처음부터 다시 다운로드" },
  completed: { label: "완료", description: "파일 저장 완료" },
  failed: { label: "실패", description: "오류 확인 필요" },
  cancelled: { label: "취소", description: "작업이 취소됨" },
  unknown: { label: "알 수 없음", description: "상태 정보 없음" },
};

const ACTION_META = {
  pause: { label: "일시정지", shortLabel: "정지" },
  resume: { label: "처음부터 재개", shortLabel: "재시작" },
  cancel: { label: "취소", shortLabel: "취소", dangerous: true },
  retry: { label: "다시 시도", shortLabel: "재시도" },
  delete: { label: "기록 삭제", shortLabel: "삭제", dangerous: true },
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const numberFormatter = new Intl.NumberFormat("ko-KR");
const savedButtonContents = new WeakMap();

const state = {
  overview: null,
  history: null,
  query: { status: "", search: "", limit: 10, offset: 0 },
  queueLoading: true,
  historyLoading: true,
  queueError: "",
  historyError: "",
  refreshController: null,
  refreshVersion: 0,
  refreshQueued: false,
  refreshTimer: null,
  eventSource: null,
  reconnectTimer: null,
  reconnectDelay: 5000,
  pollTimer: null,
  healthTimer: null,
  streamOpen: false,
  samples: new Map(),
  concurrencyDirty: false,
  outputDirDirty: false,
  lastSavedConcurrency: 4,
  settingsApplied: false,
  lastBackgroundError: "",
};

const dom = {};

function byId(id) {
  return document.getElementById(id);
}

function cacheDom() {
  [
    "summaryGrid", "summaryActive", "summaryQueued", "summaryCompleted", "summaryFailed", "summaryTotal",
    "connectionStatus", "connectionLabel", "connectionDetail", "addJobsForm", "urlsInput", "urlCount",
    "urlsError", "outputDir", "pathError", "qualityInput", "concurrencyInput", "overwriteInput",
    "recentOutputDirs", "submitJobsButton", "rangeStart", "rangeEnd", "expandRangeButton", "rangeBuilder",
    "activeCount", "cancelAllButton", "queueLoading", "queueError", "queueEmpty", "queueList",
    "retryFailedButton", "searchInput", "historyLoading", "historyError", "historyEmpty",
    "historyEmptyTitle", "historyEmptyDescription", "historyList", "pagination", "previousPage", "nextPage",
    "pageLabel", "manualRefreshButton", "confirmDialog", "confirmTitle", "confirmMessage", "confirmButton",
    "toastRegion",
  ].forEach((id) => {
    dom[id] = byId(id);
  });
  dom.statusTabs = Array.from(document.querySelectorAll("[data-status][role='tab']"));
  dom.refreshButtons = Array.from(document.querySelectorAll("[data-refresh]"));
  dom.stepButtons = Array.from(document.querySelectorAll("[data-step]"));
}

class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(payload, fallback) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!isObject(payload)) return fallback;
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload.error === "string" && payload.error.trim()) return payload.error.trim();
  if (isObject(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail.trim();
  return fallback;
}

async function apiRequest(path, options = {}) {
  const request = {
    method: options.method || "GET",
    signal: options.signal,
    headers: { Accept: "application/json", ...(options.headers || {}) },
  };

  if (options.body !== undefined) {
    request.headers["Content-Type"] = "application/json";
    request.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, request);
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    throw new ApiError("서버에 연결할 수 없습니다. 로컬 서버가 실행 중인지 확인해 주세요.");
  }

  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (response.status !== 204) {
    try {
      payload = contentType.includes("json") ? await response.json() : await response.text();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(payload, `요청을 처리하지 못했습니다. (HTTP ${response.status})`),
      response.status,
      payload,
    );
  }
  return payload ?? {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function finiteNumber(value, fallback = 0) {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function qualityNumber(value) {
  const direct = finiteNumber(value, NaN);
  if (Number.isFinite(direct)) return Math.max(0, direct);
  const match = String(value || "").match(/\d+/);
  return match ? nonNegative(match[0]) : 0;
}

function normalizeStatus(value) {
  const status = String(value || "unknown").toLowerCase();
  return STATUS_META[status] ? status : "unknown";
}

function extractJobs(payload) {
  const root = isObject(payload?.data) ? payload.data : payload;
  if (Array.isArray(root?.jobs)) return root.jobs;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.results)) return root.results;
  if (Array.isArray(root)) return root;
  return [];
}

function normalizeJob(rawValue, index = 0) {
  const raw = isObject(rawValue) ? rawValue : {};
  const nestedProgress = isObject(raw.progress) ? raw.progress : {};
  const completedSegments = nonNegative(firstDefined(
    raw.completedSegments,
    raw.downloadedSegments,
    raw.segmentsCompleted,
    raw.segments_done,
    nestedProgress.completedSegments,
    nestedProgress.downloadedSegments,
    nestedProgress.completed,
  ));
  const totalSegments = nonNegative(firstDefined(
    raw.totalSegments,
    raw.segmentsTotal,
    raw.segmentCount,
    raw.segments_total,
    nestedProgress.totalSegments,
    nestedProgress.total,
  ));
  let percent;
  if (totalSegments > 0) {
    percent = clamp((completedSegments / totalSegments) * 100, 0, 100);
  } else {
    const direct = finiteNumber(firstDefined(
      raw.progressPercent,
      raw.percent,
      nestedProgress.percent,
      nestedProgress.percentage,
      nestedProgress.ratio,
      isObject(raw.progress) ? undefined : raw.progress,
    ), NaN);
    percent = Number.isFinite(direct) ? clamp(direct > 0 && direct <= 1 ? direct * 100 : direct, 0, 100) : 0;
  }

  const idValue = firstDefined(raw.id, raw.jobId, raw.uuid, index);
  const status = normalizeStatus(firstDefined(raw.status, raw.state));
  const bytesWritten = nonNegative(firstDefined(
    raw.bytesWritten,
    raw.downloadedBytes,
    raw.bytesDownloaded,
    raw.bytes,
    nestedProgress.bytesWritten,
    nestedProgress.downloadedBytes,
    nestedProgress.bytes,
  ));
  const totalBytes = nonNegative(firstDefined(
    raw.totalBytes,
    raw.bytesTotal,
    raw.contentLength,
    nestedProgress.totalBytes,
    nestedProgress.bytesTotal,
  ));

  return {
    raw,
    id: String(idValue),
    url: String(firstDefined(raw.url, raw.sourceUrl, raw.source, "")),
    title: String(firstDefined(raw.title, raw.slug, raw.name, raw.filename, raw.fileName, "")),
    status,
    completedSegments,
    totalSegments,
    percent,
    bytesWritten,
    totalBytes,
    outputDir: String(firstDefined(raw.outputDir, raw.directory, "")),
    outputPath: String(firstDefined(raw.outputPath, raw.path, raw.destination, "")),
    preferredQuality: qualityNumber(firstDefined(raw.preferredQuality, raw.quality)),
    selectedQuality: qualityNumber(firstDefined(raw.selectedQuality, raw.actualQuality)),
    error: String(firstDefined(raw.error, raw.errorMessage, raw.message, "")),
    attempts: nonNegative(firstDefined(raw.attempts, raw.retryCount), 0),
    createdAt: firstDefined(raw.createdAt, raw.created_at, raw.queuedAt),
    updatedAt: firstDefined(raw.updatedAt, raw.updated_at),
    startedAt: firstDefined(raw.startedAt, raw.started_at),
    finishedAt: firstDefined(raw.finishedAt, raw.finished_at, raw.completedAt),
    elapsedSeconds: finiteNumber(firstDefined(raw.elapsedSeconds, raw.elapsed, raw.durationSeconds), NaN),
    speedBps: finiteNumber(firstDefined(raw.speedBps, raw.bytesPerSecond, raw.downloadSpeed), NaN),
    etaSeconds: finiteNumber(firstDefined(raw.etaSeconds, raw.eta), NaN),
    skipped: Boolean(raw.skipped),
  };
}

function normalizeDashboard(payload, fallbackQuery) {
  const root = isObject(payload?.data) ? payload.data : (isObject(payload) ? payload : {});
  const jobs = extractJobs(root).map(normalizeJob);
  const rawSummary = isObject(root.summary) ? root.summary : {};
  const countFromJobs = (status) => jobs.filter((job) => job.status === status).length;
  const summary = {};
  ["queued", "analyzing", "downloading", "paused", "completed", "failed", "cancelled"].forEach((status) => {
    summary[status] = nonNegative(firstDefined(rawSummary[status], countFromJobs(status)));
  });
  summary.active = summary.analyzing + summary.downloading + summary.paused;
  summary.total = nonNegative(firstDefined(
    rawSummary.total,
    Object.values(summary).slice(0, 7).reduce((sum, value) => sum + value, 0),
  ));

  const rawPagination = isObject(root.pagination) ? root.pagination : {};
  const limit = Math.max(1, finiteNumber(firstDefined(rawPagination.limit, fallbackQuery.limit), fallbackQuery.limit));
  const offset = Math.max(0, finiteNumber(firstDefined(rawPagination.offset, fallbackQuery.offset), fallbackQuery.offset));
  const total = Math.max(0, finiteNumber(firstDefined(rawPagination.total, rawPagination.count, jobs.length), jobs.length));
  const hasMore = typeof rawPagination.hasMore === "boolean"
    ? rawPagination.hasMore
    : (typeof rawPagination.has_more === "boolean"
      ? rawPagination.has_more
      : (typeof rawPagination.hasNext === "boolean" ? rawPagination.hasNext : offset + limit < total));

  return {
    summary,
    jobs,
    settings: isObject(root.settings) ? root.settings : {},
    pagination: { limit, offset, total, hasMore },
  };
}

function dashboardUrl(query) {
  const params = new URLSearchParams({
    status: query.status || "",
    search: query.search || "",
    limit: String(query.limit),
    offset: String(query.offset),
  });
  return `${API.dashboard}?${params.toString()}`;
}

async function fetchStatusJobs(status, expectedCount, signal) {
  const jobs = [];
  let offset = 0;
  const limit = 200;
  while (offset < expectedCount) {
    const query = { status, search: "", limit, offset };
    const page = normalizeDashboard(await apiRequest(dashboardUrl(query), { signal }), query);
    jobs.push(...page.jobs);
    if (!page.pagination.hasMore || page.jobs.length === 0) break;
    const nextOffset = page.pagination.offset + page.pagination.limit;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }
  return jobs;
}

async function fetchOverview(query, signal) {
  const dashboard = normalizeDashboard(await apiRequest(dashboardUrl(query), { signal }), query);
  const initialActive = dashboard.jobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  const counts = new Map();
  initialActive.forEach((job) => counts.set(job.status, (counts.get(job.status) || 0) + 1));
  const statusesToComplete = [...ACTIVE_STATUSES].filter(
    (status) => (counts.get(status) || 0) < nonNegative(dashboard.summary[status]),
  );

  const missingGroups = await Promise.all(statusesToComplete.map((status) => (
    fetchStatusJobs(status, nonNegative(dashboard.summary[status]), signal)
  )));
  const unique = new Map(initialActive.map((job) => [job.id, job]));
  missingGroups.flat().forEach((job) => unique.set(job.id, job));
  dashboard.jobs = Array.from(unique.values());
  return dashboard;
}

function updateSpeedSamples(jobs) {
  const now = performance.now();
  const groups = new Map();
  jobs.forEach((job) => {
    const group = groups.get(job.id) || [];
    group.push(job);
    groups.set(job.id, group);
  });
  state.samples.forEach((_, id) => {
    if (!groups.has(id)) state.samples.delete(id);
  });
  groups.forEach((group, id) => {
    const bytesWritten = Math.max(...group.map((job) => job.bytesWritten));
    const directJob = group.find((job) => Number.isFinite(job.speedBps) && job.speedBps >= 0);
    const directSpeed = directJob ? directJob.speedBps : null;
    const previous = state.samples.get(id);
    let measuredSpeed = previous?.speed || 0;
    if (previous && bytesWritten < previous.bytes) measuredSpeed = 0;
    if (previous && now > previous.at && bytesWritten >= previous.bytes) {
      const elapsed = (now - previous.at) / 1000;
      if (elapsed >= 0.45) {
        const instant = (bytesWritten - previous.bytes) / elapsed;
        measuredSpeed = previous.speed > 0 ? (previous.speed * 0.55) + (instant * 0.45) : instant;
      }
    }
    const speed = directSpeed ?? measuredSpeed;
    state.samples.set(id, { bytes: bytesWritten, at: now, speed });
    group.forEach((job) => { job.displaySpeed = speed; });
  });
}

async function refreshDashboard({ background = false } = {}) {
  if (background && state.refreshController) {
    state.refreshQueued = true;
    return false;
  }
  const version = ++state.refreshVersion;
  state.refreshController?.abort();
  const controller = new AbortController();
  state.refreshController = controller;
  const finish = (result) => {
    if (state.refreshController === controller) state.refreshController = null;
    if (state.refreshQueued) {
      state.refreshQueued = false;
      scheduleRefresh(0);
    }
    return result;
  };

  if (!background) {
    if (!state.overview) state.queueLoading = true;
    if (!state.history) state.historyLoading = true;
    renderLoadStates();
  }

  const overviewQuery = { status: "", search: "", limit: 200, offset: 0 };
  const historyQuery = { ...state.query };
  const [overviewResult, historyResult] = await Promise.allSettled([
    fetchOverview(overviewQuery, controller.signal),
    apiRequest(dashboardUrl(historyQuery), { signal: controller.signal }),
  ]);

  if (version !== state.refreshVersion) return finish(false);
  if (
    overviewResult.status === "rejected" && overviewResult.reason?.name === "AbortError"
    && historyResult.status === "rejected" && historyResult.reason?.name === "AbortError"
  ) return finish(false);

  state.queueLoading = false;
  state.historyLoading = false;

  if (overviewResult.status === "fulfilled") {
    state.overview = overviewResult.value;
    state.queueError = "";
    applySettings(state.overview.settings);
  } else if (overviewResult.reason?.name !== "AbortError") {
    state.queueError = overviewResult.reason?.message || "알 수 없는 오류가 발생했습니다.";
  }

  if (historyResult.status === "fulfilled") {
    state.history = normalizeDashboard(historyResult.value, historyQuery);
    state.historyError = "";
    if (!state.overview) applySettings(state.history.settings);
  } else if (historyResult.reason?.name !== "AbortError") {
    state.historyError = historyResult.reason?.message || "알 수 없는 오류가 발생했습니다.";
  }

  const metricJobs = [
    ...(state.overview?.jobs || []),
    ...(state.history?.jobs || []),
  ].filter((job) => ACTIVE_STATUSES.has(job.status));
  updateSpeedSamples(metricJobs);
  renderAll();

  if (overviewResult.status === "fulfilled" || historyResult.status === "fulfilled") {
    state.lastBackgroundError = "";
    if (!state.streamOpen && state.pollTimer) setConnection("polling", "연결됨 · 폴링", "5초마다 변경 사항 확인");
  } else if (background) {
    const message = state.queueError || state.historyError;
    if (message && message !== state.lastBackgroundError) {
      state.lastBackgroundError = message;
      showToast(message, { error: true, duration: 5200 });
    }
    setConnection("offline", "서버 연결 끊김", "서버가 다시 열리면 자동으로 연결합니다");
  }
  return finish(overviewResult.status === "fulfilled" && historyResult.status === "fulfilled");
}

function scheduleRefresh(delay = 120) {
  if (state.refreshTimer !== null) return;
  state.refreshTimer = window.setTimeout(() => {
    state.refreshTimer = null;
    refreshDashboard({ background: true });
  }, delay);
}

function applySettings(settingsValue) {
  const settings = isObject(settingsValue) ? settingsValue : {};
  const concurrency = clamp(Math.round(finiteNumber(settings.concurrency, 4)), 1, 8);
  if (!state.settingsApplied || !state.concurrencyDirty) {
    dom.concurrencyInput.value = String(concurrency);
    state.lastSavedConcurrency = concurrency;
  }

  const defaultDirValue = firstDefined(settings.defaultOutputDir, settings.default_output_dir, "");
  const defaultDir = typeof defaultDirValue === "string" ? defaultDirValue.trim() : "";
  if (defaultDir && (!state.settingsApplied || !state.outputDirDirty) && !dom.outputDir.value.trim()) {
    dom.outputDir.value = defaultDir;
  }

  const recentDirValues = firstDefined(settings.recentOutputDirs, settings.recent_output_dirs, []);
  const recentDirs = Array.isArray(recentDirValues)
    ? recentDirValues.filter((value) => typeof value === "string" && value.trim())
    : [];
  dom.recentOutputDirs.replaceChildren();
  const fragment = document.createDocumentFragment();
  [...new Set(recentDirs)].slice(0, 12).forEach((path) => {
    const option = document.createElement("option");
    option.value = path;
    fragment.append(option);
  });
  dom.recentOutputDirs.append(fragment);
  state.settingsApplied = true;
}

function setText(node, value) {
  node.textContent = String(value);
}

function renderAll() {
  renderSummary();
  renderQueue();
  renderHistory();
  renderLoadStates();
}

function renderSummary() {
  const summary = state.overview?.summary || state.history?.summary;
  if (!summary) return;
  const active = nonNegative(firstDefined(summary.active, summary.analyzing + summary.downloading + summary.paused));
  setText(dom.summaryActive, numberFormatter.format(active));
  setText(dom.summaryQueued, numberFormatter.format(summary.queued));
  setText(dom.summaryCompleted, numberFormatter.format(summary.completed));
  setText(dom.summaryFailed, numberFormatter.format(summary.failed));
  setText(dom.summaryTotal, `전체 ${numberFormatter.format(summary.total)}개 중`);
  dom.summaryGrid.setAttribute("aria-busy", "false");
  dom.cancelAllButton.disabled = active + summary.queued === 0;
  dom.retryFailedButton.disabled = summary.failed === 0;
}

function renderLoadStates() {
  dom.queueLoading.hidden = !state.queueLoading;
  dom.historyLoading.hidden = !state.historyLoading;
  dom.queueList.setAttribute("aria-busy", String(state.queueLoading));
  dom.historyList.setAttribute("aria-busy", String(state.historyLoading));

  const queueHasData = Boolean(state.overview?.jobs?.length);
  dom.queueError.hidden = !state.queueError || queueHasData;
  const queueErrorText = dom.queueError.querySelector("p");
  if (queueErrorText) setText(queueErrorText, state.queueError);

  const historyHasData = Boolean(state.history?.jobs?.length);
  dom.historyError.hidden = !state.historyError || historyHasData;
  const historyErrorText = dom.historyError.querySelector("p");
  if (historyErrorText) setText(historyErrorText, state.historyError);
}

function renderQueue() {
  const sourceJobs = state.overview?.jobs || (!state.query.status && !state.query.search ? state.history?.jobs : []) || [];
  const jobs = sourceJobs.filter((job) => ACTIVE_STATUSES.has(job.status));
  setText(dom.activeCount, numberFormatter.format(jobs.length));
  dom.queueList.replaceChildren();

  const showEmpty = !state.queueLoading && !state.queueError && jobs.length === 0;
  dom.queueEmpty.hidden = !showEmpty;
  if (!jobs.length) return;

  const fragment = document.createDocumentFragment();
  jobs.forEach((job) => fragment.append(createQueueCard(job)));
  dom.queueList.append(fragment);
}

function createElement(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.title) node.title = options.title;
  if (options.type) node.type = options.type;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([name, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(name, String(value));
    });
  }
  if (options.dataset) {
    Object.entries(options.dataset).forEach(([name, value]) => {
      node.dataset[name] = String(value);
    });
  }
  const childList = Array.isArray(children) ? children : [children];
  childList.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function displayTitle(job) {
  if (job.title.trim()) return job.title.trim();
  if (job.outputPath.trim()) {
    const parts = job.outputPath.split(/[\\/]/).filter(Boolean);
    if (parts.length) return parts.at(-1);
  }
  if (job.url) {
    try {
      const url = new URL(job.url);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length) return decodeURIComponent(parts.at(-1));
      return url.hostname;
    } catch {
      return job.url;
    }
  }
  return `작업 ${job.id.slice(0, 8)}`;
}

function compactUrl(value) {
  if (!value) return "URL 정보 없음";
  try {
    const url = new URL(value);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname}${path}${url.search}`;
  } catch {
    return value;
  }
}

function createStatusChip(status) {
  const meta = STATUS_META[status] || STATUS_META.unknown;
  return createElement("span", {
    className: "status-chip",
    text: meta.label,
    title: meta.description,
    dataset: { status },
  });
}

function createCopyButton(value, label) {
  return createElement("button", {
    className: "copy-button",
    text: "⧉",
    title: `${label} 복사`,
    type: "button",
    attrs: { "aria-label": `${label} 복사` },
    dataset: { copyValue: value },
  });
}

function actionsForStatus(status) {
  if (status === "downloading" || status === "analyzing") return ["pause", "cancel"];
  if (status === "paused") return ["resume", "cancel"];
  if (status === "queued") return ["cancel"];
  if (status === "failed") return ["retry", "delete"];
  if (status === "cancelled") return ["retry", "delete"];
  if (status === "completed") return ["delete"];
  return ["delete"];
}

function createActionButton(job, action, compact = false) {
  const meta = ACTION_META[action];
  const classes = [compact ? "icon-button" : "button", compact ? "" : "button-ghost"];
  if (meta.dangerous) classes.push("button-danger");
  const button = createElement("button", {
    className: classes.filter(Boolean).join(" "),
    text: compact ? meta.shortLabel : meta.label,
    title: meta.label,
    type: "button",
    attrs: { "aria-label": `${displayTitle(job)} ${meta.label}` },
    dataset: { jobAction: action, jobId: job.id },
  });
  return button;
}

function createQueueCard(job) {
  const card = createElement("article", {
    className: "job-card",
    dataset: { status: job.status },
    attrs: { "aria-label": `${displayTitle(job)}, ${STATUS_META[job.status]?.label || "상태 알 수 없음"}` },
  });

  const identity = createElement("div", { className: "job-identity" });
  const titleLine = createElement("div", { className: "job-title-line" });
  titleLine.append(
    createElement("h3", { className: "job-title", text: displayTitle(job), title: displayTitle(job) }),
    createStatusChip(job.status),
  );
  identity.append(titleLine);

  const urlLine = createElement("div", { className: "job-url", title: job.url || "URL 정보 없음" });
  urlLine.append(createElement("code", { text: compactUrl(job.url) }));
  if (job.url) urlLine.append(createCopyButton(job.url, "URL"));
  identity.append(urlLine);

  const actions = createElement("div", { className: "job-actions" });
  actionsForStatus(job.status).forEach((action) => actions.append(createActionButton(job, action)));
  card.append(createElement("div", { className: "job-card-head" }, [identity, actions]));

  const progressWrap = createElement("div", { className: "job-progress-wrap" });
  const progressLine = createElement("div", { className: "progress-line" });
  progressLine.append(
    createElement("strong", { text: `${formatPercent(job.percent)}%` }),
    createElement("span", { text: progressDetail(job) }),
  );
  const progress = createElement("progress", {
    attrs: { max: 100, "aria-label": `${displayTitle(job)} 진행률` },
  });
  if (job.totalSegments > 0 || job.percent > 0 || job.status === "completed") {
    progress.value = job.status === "completed" ? 100 : job.percent;
  }
  progressWrap.append(progressLine, progress);
  card.append(progressWrap);

  const metrics = createElement("div", { className: "metric-grid" });
  const elapsed = jobElapsedSeconds(job);
  const speed = job.displaySpeed || 0;
  const eta = jobEtaSeconds(job, speed, elapsed);
  [
    ["세그먼트", segmentText(job)],
    ["받은 용량", formatBytes(job.bytesWritten)],
    ["경과 시간", formatDuration(elapsed)],
    ["현재 속도", speed > 0 && job.status === "downloading" ? `${formatBytes(speed)}/s` : "—"],
    ["남은 시간", eta !== null && job.status === "downloading" ? `약 ${formatDuration(eta)}` : "—"],
  ].forEach(([label, value]) => {
    metrics.append(createElement("div", { className: "metric" }, [
      createElement("span", { text: label }),
      createElement("strong", { text: value, title: value }),
    ]));
  });
  card.append(metrics);

  const path = job.outputPath || job.outputDir;
  if (path) {
    const pathLine = createElement("div", { className: "job-path", title: path });
    pathLine.append(createElement("span", { text: "저장" }), createElement("code", { text: path }), createCopyButton(path, "저장 경로"));
    card.append(pathLine);
  }
  if (job.error) card.append(createElement("p", { className: "job-error", text: job.error }));
  return card;
}

function segmentText(job) {
  if (job.totalSegments > 0) return `${numberFormatter.format(job.completedSegments)} / ${numberFormatter.format(job.totalSegments)}`;
  if (job.completedSegments > 0) return numberFormatter.format(job.completedSegments);
  return "—";
}

function progressDetail(job) {
  const quality = job.selectedQuality || job.preferredQuality;
  const pieces = [];
  if (job.skipped) pieces.push("기존 파일 사용");
  if (quality > 0) pieces.push(`${quality}p`);
  if (job.totalSegments > 0) pieces.push(`${segmentText(job)} 세그먼트`);
  if (job.attempts > 1) pieces.push(`${job.attempts}번째 시도`);
  return pieces.join(" · ") || STATUS_META[job.status]?.description || "진행 정보 없음";
}

function formatPercent(value) {
  const percent = clamp(finiteNumber(value, 0), 0, 100);
  if (percent >= 100 || Number.isInteger(percent)) return String(Math.round(percent));
  return percent.toFixed(1);
}

function parseTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jobElapsedSeconds(job) {
  if (Number.isFinite(job.elapsedSeconds) && job.elapsedSeconds >= 0) return job.elapsedSeconds;
  const started = parseTime(job.startedAt);
  if (!started) return null;
  const ended = parseTime(job.finishedAt) || (ACTIVE_STATUSES.has(job.status) ? new Date() : parseTime(job.updatedAt));
  if (!ended) return null;
  return Math.max(0, (ended.getTime() - started.getTime()) / 1000);
}

function jobEtaSeconds(job, speed, elapsed) {
  if (Number.isFinite(job.etaSeconds) && job.etaSeconds >= 0) return job.etaSeconds;
  if (job.totalBytes > job.bytesWritten && speed > 0) return (job.totalBytes - job.bytesWritten) / speed;
  if (job.percent > 0 && job.percent < 100 && elapsed && elapsed > 0) {
    return Math.max(0, (elapsed / (job.percent / 100)) - elapsed);
  }
  return null;
}

function formatDuration(secondsValue) {
  if (!Number.isFinite(secondsValue) || secondsValue < 0) return "—";
  const total = Math.round(secondsValue);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours) return `${hours}시간 ${minutes}분`;
  if (minutes) return `${minutes}분 ${seconds}초`;
  return `${seconds}초`;
}

function formatBytes(bytesValue) {
  const bytes = finiteNumber(bytesValue, NaN);
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  const digits = index === 0 || value >= 100 ? 0 : (value >= 10 ? 1 : 2);
  return `${value.toFixed(digits)} ${units[index]}`;
}

function formatDate(value) {
  const date = parseTime(value);
  return date ? dateFormatter.format(date) : "—";
}

function renderHistory() {
  const jobs = state.history?.jobs || [];
  dom.historyList.replaceChildren();
  const showEmpty = !state.historyLoading && !state.historyError && jobs.length === 0;
  dom.historyEmpty.hidden = !showEmpty;
  if (showEmpty) {
    const filtered = Boolean(state.query.status || state.query.search);
    setText(dom.historyEmptyTitle, filtered ? "조건에 맞는 작업이 없습니다." : "아직 작업 기록이 없습니다.");
    setText(dom.historyEmptyDescription, filtered ? "검색어나 상태 필터를 바꿔 보세요." : "첫 다운로드를 추가해 기록을 만들어 보세요.");
  }

  if (jobs.length) {
    const fragment = document.createDocumentFragment();
    jobs.forEach((job) => fragment.append(createHistoryRow(job)));
    dom.historyList.append(fragment);
  }
  renderPagination();
}

function createHistoryRow(job) {
  const row = createElement("article", { className: "history-row", attrs: { "aria-label": displayTitle(job) } });
  const primary = createElement("div", { className: "history-primary" });
  const titleLine = createElement("div", { className: "history-title-line" });
  titleLine.append(
    createElement("strong", { className: "history-title", text: displayTitle(job), title: displayTitle(job) }),
    createCopyButton(job.url || job.outputPath, job.url ? "URL" : "저장 경로"),
  );
  primary.append(titleLine, createElement("span", { className: "history-url", text: compactUrl(job.url), title: job.url || "" }));

  const status = createElement("div", { className: "history-status" }, createStatusChip(job.status));
  const progress = createElement("div", { className: "history-progress" }, [
    createElement("span", { className: "mobile-label", text: "진행" }),
    createElement("strong", { text: job.status === "completed" ? formatBytes(job.bytesWritten) : `${formatPercent(job.percent)}%` }),
    createElement("small", { text: job.skipped ? "기존 파일 사용" : (job.selectedQuality ? `${job.selectedQuality}p` : segmentText(job)) }),
  ]);
  const date = createElement("div", { className: "history-date" }, [
    createElement("span", { className: "mobile-label", text: "등록" }),
    createElement("strong", { text: formatDate(job.createdAt) }),
    createElement("small", { text: job.finishedAt ? `종료 ${formatDate(job.finishedAt)}` : STATUS_META[job.status]?.description }),
  ]);
  const actions = createElement("div", { className: "history-actions" });
  actionsForStatus(job.status).forEach((action) => actions.append(createActionButton(job, action, true)));
  row.append(primary, status, progress, date, actions);
  return row;
}

function renderPagination() {
  const pagination = state.history?.pagination;
  if (!pagination || pagination.total <= pagination.limit && pagination.offset === 0) {
    dom.pagination.hidden = true;
    return;
  }
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const page = clamp(Math.floor(pagination.offset / pagination.limit) + 1, 1, totalPages);
  dom.pagination.hidden = false;
  dom.previousPage.disabled = pagination.offset <= 0;
  dom.nextPage.disabled = !pagination.hasMore;
  setText(dom.pageLabel, `${numberFormatter.format(page)} / ${numberFormatter.format(totalPages)} 페이지`);
}

function getInputUrls() {
  return [...new Set(dom.urlsInput.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAbsolutePath(value) {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function setFieldError(input, errorNode, message) {
  input.setAttribute("aria-invalid", message ? "true" : "false");
  setText(errorNode, message);
}

function validateComposer() {
  const urls = getInputUrls();
  let valid = true;
  if (!urls.length) {
    setFieldError(dom.urlsInput, dom.urlsError, "URL을 한 개 이상 입력해 주세요.");
    valid = false;
  } else {
    const invalidCount = urls.filter((url) => !isHttpUrl(url)).length;
    const message = invalidCount ? `올바르지 않은 URL ${invalidCount}개를 확인해 주세요.` : "";
    setFieldError(dom.urlsInput, dom.urlsError, message);
    valid = valid && !invalidCount;
  }

  const path = dom.outputDir.value.trim();
  if (!path) {
    setFieldError(dom.outputDir, dom.pathError, "저장 경로를 입력해 주세요.");
    valid = false;
  } else if (!isAbsolutePath(path)) {
    setFieldError(dom.outputDir, dom.pathError, "절대 경로로 입력해 주세요.");
    valid = false;
  } else {
    setFieldError(dom.outputDir, dom.pathError, "");
  }
  return { valid, urls, outputDir: path };
}

function setButtonBusy(button, busy, busyLabel = "처리 중…") {
  if (busy) {
    if (!savedButtonContents.has(button)) savedButtonContents.set(button, Array.from(button.childNodes));
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.replaceChildren(document.createTextNode(busyLabel));
  } else {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    if (savedButtonContents.has(button)) {
      button.replaceChildren(...savedButtonContents.get(button));
      savedButtonContents.delete(button);
    }
  }
}

async function submitJobs(event) {
  event.preventDefault();
  const result = validateComposer();
  if (!result.valid) {
    const firstInvalid = dom.addJobsForm.querySelector("[aria-invalid='true']");
    firstInvalid?.focus();
    return;
  }

  setButtonBusy(dom.submitJobsButton, true, "큐에 추가하는 중…");
  try {
    await saveConcurrency({ quiet: true });
    const payload = await apiRequest(API.jobs, {
      method: "POST",
      body: {
        urls: result.urls,
        outputDir: result.outputDir,
        preferredQuality: Number(dom.qualityInput.value),
        overwrite: dom.overwriteInput.checked,
      },
    });
    const createdCount = Array.isArray(payload?.created) ? payload.created.length : result.urls.length;
    const skippedCount = Array.isArray(payload?.skipped) ? payload.skipped.length : 0;
    dom.urlsInput.value = "";
    updateUrlCount();
    setFieldError(dom.urlsInput, dom.urlsError, "");
    const suffix = skippedCount ? ` · 중복 ${skippedCount}개 건너뜀` : "";
    showToast(`${createdCount}개 작업을 큐에 추가했습니다${suffix}.`);
    await refreshDashboard({ background: true });
  } catch (error) {
    showToast(error.message || "작업을 추가하지 못했습니다.", { error: true, duration: 6000 });
  } finally {
    setButtonBusy(dom.submitJobsButton, false);
  }
}

function updateUrlCount() {
  const count = getInputUrls().length;
  setText(dom.urlCount, `${numberFormatter.format(count)}개`);
  if (count) setFieldError(dom.urlsInput, dom.urlsError, "");
}

async function expandRange() {
  const startUrl = dom.rangeStart.value.trim();
  const endUrl = dom.rangeEnd.value.trim();
  if (!isHttpUrl(startUrl) || !isHttpUrl(endUrl)) {
    showToast("시작과 끝 URL을 모두 올바르게 입력해 주세요.", { error: true });
    (!isHttpUrl(startUrl) ? dom.rangeStart : dom.rangeEnd).focus();
    return;
  }
  setButtonBusy(dom.expandRangeButton, true, "생성 중…");
  try {
    const payload = await apiRequest(API.ranges, { method: "POST", body: { startUrl, endUrl } });
    const generated = Array.isArray(payload?.urls) ? payload.urls.filter((url) => typeof url === "string") : [];
    if (!generated.length) throw new ApiError("생성된 URL이 없습니다. 숫자 범위를 확인해 주세요.");
    const combined = [...new Set([...getInputUrls(), ...generated])];
    dom.urlsInput.value = combined.join("\n");
    updateUrlCount();
    dom.rangeStart.value = "";
    dom.rangeEnd.value = "";
    dom.rangeBuilder.open = false;
    showToast(`${generated.length}개 URL을 입력 목록에 추가했습니다.`);
    dom.urlsInput.focus();
  } catch (error) {
    showToast(error.message || "URL 범위를 만들지 못했습니다.", { error: true, duration: 6000 });
  } finally {
    setButtonBusy(dom.expandRangeButton, false);
  }
}

async function saveConcurrency({ quiet = false } = {}) {
  const concurrency = clamp(Math.round(finiteNumber(dom.concurrencyInput.value, 4)), 1, 8);
  dom.concurrencyInput.value = String(concurrency);
  if (concurrency === state.lastSavedConcurrency) return true;
  try {
    await apiRequest(API.settings, { method: "PATCH", body: { concurrency } });
    state.lastSavedConcurrency = concurrency;
    state.concurrencyDirty = false;
    if (!quiet) showToast(`동시 작업 수를 ${concurrency}개로 저장했습니다.`);
    return true;
  } catch (error) {
    showToast(error.message || "동시 작업 설정을 저장하지 못했습니다.", { error: true });
    return false;
  }
}

async function handleListClick(event) {
  const copyButton = event.target.closest("[data-copy-value]");
  if (copyButton) {
    await copyText(copyButton.dataset.copyValue || "");
    return;
  }
  const actionButton = event.target.closest("[data-job-action]");
  if (!actionButton) return;
  await runJobAction(actionButton);
}

async function copyText(value) {
  if (!value) return;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const helper = document.createElement("textarea");
      helper.value = value;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      const copied = document.execCommand("copy");
      helper.remove();
      if (!copied) throw new Error("copy failed");
    }
    showToast("클립보드에 복사했습니다.", { duration: 2200 });
  } catch {
    showToast("복사하지 못했습니다. 텍스트를 직접 선택해 주세요.", { error: true });
  }
}

async function runJobAction(button) {
  const action = button.dataset.jobAction;
  const id = button.dataset.jobId;
  if (!action || !id) return;
  const meta = ACTION_META[action];

  if (action === "cancel" || action === "delete") {
    const confirmed = await askConfirmation({
      title: action === "delete" ? "작업 기록을 삭제할까요?" : "다운로드를 취소할까요?",
      message: action === "delete"
        ? "목록의 기록만 삭제합니다. 이미 저장된 파일은 삭제하지 않습니다."
        : "진행 중인 다운로드가 중단됩니다. 필요하면 나중에 다시 시도할 수 있습니다.",
      confirmLabel: action === "delete" ? "기록 삭제" : "다운로드 취소",
    });
    if (!confirmed) return;
  }

  setButtonBusy(button, true, "…");
  try {
    const endpoint = `${API.jobs}/${encodeURIComponent(id)}`;
    if (action === "delete") {
      await apiRequest(endpoint, { method: "DELETE" });
    } else {
      await apiRequest(`${endpoint}/action`, { method: "POST", body: { action } });
    }
    showToast(`${meta.label} 요청을 처리했습니다.`);
    await refreshDashboard({ background: true });
  } catch (error) {
    showToast(error.message || `${meta.label} 요청을 처리하지 못했습니다.`, { error: true, duration: 6000 });
    setButtonBusy(button, false);
  }
}

async function runBulkAction(action, button) {
  const retrying = action === "retry_failed";
  const confirmed = retrying || await askConfirmation({
    title: "활성 작업을 모두 취소할까요?",
    message: "대기·분석·다운로드·일시정지 상태의 모든 작업이 취소됩니다.",
    confirmLabel: "모두 취소",
  });
  if (!confirmed) return;

  setButtonBusy(button, true, retrying ? "재시도 요청 중…" : "취소 중…");
  try {
    const payload = await apiRequest(API.jobActions, { method: "POST", body: { action } });
    const count = Array.isArray(payload?.updated) ? payload.updated.length : finiteNumber(payload?.updated, NaN);
    const countText = Number.isFinite(count) ? `${numberFormatter.format(count)}개 ` : "";
    showToast(retrying ? `${countText}실패 작업을 다시 큐에 넣었습니다.` : `${countText}활성 작업을 취소했습니다.`);
    await refreshDashboard({ background: true });
  } catch (error) {
    showToast(error.message || "일괄 작업을 처리하지 못했습니다.", { error: true, duration: 6000 });
  } finally {
    setButtonBusy(button, false);
    renderSummary();
  }
}

function askConfirmation({ title, message, confirmLabel }) {
  if (typeof dom.confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  setText(dom.confirmTitle, title);
  setText(dom.confirmMessage, message);
  setText(dom.confirmButton, confirmLabel);
  dom.confirmDialog.returnValue = "";
  return new Promise((resolve) => {
    const onClose = () => resolve(dom.confirmDialog.returnValue === "confirm");
    dom.confirmDialog.addEventListener("close", onClose, { once: true });
    dom.confirmDialog.showModal();
  });
}

function showToast(message, { error = false, duration = 3800 } = {}) {
  const toast = createElement("div", {
    className: `toast${error ? " is-error" : ""}`,
    text: message,
    attrs: { role: error ? "alert" : "status" },
  });
  dom.toastRegion.append(toast);
  while (dom.toastRegion.children.length > 4) dom.toastRegion.firstElementChild?.remove();
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 200);
  }, duration);
}

function setConnection(status, label, detail) {
  dom.connectionStatus.dataset.state = status;
  setText(dom.connectionLabel, label);
  setText(dom.connectionDetail, detail);
}

function isHeartbeatEvent(event) {
  const eventType = String(event?.type || "").toLowerCase();
  if (eventType === "heartbeat" || eventType === "ping") return true;
  const data = String(event?.data || "").trim();
  if (!data) return false;
  if (["heartbeat", "ping", ":heartbeat"].includes(data.toLowerCase())) return true;
  try {
    const parsed = JSON.parse(data);
    const type = String(parsed?.type || parsed?.event || "").toLowerCase();
    return type === "heartbeat" || type === "ping";
  } catch {
    return false;
  }
}

function handleServerEvent(event) {
  if (!isHeartbeatEvent(event)) scheduleRefresh();
}

function connectEvents() {
  window.clearTimeout(state.reconnectTimer);
  state.eventSource?.close();
  state.eventSource = null;
  state.streamOpen = false;

  if (!("EventSource" in window)) {
    startPolling();
    setConnection("polling", "연결됨 · 폴링", "브라우저가 실시간 연결을 지원하지 않습니다");
    return;
  }

  setConnection("pending", "실시간 연결 중", "변경 알림 채널을 여는 중입니다");
  const source = new EventSource(API.events);
  state.eventSource = source;

  source.addEventListener("open", () => {
    if (source !== state.eventSource) return;
    state.streamOpen = true;
    state.reconnectDelay = 5000;
    stopPolling();
    setConnection("online", "서버 연결됨", "실시간 업데이트 사용 중");
  });
  source.addEventListener("message", handleServerEvent);
  ["dashboard", "job", "update", "change"].forEach((type) => source.addEventListener(type, handleServerEvent));
  source.addEventListener("heartbeat", () => {});
  source.addEventListener("ping", () => {});
  source.addEventListener("error", () => {
    if (source !== state.eventSource) return;
    source.close();
    state.eventSource = null;
    state.streamOpen = false;
    startPolling();
    setConnection("polling", "연결됨 · 폴링", "실시간 연결 복구를 기다리는 중");
    state.reconnectTimer = window.setTimeout(connectEvents, state.reconnectDelay);
    state.reconnectDelay = Math.min(state.reconnectDelay * 1.6, 30000);
  });
}

function startPolling() {
  if (state.pollTimer) return;
  state.pollTimer = window.setInterval(() => {
    if (!document.hidden) refreshDashboard({ background: true });
  }, 5000);
}

function stopPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = null;
}

async function checkHealth() {
  try {
    await apiRequest(API.health);
    if (!state.streamOpen) setConnection("polling", "서버 연결됨", "실시간 연결을 준비하는 중");
  } catch (error) {
    if (error instanceof ApiError && error.status === 503 && error.payload?.status === "degraded") {
      const checks = isObject(error.payload.checks) ? error.payload.checks : {};
      const failures = [];
      if (checks.database === false) failures.push("데이터베이스");
      if (checks.outputDirectory === false) failures.push("저장 경로");
      const detail = failures.length ? `${failures.join(" · ")} 점검 필요` : "서버 상태 점검 필요";
      setConnection("polling", "서버 점검 필요", detail);
      return;
    }
    if (!state.streamOpen) setConnection("offline", "서버 연결 끊김", error.message || "서버 응답 없음");
  }
}

function selectStatus(status) {
  state.query.status = status;
  state.query.offset = 0;
  dom.statusTabs.forEach((tab) => {
    const selected = tab.dataset.status === status;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected) dom.historyList.setAttribute("aria-labelledby", tab.id);
  });
  refreshDashboard();
}

function movePage(direction) {
  const pagination = state.history?.pagination || { limit: state.query.limit };
  state.query.offset = Math.max(0, state.query.offset + direction * pagination.limit);
  refreshDashboard();
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  byId("history")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function bindEvents() {
  dom.addJobsForm.addEventListener("submit", submitJobs);
  dom.urlsInput.addEventListener("input", updateUrlCount);
  dom.outputDir.addEventListener("input", () => {
    state.outputDirDirty = true;
    if (dom.outputDir.value.trim()) setFieldError(dom.outputDir, dom.pathError, "");
  });
  dom.concurrencyInput.addEventListener("input", () => { state.concurrencyDirty = true; });
  dom.concurrencyInput.addEventListener("change", () => saveConcurrency());
  dom.stepButtons.forEach((button) => button.addEventListener("click", () => {
    const current = finiteNumber(dom.concurrencyInput.value, 4);
    const next = clamp(current + finiteNumber(button.dataset.step, 0), 1, 8);
    dom.concurrencyInput.value = String(next);
    state.concurrencyDirty = true;
    saveConcurrency();
  }));
  dom.expandRangeButton.addEventListener("click", expandRange);
  dom.queueList.addEventListener("click", handleListClick);
  dom.historyList.addEventListener("click", handleListClick);
  dom.cancelAllButton.addEventListener("click", () => runBulkAction("cancel_all", dom.cancelAllButton));
  dom.retryFailedButton.addEventListener("click", () => runBulkAction("retry_failed", dom.retryFailedButton));
  dom.statusTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectStatus(tab.dataset.status || ""));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % dom.statusTabs.length;
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + dom.statusTabs.length) % dom.statusTabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = dom.statusTabs.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const nextTab = dom.statusTabs[nextIndex];
      nextTab.focus();
      selectStatus(nextTab.dataset.status || "");
    });
  });
  dom.refreshButtons.forEach((button) => button.addEventListener("click", () => refreshDashboard()));
  dom.manualRefreshButton.addEventListener("click", async () => {
    dom.manualRefreshButton.disabled = true;
    const refreshed = await refreshDashboard();
    dom.manualRefreshButton.disabled = false;
    showToast(
      refreshed ? "최신 상태로 새로고침했습니다." : "일부 상태를 새로고치지 못했습니다.",
      { error: !refreshed, duration: refreshed ? 2200 : 5000 },
    );
  });
  dom.previousPage.addEventListener("click", () => movePage(-1));
  dom.nextPage.addEventListener("click", () => movePage(1));

  let searchTimer;
  dom.searchInput.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query.search = dom.searchInput.value.trim();
      state.query.offset = 0;
      refreshDashboard();
    }, 350);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleRefresh(0);
      if (!state.streamOpen && !state.eventSource) connectEvents();
    }
  });
  window.addEventListener("beforeunload", () => {
    state.eventSource?.close();
    state.refreshController?.abort();
    stopPolling();
    window.clearTimeout(state.refreshTimer);
    window.clearTimeout(state.reconnectTimer);
    window.clearInterval(state.healthTimer);
  });
}

function observeNavigation() {
  if (!("IntersectionObserver" in window)) return;
  const links = Array.from(document.querySelectorAll(".side-nav a"));
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    links.forEach((link) => link.classList.toggle("is-current", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-20% 0px -68% 0px", threshold: [0, 0.1, 0.5] });
  sections.forEach((section) => observer.observe(section));
}

async function init() {
  cacheDom();
  bindEvents();
  observeNavigation();
  updateUrlCount();
  await Promise.all([refreshDashboard(), checkHealth()]);
  connectEvents();
  state.healthTimer = window.setInterval(checkHealth, 30000);
}

init();
