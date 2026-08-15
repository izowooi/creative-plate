"use strict";

const state = {
  config: null,
  counts: {},
  items: [],
  view: "active",
  query: "",
  editing: null,
  scheduleAction: null,
  scheduleAnchors: { reminder: null, schedule: null },
  previews: { reminder: null, schedule: null },
  previewSerial: { reminder: 0, schedule: 0 },
  selectedFiles: [],
  serverOffset: 0,
  confirmResolver: null,
  deepLink: new URLSearchParams(window.location.search).get("reminder"),
};

const byId = (id) => document.getElementById(id);
function createElement(tag, options = {}, ...children) {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  if (options.type) element.type = options.type;
  if (options.title) element.title = options.title;
  if (options.href) element.href = options.href;
  if (options.hidden) element.hidden = true;
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      if (value !== null && value !== undefined) element.setAttribute(name, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    element.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return element;
}

function button(label, onClick, className = "card-action") {
  const element = createElement("button", { className, text: label, type: "button" });
  element.addEventListener("click", onClick);
  return element;
}

function setBusy(element, busy) {
  element.disabled = busy;
  element.setAttribute("aria-busy", String(busy));
}

function errorMessage(error) {
  const detail = error?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg || "입력값 오류").join(" · ");
  if (typeof detail === "string") return detail;
  return error?.message || "요청을 처리하지 못했습니다.";
}

async function api(path, options = {}) {
  const init = { ...options, headers: { Accept: "application/json", ...(options.headers || {}) } };
  if (init.body && typeof init.body !== "string") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(init.body);
  }
  const response = await fetch(path, init);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(typeof data?.detail === "string" ? data.detail : `HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function toast(message, tone = "ok") {
  const item = createElement("div", { className: "toast", attrs: { role: "status" } });
  item.dataset.tone = tone;
  item.append(
    createElement("span", { className: "toast-icon", text: tone === "error" ? "!" : "✓" }),
    createElement("span", { text: message }),
  );
  byId("toast-region").append(item);
  window.setTimeout(() => {
    item.classList.add("is-leaving");
    window.setTimeout(() => item.remove(), 190);
  }, 3600);
}

function setInlineError(id, message) {
  const element = byId(id);
  element.textContent = message || "";
  element.hidden = !message;
}

function nowFromServer() {
  return new Date(Date.now() + state.serverOffset);
}

function formatDateTime(value, timezone) {
  if (!value) return "시각 없음";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone || state.config?.timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString("ko-KR");
  }
}

function relativeDue(value, status) {
  if (!value) return "시각 없음";
  if (status === "completed") return "완료됨";
  if (status === "cancelled") return "취소됨";
  if (status === "acknowledged") return "확인됨 · 완료 대기";
  const milliseconds = new Date(value).getTime() - nowFromServer().getTime();
  const overdue = milliseconds <= 0;
  const absoluteSeconds = Math.abs(milliseconds) / 1000;
  let amount;
  let unit;
  if (absoluteSeconds < 60) {
    amount = Math.max(1, Math.round(absoluteSeconds));
    unit = "초";
  } else if (absoluteSeconds < 3600) {
    amount = Math.round(absoluteSeconds / 60);
    unit = "분";
  } else if (absoluteSeconds < 86400) {
    amount = Math.round(absoluteSeconds / 3600);
    unit = "시간";
  } else if (absoluteSeconds < 86400 * 30) {
    amount = Math.round(absoluteSeconds / 86400);
    unit = "일";
  } else {
    amount = Math.round(absoluteSeconds / (86400 * 30));
    unit = "개월";
  }
  return overdue ? `${amount}${unit} 지남` : `${amount}${unit} 후`;
}

function renderClock() {
  const now = nowFromServer();
  const timezone = state.config?.timezone || "Asia/Seoul";
  try {
    byId("server-clock").textContent = new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: timezone,
    }).format(now);
    byId("server-date").textContent = new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "full",
      timeZone: timezone,
    }).format(now);
  } catch {
    byId("server-clock").textContent = now.toLocaleTimeString("ko-KR");
    byId("server-date").textContent = now.toLocaleDateString("ko-KR");
  }
}

function updateHealth(config) {
  const slack = byId("slack-health");
  slack.dataset.tone = config.slack_configured ? "ok" : "warn";
  byId("slack-health-text").textContent = config.slack_configured ? "연결됨" : "미설정";

  const worker = byId("worker-health");
  const heartbeat = config.worker_state?.heartbeat_at;
  const ageSeconds = heartbeat ? (Date.now() - new Date(heartbeat).getTime()) / 1000 : Infinity;
  const healthyAge = Math.max(120, (config.poll_interval_seconds || 30) * 4);
  if (heartbeat && ageSeconds <= healthyAge && !config.worker_state?.last_error) {
    worker.dataset.tone = "ok";
    byId("worker-health-text").textContent = "동작 중";
  } else if (heartbeat) {
    worker.dataset.tone = "warn";
    byId("worker-health-text").textContent = config.worker_state?.last_error ? "점검 필요" : "응답 지연";
  } else {
    worker.dataset.tone = "warn";
    byId("worker-health-text").textContent = "기록 없음";
  }
  const footerBits = [config.slack_configured ? "Slack 연결됨" : "Slack 미설정"];
  if (config.failed_delivery_count) footerBits.push(`전송 점검 ${config.failed_delivery_count}건`);
  if (heartbeat) footerBits.push(`worker ${formatDateTime(heartbeat, config.timezone)}`);
  byId("footer-health").textContent = footerBits.join(" · ");
}

function updateCounts(counts) {
  const active = (counts.overdue || 0) + (counts.upcoming || 0) + (counts.acknowledged || 0);
  for (const key of ["overdue", "upcoming", "acknowledged", "completed"]) {
    byId(`count-${key}`).textContent = String(counts[key] || 0);
  }
  const tabCounts = { ...counts, active };
  for (const [key, value] of Object.entries(tabCounts)) {
    const element = byId(`tab-count-${key}`);
    if (element) element.textContent = String(value || 0);
  }
}

async function loadConfig() {
  const config = await api("/api/config");
  state.config = config;
  state.serverOffset = new Date(config.server_now).getTime() - Date.now();
  byId("timezone-label").textContent = config.timezone;
  if (!byId("reminder-timezone").value) byId("reminder-timezone").value = config.timezone;
  if (!byId("schedule-timezone").value) byId("schedule-timezone").value = config.timezone;
  state.counts = config.counts;
  updateCounts(config.counts);
  updateHealth(config);
  renderClock();
}

async function loadReminders({ showLoading = true } = {}) {
  if (showLoading) {
    byId("loading-state").hidden = false;
    byId("reminder-panel").setAttribute("aria-busy", "true");
  }
  byId("global-error").hidden = true;
  const params = new URLSearchParams({ view: state.view });
  if (state.query) params.set("q", state.query);
  try {
    const payload = await api(`/api/reminders?${params}`);
    state.items = payload.items;
    state.counts = payload.counts;
    state.serverOffset = new Date(payload.server_now).getTime() - Date.now();
    updateCounts(payload.counts);
    renderReminders();
    byId("sync-status").textContent = `${formatDateTime(payload.server_now, state.config?.timezone)} 동기화`;
  } catch (error) {
    byId("global-error-message").textContent = errorMessage(error);
    byId("global-error").hidden = false;
  } finally {
    byId("loading-state").hidden = true;
    byId("reminder-panel").setAttribute("aria-busy", "false");
  }
}

async function refreshAll(options = {}) {
  await Promise.allSettled([loadConfig(), loadReminders(options)]);
}

function statusInfo(reminder) {
  if (reminder.status === "completed") return ["completed", "완료"];
  if (reminder.status === "cancelled") return ["cancelled", "취소"];
  if (reminder.status === "acknowledged") return ["acknowledged", "확인함"];
  if (reminder.is_overdue) return ["overdue", "놓침"];
  return ["upcoming", "예정"];
}

function metaItem(icon, content) {
  const item = createElement("span", { className: "card-meta-item" });
  item.append(createElement("span", { className: "card-meta-icon", text: icon, attrs: { "aria-hidden": "true" } }));
  item.append(content instanceof Node ? content : createElement("span", { text: content }));
  return item;
}

function renderReminderCard(reminder) {
  const [tone, statusLabel] = statusInfo(reminder);
  const card = createElement("li", {
    className: "reminder-card",
    attrs: { id: `reminder-${reminder.id}`, tabindex: "-1" },
  });
  card.dataset.tone = tone;
  const content = createElement("article", { className: "card-content" });
  const top = createElement("div", { className: "card-top" });
  const heading = createElement("div", { className: "card-heading" });
  const badges = createElement("div", { className: "card-badges" });
  badges.append(createElement("span", { className: `status-badge ${tone}`, text: statusLabel }));
  if (reminder.project) badges.append(createElement("span", { className: "meta-chip", text: reminder.project }));
  if (reminder.notification_count) {
    badges.append(createElement("span", { className: "delivery-chip", text: `Slack ${reminder.notification_count}회` }));
  }
  heading.append(badges, createElement("h3", { className: "card-title", text: reminder.title }));
  const due = createElement("div", { className: "due-block" });
  due.append(
    createElement("strong", { className: "due-relative", text: relativeDue(reminder.due_at, reminder.status) }),
    createElement("span", { className: "due-absolute", text: formatDateTime(reminder.due_at, reminder.timezone) }),
  );
  top.append(heading, due);
  content.append(top);

  const meta = createElement("div", { className: "card-meta" });
  if (reminder.destination_url) {
    const link = createElement("a", {
      className: "destination-link",
      text: reminder.destination_label,
      href: reminder.destination_url,
      attrs: { target: "_blank", rel: "noopener noreferrer" },
    });
    meta.append(metaItem("↗", link));
  } else {
    meta.append(metaItem("→", reminder.destination_label));
  }
  if (reminder.source_label || reminder.source_ref) {
    meta.append(metaItem("⌁", [reminder.source_label, reminder.source_ref].filter(Boolean).join(" · ")));
  }
  content.append(meta);

  const promptPanel = createElement("div", { className: "prompt-panel" });
  const prompt = createElement("pre", { text: reminder.prompt_text });
  const copy = button("⧉", async () => copyPrompt(reminder), "copy-button");
  copy.setAttribute("aria-label", `${reminder.title} 프롬프트 복사`);
  promptPanel.append(prompt, copy);
  if (reminder.prompt_text.length > 260 || reminder.prompt_text.split("\n").length > 4) {
    const expand = button("전체 보기", () => {
      const expanded = promptPanel.classList.toggle("is-expanded");
      expand.textContent = expanded ? "접기" : "전체 보기";
    }, "expand-prompt");
    promptPanel.append(expand);
  }
  content.append(promptPanel);

  if (reminder.notes) {
    const notes = createElement("details", { className: "card-notes" });
    notes.append(createElement("summary", { text: "메모 보기" }), createElement("p", { text: reminder.notes }));
    content.append(notes);
  }
  if (reminder.last_notification_error) {
    const warning = createElement("div", { className: "delivery-warning" });
    warning.append(
      createElement("span", { text: "!", attrs: { "aria-hidden": "true" } }),
      createElement("div", {},
        createElement("strong", { text: "Slack 전송 점검 필요" }),
        createElement("div", { text: reminder.last_notification_error }),
      ),
    );
    content.append(warning);
  }

  const footer = createElement("div", { className: "card-footer" });
  const primary = createElement("div", { className: "card-actions" });
  const secondary = createElement("div", { className: "card-secondary-actions" });
  primary.append(button("프롬프트 복사", () => copyPrompt(reminder)));
  if (reminder.status === "open") {
    primary.append(
      button("확인", () => mutateReminder(reminder, "acknowledge", "알림을 확인했습니다.")),
      button("미루기", () => openScheduleDialog(reminder, "snooze")),
      button("완료", () => mutateReminder(reminder, "complete", "리마인더를 완료했습니다."), "card-action primary-action"),
    );
    if (reminder.last_notification_error) {
      primary.append(button("Slack 재시도", () => mutateReminder(reminder, "retry", "Slack 전송을 다시 시도합니다.")));
    }
  } else if (reminder.status === "acknowledged") {
    primary.append(
      button("다시 알림", () => openScheduleDialog(reminder, "snooze")),
      button("완료", () => mutateReminder(reminder, "complete", "리마인더를 완료했습니다."), "card-action primary-action"),
    );
  } else {
    primary.append(button("다시 열기", () => openScheduleDialog(reminder, "reopen"), "card-action primary-action"));
  }
  if (["open", "acknowledged"].includes(reminder.status)) {
    secondary.append(button("수정", () => openReminderDialog(reminder), "text-action"));
    secondary.append(button("취소", () => cancelReminder(reminder), "text-action"));
  }
  secondary.append(button("기록", () => openHistory(reminder), "text-action"));
  footer.append(primary, secondary);
  content.append(footer);
  card.append(content);
  return card;
}

function renderReminders() {
  const list = byId("reminder-list");
  list.replaceChildren(...state.items.map(renderReminderCard));
  const empty = state.items.length === 0;
  byId("empty-state").hidden = !empty;
  const emptyCopy = {
    overdue: ["놓친 리마인더가 없습니다", "지금 확인해야 할 프롬프트가 없어요."],
    upcoming: ["예정된 리마인더가 없습니다", "새 프롬프트 일정을 등록해 보세요."],
    acknowledged: ["확인한 항목이 없습니다", "Slack 알림을 확인하면 이곳에 남습니다."],
    completed: ["완료 기록이 없습니다", "실행을 마친 프롬프트가 이곳에 쌓입니다."],
    cancelled: ["취소한 항목이 없습니다", "취소한 리마인더를 다시 열 수도 있어요."],
  };
  const [title, description] = emptyCopy[state.view] || ["리마인더가 없습니다", "첫 프롬프트를 등록해 보세요."];
  byId("empty-title").textContent = state.query ? "검색 결과가 없습니다" : title;
  byId("empty-description").textContent = state.query ? "다른 검색어로 다시 찾아보세요." : description;
  byId("empty-create").hidden = Boolean(state.query);
  if (state.deepLink) {
    const target = byId(`reminder-${state.deepLink}`);
    if (target) {
      target.classList.add("is-highlighted");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.focus({ preventScroll: true });
      state.deepLink = null;
    }
  }
}

async function copyPrompt(reminder) {
  try {
    await navigator.clipboard.writeText(reminder.prompt_text);
    toast("프롬프트를 복사했습니다.");
  } catch {
    toast("클립보드에 복사하지 못했습니다.", "error");
  }
}

async function mutateReminder(reminder, action, successMessage, extra = {}) {
  try {
    await api(`/api/reminders/${encodeURIComponent(reminder.id)}/${action}`, {
      method: "POST",
      body: { expected_version: reminder.occurrence_version, ...extra },
    });
    toast(successMessage);
    await refreshAll({ showLoading: false });
  } catch (error) {
    toast(errorMessage(error), "error");
    if (error.status === 409) await loadReminders({ showLoading: false });
  }
}

async function cancelReminder(reminder) {
  const confirmed = await confirmAction({
    title: "리마인더를 취소할까요?",
    message: "Slack 알림이 중지됩니다. 기록은 남고 나중에 다시 열 수 있습니다.",
    label: "취소하기",
  });
  if (confirmed) await mutateReminder(reminder, "cancel", "리마인더를 취소했습니다.");
}

function scheduleInput(prefix) {
  const radioName = prefix === "reminder" ? "schedule_type" : "secondary_schedule_type";
  const type = document.querySelector(`input[name="${radioName}"]:checked`)?.value || "relative";
  const timezone = byId(`${prefix}-timezone`).value.trim();
  if (!timezone) throw new Error("시간대를 입력해 주세요.");
  if (type === "relative") {
    const amount = Number.parseInt(byId(`${prefix}-amount`).value, 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw new Error("수량은 1 이상이어야 합니다.");
    return {
      type,
      timezone,
      amount,
      unit: byId(`${prefix}-unit`).value,
      anchor_at: state.scheduleAnchors[prefix] || new Date().toISOString(),
    };
  }
  const local = byId(`${prefix}-local-datetime`).value;
  if (!local) throw new Error("날짜와 시간을 입력해 주세요.");
  const foldValue = byId(`${prefix}-fold`).value;
  return {
    type,
    timezone,
    local_datetime: local,
    ...(foldValue === "" ? {} : { fold: Number.parseInt(foldValue, 10) }),
  };
}

function toggleSchedulePane(prefix) {
  const radioName = prefix === "reminder" ? "schedule_type" : "secondary_schedule_type";
  const type = document.querySelector(`input[name="${radioName}"]:checked`)?.value || "relative";
  byId(`${prefix}-relative-pane`).hidden = type !== "relative";
  byId(`${prefix}-exact-pane`).hidden = type !== "exact";
  previewSchedule(prefix);
}

async function previewSchedule(prefix, { required = false } = {}) {
  const container = byId(`${prefix}-schedule-preview`);
  const text = byId(`${prefix}-preview-text`);
  const serial = ++state.previewSerial[prefix];
  container.className = "schedule-preview is-loading";
  text.textContent = "실제 알림 시각을 확인하고 있습니다…";
  try {
    const schedule = scheduleInput(prefix);
    const preview = await api("/api/schedule/preview", { method: "POST", body: schedule });
    if (serial !== state.previewSerial[prefix]) return null;
    state.previews[prefix] = preview;
    container.className = `schedule-preview ${preview.is_past ? "is-warning" : "is-ready"}`;
    text.textContent = `${formatDateTime(preview.due_at, preview.timezone)} · ${preview.timezone}${preview.is_past ? " · 이미 지난 시각" : ""}`;
    return preview;
  } catch (error) {
    if (serial !== state.previewSerial[prefix]) return null;
    state.previews[prefix] = null;
    container.className = "schedule-preview is-error";
    text.textContent = errorMessage(error);
    if (required) throw error;
    return null;
  }
}

function setScheduleMode(prefix, type) {
  byId(`${prefix}-schedule-${type}`).checked = true;
  toggleSchedulePane(prefix);
}

function setRelativeSchedule(prefix, amount, unit) {
  state.scheduleAnchors[prefix] = new Date().toISOString();
  byId(`${prefix}-amount`).value = String(amount);
  byId(`${prefix}-unit`).value = unit;
  for (const item of document.querySelectorAll(`[data-schedule-prefix="${prefix}"]`)) {
    item.classList.toggle("is-selected", item.dataset.amount === String(amount) && item.dataset.unit === unit);
  }
  setScheduleMode(prefix, "relative");
}

function defaultExactLocal() {
  const date = new Date(Date.now() + 3600 * 1000);
  date.setSeconds(0, 0);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function editingScheduleChanged(schedule) {
  if (!state.editing) return true;
  if (schedule.type !== "exact") return true;
  const originalLocal = (state.editing.due_local || "").slice(0, 16);
  return schedule.local_datetime !== originalLocal
    || schedule.timezone !== state.editing.timezone
    || Object.hasOwn(schedule, "fold");
}

function resetReminderForm(reminder = null, candidate = null) {
  const form = byId("reminder-form");
  form.reset();
  state.editing = reminder;
  state.scheduleAnchors.reminder = new Date().toISOString();
  state.previews.reminder = null;
  setInlineError("reminder-form-error", "");
  byId("candidate-message").hidden = true;
  byId("candidate-message").textContent = "";
  byId("reminder-dialog-kicker").textContent = reminder ? "EDIT REMINDER" : candidate ? "IMPORT CANDIDATE" : "NEW REMINDER";
  byId("reminder-dialog-title").textContent = reminder ? "리마인더 수정" : candidate ? "후보 확인 후 등록" : "새 리마인더";
  byId("reminder-submit").textContent = reminder ? "변경 저장" : "리마인더 저장";
  byId("reminder-timezone").value = reminder?.timezone || candidate?.timezone || state.config?.timezone || "Asia/Seoul";
  byId("reminder-title").value = reminder?.title || candidate?.title || "";
  byId("reminder-prompt").value = reminder?.prompt_text || candidate?.prompt_text || "";
  byId("destination-label").value = reminder?.destination_label || candidate?.destination_label || "";
  byId("destination-url").value = reminder?.destination_url || "";
  byId("project").value = reminder?.project || "";
  byId("source-label").value = reminder?.source_label || candidate?.source_label || "";
  byId("source-ref").value = reminder?.source_ref || candidate?.source_ref || "";
  byId("reminder-notes").value = reminder?.notes || "";
  byId("prompt-counter").textContent = `${byId("reminder-prompt").value.length.toLocaleString("ko-KR")}자`;
  if (reminder?.due_local || candidate?.due_local) {
    byId("reminder-local-datetime").value = (reminder?.due_local || candidate.due_local).slice(0, 16);
    byId("reminder-fold").value = "";
    setScheduleMode("reminder", "exact");
  } else {
    byId("reminder-local-datetime").value = defaultExactLocal();
    setRelativeSchedule("reminder", 1, "day");
  }
  if (candidate) {
    const message = candidate.requires_confirmation
      ? "이 후보는 날짜 또는 조건 확인이 필요합니다. 목적지와 일정을 직접 확인해 주세요."
      : "Markdown에서 찾은 후보입니다. 목적지와 prompt를 확인한 뒤 저장해 주세요.";
    byId("candidate-message").textContent = message;
    byId("candidate-message").hidden = false;
  }
  previewSchedule("reminder");
}

function openReminderDialog(reminder = null, candidate = null) {
  if (byId("import-dialog").open) byId("import-dialog").close();
  resetReminderForm(reminder, candidate);
  byId("reminder-dialog").showModal();
  byId("reminder-title").focus();
}

async function submitReminder(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  setInlineError("reminder-form-error", "");
  const submit = byId("reminder-submit");
  setBusy(submit, true);
  try {
    const schedule = scheduleInput("reminder");
    const includeSchedule = editingScheduleChanged(schedule);
    if (includeSchedule) {
      const preview = await previewSchedule("reminder", { required: true });
      if (preview?.is_past) {
        const confirmed = await confirmAction({
          title: "이미 지난 시각입니다",
          message: "저장하면 worker가 가능한 즉시 overdue 알림을 보냅니다. 계속할까요?",
          label: "그대로 저장",
          neutral: true,
        });
        if (!confirmed) return;
      }
    }
    const payload = {
      title: byId("reminder-title").value.trim(),
      prompt_text: byId("reminder-prompt").value.trim(),
      destination_label: byId("destination-label").value.trim(),
      destination_url: byId("destination-url").value.trim() || null,
      project: byId("project").value.trim() || null,
      notes: byId("reminder-notes").value.trim() || null,
      source_label: byId("source-label").value.trim() || null,
      source_ref: byId("source-ref").value.trim() || null,
    };
    if (includeSchedule) payload.schedule = schedule;
    if (state.editing) {
      await api(`/api/reminders/${encodeURIComponent(state.editing.id)}`, {
        method: "PATCH",
        body: { expected_version: state.editing.occurrence_version, ...payload },
      });
      toast("리마인더를 수정했습니다.");
    } else {
      await api("/api/reminders", { method: "POST", body: payload });
      toast("리마인더를 등록했습니다.");
    }
    byId("reminder-dialog").close();
    await refreshAll({ showLoading: false });
  } catch (error) {
    setInlineError("reminder-form-error", errorMessage(error));
    if (error.status === 409) await loadReminders({ showLoading: false });
  } finally {
    setBusy(submit, false);
  }
}

function openScheduleDialog(reminder, mode) {
  state.scheduleAction = { reminder, mode };
  state.scheduleAnchors.schedule = new Date().toISOString();
  state.previews.schedule = null;
  byId("schedule-form").reset();
  byId("schedule-timezone").value = reminder.timezone || state.config?.timezone || "Asia/Seoul";
  byId("schedule-local-datetime").value = defaultExactLocal();
  setInlineError("schedule-form-error", "");
  const reopen = mode === "reopen";
  byId("schedule-dialog-kicker").textContent = reopen ? "REOPEN" : "SNOOZE";
  byId("schedule-dialog-title").textContent = reopen ? "다시 열기" : "잠시 미루기";
  byId("schedule-dialog-description").textContent = reopen ? "다시 시작할 날짜를 정해 주세요." : "새로 알림 받을 시간을 정해 주세요.";
  byId("schedule-submit").textContent = reopen ? "이 일정으로 다시 열기" : "이 시간으로 미루기";
  setRelativeSchedule("schedule", reopen ? 1 : 1, reopen ? "day" : "hour");
  byId("schedule-dialog").showModal();
  byId("schedule-amount").focus();
}

async function submitSchedule(event) {
  event.preventDefault();
  const { reminder, mode } = state.scheduleAction || {};
  if (!reminder) return;
  const submit = byId("schedule-submit");
  setBusy(submit, true);
  setInlineError("schedule-form-error", "");
  try {
    const schedule = scheduleInput("schedule");
    const preview = await previewSchedule("schedule", { required: true });
    if (preview?.is_past) {
      const confirmed = await confirmAction({
        title: "이미 지난 시각입니다",
        message: "저장하면 즉시 overdue 상태가 됩니다. 계속할까요?",
        label: "계속",
        neutral: true,
      });
      if (!confirmed) return;
    }
    await api(`/api/reminders/${encodeURIComponent(reminder.id)}/${mode}`, {
      method: "POST",
      body: { expected_version: reminder.occurrence_version, schedule },
    });
    byId("schedule-dialog").close();
    toast(mode === "reopen" ? "리마인더를 다시 열었습니다." : "새 시간으로 미뤘습니다.");
    await refreshAll({ showLoading: false });
  } catch (error) {
    setInlineError("schedule-form-error", errorMessage(error));
  } finally {
    setBusy(submit, false);
  }
}

function eventLabel(type) {
  return {
    created: "리마인더 생성",
    updated: "내용 수정",
    rescheduled: "일정 변경",
    acknowledged: "알림 확인",
    completed: "완료",
    cancelled: "취소",
    snoozed: "미루기",
    reopened: "다시 열기",
    notification_sent: "Slack 전송 성공",
    notification_failed: "Slack 전송 실패",
    notification_waiting_config: "Slack 설정 대기",
    notification_suppressed: "전송 취소",
    notification_retry_requested: "전송 재시도 요청",
  }[type] || type;
}

function historySection(title, entries, renderEntry) {
  const section = createElement("section", { className: "history-section" });
  section.append(createElement("h3", { text: title }));
  if (!entries.length) {
    section.append(createElement("p", { className: "history-empty", text: "기록이 없습니다." }));
    return section;
  }
  const list = createElement("ol", { className: "timeline" });
  list.append(...entries.map(renderEntry));
  section.append(list);
  return section;
}

async function openHistory(reminder) {
  const dialog = byId("history-dialog");
  byId("history-dialog-title").textContent = reminder.title;
  byId("history-content").replaceChildren(createElement("div", { className: "loading-state", text: "기록을 불러오는 중입니다…" }));
  dialog.showModal();
  try {
    const history = await api(`/api/reminders/${encodeURIComponent(reminder.id)}/history`);
    const events = historySection("상태 변경", history.events, (event) => {
      const item = createElement("li", { className: "timeline-item" });
      const heading = createElement("div", { className: "timeline-title" });
      heading.append(createElement("span", { text: eventLabel(event.event_type) }), createElement("time", { text: formatDateTime(event.created_at, reminder.timezone) }));
      item.append(heading);
      const detail = Object.keys(event.details || {}).length ? JSON.stringify(event.details, null, 2) : "";
      if (detail) item.append(createElement("pre", { className: "timeline-details", text: detail }));
      return item;
    });
    const deliveries = historySection("Slack 전송", history.deliveries, (delivery) => {
      const item = createElement("li", { className: "timeline-item" });
      const heading = createElement("div", { className: "timeline-title" });
      heading.append(
        createElement("span", { text: `${delivery.status} · ${delivery.attempt_count}회 시도` }),
        createElement("time", { text: formatDateTime(delivery.last_attempted_at, reminder.timezone) }),
      );
      item.append(heading);
      if (delivery.last_error) item.append(createElement("p", { className: "timeline-details", text: delivery.last_error }));
      return item;
    });
    byId("history-content").replaceChildren(events, deliveries);
  } catch (error) {
    byId("history-content").replaceChildren(createElement("p", { className: "history-empty", text: errorMessage(error) }));
  }
}

function confirmAction({ title, message, label = "계속", neutral = false }) {
  if (state.confirmResolver) state.confirmResolver(false);
  byId("confirm-title").textContent = title;
  byId("confirm-message").textContent = message;
  byId("confirm-submit").textContent = label;
  byId("confirm-mark").classList.toggle("neutral", neutral);
  byId("confirm-dialog").showModal();
  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function resolveConfirmation(value) {
  if (byId("confirm-dialog").open) byId("confirm-dialog").close();
  const resolve = state.confirmResolver;
  state.confirmResolver = null;
  if (resolve) resolve(value);
}

function isAcceptedFile(file) {
  return /\.(md|markdown|txt)$/i.test(file.name) && file.size <= 1_000_000;
}

function addFiles(fileList) {
  const existing = new Set(state.selectedFiles.map((file) => `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`));
  for (const file of fileList) {
    if (!isAcceptedFile(file)) {
      toast(`${file.name}: 지원하지 않거나 1 MB를 넘는 파일입니다.`, "warning");
      continue;
    }
    const identity = `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}`;
    if (!existing.has(identity)) {
      state.selectedFiles.push(file);
      existing.add(identity);
    }
  }
  if (state.selectedFiles.length > 200) {
    state.selectedFiles = state.selectedFiles.slice(0, 200);
    toast("한 번에 최대 200개 문서만 분석합니다.", "warning");
  }
  const total = state.selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (total > 5_000_000) {
    toast("선택한 문서의 총 크기는 5 MB 이하여야 합니다.", "warning");
  }
  renderSelectedFiles();
}

function renderSelectedFiles() {
  const container = byId("selected-files");
  const list = byId("selected-file-list");
  container.hidden = state.selectedFiles.length === 0;
  list.replaceChildren(...state.selectedFiles.map((file, index) => {
    const item = createElement("li");
    item.append(
      createElement("span", { text: file.webkitRelativePath || file.name }),
      createElement("small", { text: `${Math.ceil(file.size / 1024)} KB` }),
      button("제거", () => {
        state.selectedFiles.splice(index, 1);
        renderSelectedFiles();
      }, "text-button"),
    );
    return item;
  }));
  byId("preview-import").disabled = state.selectedFiles.length === 0;
  byId("import-status").textContent = state.selectedFiles.length ? `${state.selectedFiles.length}개 선택됨` : "";
  byId("import-results").hidden = true;
}

function warningLabel(code) {
  return {
    fuzzy_trigger_requires_confirmation: "모호한 날짜 표현이라 직접 확인해야 합니다.",
    event_trigger_requires_confirmation: "event 조건이라 실행 날짜를 직접 정해야 합니다.",
    count_trigger_requires_confirmation: "완료 개수 조건이라 실행 날짜를 직접 정해야 합니다.",
    source_time_missing_used_import_time: "문서 시각이 없어 현재 시각을 기준으로 계산했습니다.",
    time_missing_defaulted_to_09: "시각이 없어 오전 9시로 계산했습니다.",
    "time_missing_defaulted_to_09:00": "시각이 없어 오전 9시로 계산했습니다.",
    due_time_is_in_the_past: "계산된 시각이 이미 지났습니다.",
    year_inferred_from_source_time: "연도는 문서 시각을 기준으로 추정했습니다.",
  }[code] || code;
}

function renderCandidates(payload) {
  const candidates = payload.candidates || [];
  byId("import-results").hidden = false;
  byId("import-result-count").textContent = `${candidates.length}개`;
  byId("import-result-title").textContent = candidates.length ? "후보를 확인해 주세요" : "등록할 후보를 찾지 못했습니다";
  const warningBox = byId("import-warnings");
  warningBox.hidden = !(payload.warnings || []).length;
  if (!warningBox.hidden) {
    const list = createElement("ul");
    list.append(...payload.warnings.map((warning) => createElement("li", { text: warningLabel(warning) })));
    warningBox.replaceChildren(list);
  } else {
    warningBox.replaceChildren();
  }
  const cards = candidates.map((candidate) => {
    const card = createElement("article", { className: "candidate-card" });
    const top = createElement("div", { className: "candidate-top" });
    top.append(
      createElement("h4", { text: candidate.title }),
      createElement("span", { className: "candidate-confidence", text: `신뢰도 ${Math.round(candidate.confidence * 100)}%` }),
    );
    const meta = createElement("div", { className: "candidate-meta" });
    meta.append(
      createElement("span", { className: "meta-chip", text: candidate.trigger_type }),
      createElement("span", { className: "meta-chip", text: candidate.due_at ? formatDateTime(candidate.due_at, candidate.timezone) : "날짜 확인 필요" }),
      createElement("span", { className: "meta-chip", text: candidate.source_ref }),
    );
    card.append(top, createElement("p", { className: "candidate-evidence", text: candidate.evidence }), meta);
    const warnings = candidate.warnings || [];
    if (candidate.requires_confirmation || warnings.length) {
      card.append(createElement("p", {
        className: "candidate-warning",
        text: [candidate.requires_confirmation ? "등록 전 날짜·목적지 확인 필요" : "", ...warnings.map(warningLabel)].filter(Boolean).join(" · "),
      }));
    }
    const actions = createElement("div", { className: "candidate-actions" });
    actions.append(button("리마인더로 검토", () => openReminderDialog(null, candidate), "button button-small button-primary"));
    card.append(actions);
    return card;
  });
  byId("candidate-list").replaceChildren(...cards);
}

async function previewImport() {
  if (!state.selectedFiles.length) return;
  const total = state.selectedFiles.reduce((sum, file) => sum + file.size, 0);
  if (total > 5_000_000) {
    setInlineError("import-error", "문서의 총 크기는 5 MB 이하여야 합니다.");
    return;
  }
  const submit = byId("preview-import");
  setBusy(submit, true);
  setInlineError("import-error", "");
  byId("import-status").textContent = "문서에서 action과 날짜를 찾는 중…";
  try {
    const documents = await Promise.all(state.selectedFiles.map(async (file) => ({
      name: file.webkitRelativePath || file.name,
      content: await file.text(),
      last_modified: file.lastModified ? new Date(file.lastModified).toISOString() : null,
    })));
    const payload = await api("/api/import/preview", {
      method: "POST",
      body: { documents, timezone: state.config?.timezone || "Asia/Seoul" },
    });
    renderCandidates(payload);
    byId("import-status").textContent = `후보 ${payload.candidates.length}개 · 자동 등록되지 않음`;
  } catch (error) {
    setInlineError("import-error", errorMessage(error));
    byId("import-status").textContent = "분석 실패";
  } finally {
    setBusy(submit, false);
  }
}

function bindSchedule(prefix) {
  const radioName = prefix === "reminder" ? "schedule_type" : "secondary_schedule_type";
  for (const radio of document.querySelectorAll(`input[name="${radioName}"]`)) {
    radio.addEventListener("change", () => toggleSchedulePane(prefix));
  }
  for (const quick of document.querySelectorAll(`[data-schedule-prefix="${prefix}"]`)) {
    quick.addEventListener("click", () => setRelativeSchedule(prefix, Number(quick.dataset.amount), quick.dataset.unit));
  }
  let timer;
  for (const id of ["amount", "unit", "timezone", "local-datetime", "fold"]) {
    byId(`${prefix}-${id}`).addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => previewSchedule(prefix), 220);
    });
    byId(`${prefix}-${id}`).addEventListener("change", () => previewSchedule(prefix));
  }
}

function selectView(view) {
  state.view = view;
  for (const tab of document.querySelectorAll("[data-view]")) {
    const selected = tab.dataset.view === view;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  const selectedTab = document.querySelector(`[data-view="${view}"]`);
  byId("reminder-panel").setAttribute("aria-labelledby", selectedTab?.id || "tab-active");
  loadReminders();
}

function bindEvents() {
  byId("open-create").addEventListener("click", () => openReminderDialog());
  byId("open-create-mobile").addEventListener("click", () => openReminderDialog());
  byId("empty-create").addEventListener("click", () => openReminderDialog());
  byId("reminder-form").addEventListener("submit", submitReminder);
  byId("schedule-form").addEventListener("submit", submitSchedule);
  byId("reminder-prompt").addEventListener("input", (event) => {
    byId("prompt-counter").textContent = `${event.target.value.length.toLocaleString("ko-KR")}자`;
  });
  bindSchedule("reminder");
  bindSchedule("schedule");

  for (const tab of document.querySelectorAll("[data-view]")) {
    tab.addEventListener("click", () => selectView(tab.dataset.view));
  }
  for (const stat of document.querySelectorAll("[data-view-target]")) {
    stat.addEventListener("click", () => selectView(stat.dataset.viewTarget));
  }
  byId("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = byId("search-input").value.trim();
    byId("clear-search").hidden = !state.query;
    loadReminders();
  });
  let searchTimer;
  byId("search-input").addEventListener("input", (event) => {
    byId("clear-search").hidden = !event.target.value;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = event.target.value.trim();
      loadReminders({ showLoading: false });
    }, 300);
  });
  byId("clear-search").addEventListener("click", () => {
    byId("search-input").value = "";
    state.query = "";
    byId("clear-search").hidden = true;
    loadReminders();
  });
  byId("retry-load").addEventListener("click", () => refreshAll());

  byId("open-import").addEventListener("click", () => byId("import-dialog").showModal());
  byId("markdown-files").addEventListener("change", (event) => addFiles(event.target.files));
  byId("markdown-directory").addEventListener("change", (event) => addFiles(event.target.files));
  byId("clear-files").addEventListener("click", () => {
    state.selectedFiles = [];
    byId("markdown-files").value = "";
    byId("markdown-directory").value = "";
    renderSelectedFiles();
  });
  byId("preview-import").addEventListener("click", previewImport);
  const dropZone = byId("drop-zone");
  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  }
  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  }
  dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));
  dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      byId("markdown-files").click();
    }
  });

  for (const close of document.querySelectorAll(".dialog-close")) {
    close.addEventListener("click", () => {
      const dialog = close.closest("dialog");
      if (dialog?.id === "confirm-dialog") resolveConfirmation(false);
      else dialog?.close();
    });
  }
  byId("confirm-form").addEventListener("submit", (event) => {
    event.preventDefault();
    resolveConfirmation(true);
  });
  byId("confirm-cancel").addEventListener("click", () => resolveConfirmation(false));
  byId("confirm-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    resolveConfirmation(false);
  });
}

async function initialize() {
  bindEvents();
  if (state.deepLink) {
    state.view = "all";
    for (const tab of document.querySelectorAll("[data-view]")) {
      const selected = tab.dataset.view === "all";
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
  }
  try {
    await loadConfig();
    await loadReminders();
  } catch (error) {
    byId("global-error-message").textContent = errorMessage(error);
    byId("global-error").hidden = false;
  }
  window.setInterval(renderClock, 1000);
  window.setInterval(() => {
    if (document.visibilityState === "visible") refreshAll({ showLoading: false });
  }, 30_000);
}

initialize();
