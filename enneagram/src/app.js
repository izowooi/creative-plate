import "./style.css";
import { QUESTIONS, TYPES, PROFILES, SOURCES } from "./content.js";
import { scoreAnswers } from "./scoring.js";
import { diagram, downloadCard } from "./diagram.js";
import { readLocal, writeLocal, api } from "./storage.js";

const app = document.querySelector("#app");
const state = {
  ...readLocal(),
  page: 0,
  view: "home",
  result: null,
  shared: false,
  saveStatus: "",
  conflict: null,
};
let saveTimer,
  saving = false,
  saveAgain = false;
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const typeById = (id) => TYPES.find((t) => t.id === id);
const answered = () => QUESTIONS.filter((q) => state.answers[q.id]).length;
const sameAnswers = (a, b) => QUESTIONS.every((q) => a[q.id] === b[q.id]);
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 4200);
}
function persist() {
  if (!writeLocal(state))
    toast("기기에 저장할 공간이 부족합니다. 보관 ID로 저장해 주세요.");
}
function header() {
  return `<header class="header"><a href="#" class="brand" data-action="home"><span class="brand-symbol">✳</span> 마음지도<span class="brand-sub">ENNEAGRAM ATLAS</span></a><nav aria-label="주 메뉴"><button data-action="types" class="${state.view === "types" ? "active" : ""}">아홉 가지 유형</button><button data-action="about" class="${state.view === "about" ? "active" : ""}">지도 읽는 법</button><button data-action="storage" class="nav-save">이어 풀기 <span>↗</span></button></nav></header>`;
}
function footer() {
  return `<footer><a href="#" data-action="home" class="footer-brand">✳ 마음지도</a><span>나를 이해하는 작은 시작.<br>성격을 규정하거나 진단하는 검사가 아닙니다.</span><button data-action="about">검사 안내 · 자료 · 저장 정책 ↗</button></footer>`;
}
function setView(view) {
  state.view = view;
  state.shared = false;
  if (view !== "result") state.result = null;
  history.replaceState(null, "", location.pathname);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#main")?.focus({ preventScroll: true });
}
function hero() {
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-star">✳</span> 나를 알아가는 아홉 개의 길</div><h1>당신의 마음은<br>어떤 <em>모양</em>인가요?</h1><p class="hero-description">같은 순간에도, 우리는 다른 마음으로 움직입니다.<br>에니어그램으로 나의 동기와 관계의 패턴을<br class="desktop-br"> 천천히 들여다보세요.</p><div class="hero-actions"><button class="button primary" data-action="start">${answered() ? "검사 이어서 하기" : "나의 마음지도 만들기"} <span>↗</span></button><span class="test-meta">54개의 질문 · 약 8–12분<br>로그인 없이, 내 속도로</span></div>${answered() ? `<p class="resume-note">이 기기에 ${answered()} / 54문항이 저장되어 있어요. <button data-action="restart">새로 시작</button></p>` : ""}<div class="hero-footnote"><span class="status-dot"></span> 답변은 기기에 자동 저장됩니다.</div></div><div class="hero-art" aria-label="마음지도 예시"><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><span class="art-spark spark-one">✧</span><span class="art-spark spark-two">✴</span><div class="map-paper"><div class="paper-heading"><span>MY INNER LANDSCAPE</span><span>01 — 09</span></div>${diagram(undefined, 5, "#738666", "hero")}<div class="paper-caption">서로 다른 마음, 하나의 나</div></div><div class="floating-label"><span>✳</span><div>나를 설명하는 번호보다<br><strong>나를 이해하는 지도.</strong></div></div><span class="art-caption">A LITTLE CLOSER TO YOURSELF</span></div></section>`;
}
function typeCard(type) {
  return `<button class="type-card" style="--type-color:${escape(type.color)}" data-action="type" data-type="${type.id}"><div class="character"><img src="/characters/type-${type.id}.webp" alt="${escape(type.name)}를 표현한 캐릭터" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="character-fallback" hidden>${["⚖", "♡", "✦", "❋", "⌕", "◇", "☀", "♜", "❀"][type.id - 1]}</span><span class="type-number">${String(type.id).padStart(2, "0")}</span></div><div class="type-card-copy"><span class="type-card-label">TYPE ${type.id}</span><h3>${escape(type.name)} <span>↗</span></h3><p>${escape(type.tagline)}</p></div></button>`;
}
function home() {
  return `${hero()}<section class="how-section"><div class="section-label">THE JOURNEY</div><div class="how-grid"><article><span>01</span><h3>있는 그대로 답하기</h3><p>좋은 모습보다, 평소의 나에 가까운 답을 골라요.</p></article><article><span>02</span><h3>나만의 모양 발견하기</h3><p>아홉 가지 경향과 날개를 하나의 도형으로 만나보세요.</p></article><article><span>03</span><h3>이해하고, 나누기</h3><p>나와 관계를 위한 조언을 읽고 마음지도를 공유해요.</p></article></div></section><section class="types-section"><div class="section-heading"><div><div class="eyebrow">NINE WAYS OF BEING</div><h2>우리 안의 아홉 가지 풍경</h2></div><p>어느 유형이 더 좋거나 나쁘지 않아요.<br>당신의 마음이 머무는 곳을 둘러보세요.</p></div><div class="types-grid">${TYPES.map(typeCard).join("")}</div></section><section class="quiet-note"><span>✧</span><p>당신은 하나의 번호보다 훨씬 넓은 사람입니다.</p><button data-action="about">에니어그램과 이 검사의 한계 알아보기 ↗</button></section>`;
}
function quiz() {
  const pageQuestions = QUESTIONS.slice(state.page * 6, state.page * 6 + 6),
    n = answered();
  return `<section class="quiz-shell"><div class="quiz-heading"><div><div class="eyebrow">A MOMENT FOR YOURSELF</div><h1>평소의 나를 떠올려보세요.</h1><p>최근의 한 장면보다, 반복되는 마음의 동기를 기준으로 답해요.</p></div><button class="text-button" data-action="home">잠시 쉬기 ↗</button></div><div class="progress-meta"><span>${state.page + 1} / 9 페이지</span><span>${n} / 54 답변</span></div><div class="progress-track"><div style="width:${(n / 54) * 100}%"></div></div><div class="quiz-save"><span class="status-dot"></span><span id="save-status">${escape(state.saveStatus || "이 기기에 자동 저장 중")}${state.id ? " · 보관 ID 연결됨" : ""}</span>${state.id ? '<button data-action="save-now">지금 서버에 저장</button>' : ""}<button data-action="storage">${state.id ? "보관 관리" : "다른 기기에서도 이어 풀기"}</button></div>${state.conflict ? '<div class="notice warning">다른 기기에서 답변이 변경됐어요. <button data-action="resolve">저장된 답변 불러오기</button>로 확인해 주세요. 현재 답변은 이 기기에 남아 있어요.</div>' : ""}<form id="quiz-form">${pageQuestions.map((q, i) => `<fieldset class="question"><legend><span>${String(state.page * 6 + i + 1).padStart(2, "0")}</span>${escape(q.text)}</legend><div class="answer-scale">${[1, 2, 3, 4, 5].map((v) => `<label class="answer-option ${state.answers[q.id] === v ? "selected" : ""}"><input type="radio" name="${q.id}" value="${v}" ${state.answers[q.id] === v ? "checked" : ""}><span class="answer-circle">${v}</span><span class="answer-text">${["전혀 아니다", "아닌 편이다", "반반이다", "그런 편이다", "매우 그렇다"][v - 1]}</span></label>`).join("")}</div></fieldset>`).join("")}</form><div class="quiz-bottom"><button class="button secondary" data-action="previous" ${state.page === 0 ? "disabled" : ""}>← 이전</button><span>정답은 없어요. 솔직한 마음이면 충분합니다.</span><button class="button primary" data-action="next">${state.page === 8 ? "마음지도 보기" : "다음으로"} →</button></div><p class="small-note">선택한 답은 언제든 바꿀 수 있어요. 키보드의 Tab과 방향키로도 답할 수 있습니다.</p></section>`;
}
function bullets(items) {
  return `<ul class="advice-list">${(items || []).map((s) => `<li>${escape(s)}</li>`).join("")}</ul>`;
}
function resultPage() {
  const r = state.result,
    t = typeById(r.primary),
    p = PROFILES.find((p) => p.key === r.profileKey);
  const title = t
    ? `${r.primary}${r.wing ? `w${r.wing}` : ""} · ${t.name}`
    : "여러 가능성을 품은 마음";
  return `<section class="result-shell"><div class="result-top"><div class="eyebrow">${state.shared ? "A SHARED INNER LANDSCAPE" : "YOUR INNER LANDSCAPE"}</div><h1>${escape(title)}</h1><p>${escape(t?.tagline || "아홉 유형의 점수가 비슷해, 하나의 유형을 정하기 어려워요.")}</p></div><div class="result-grid"><div class="result-map panel"><div class="paper-heading"><span>나의 마음지도</span><span>${r.wing ? "날개 경향 " + r.wing : "아홉 가지 경향"}</span></div>${diagram(r.scores, r.primary, t?.color, "result")}<div class="map-actions"><button class="button primary" data-action="share">공유 링크 만들기 ↗</button><button class="button secondary" data-action="download">이미지 저장 ↓</button></div><p class="small-note">공유에는 도형과 유형만 포함됩니다. 답변과 보관 ID는 제외돼요.</p></div><div class="result-overview">${t ? `<div class="result-character" style="--type-color:${escape(t.color)}"><img src="/characters/type-${t.id}.webp" alt="${escape(t.name)} 캐릭터" onerror="this.hidden=true"><span>TYPE ${t.id}</span></div><h2>${escape(p?.title || t.title || t.name)}</h2><p>${escape(p?.description || t.description)}</p>` : '<div class="balanced-symbol">✳</div><h2>지금은 이름보다 탐색이 먼저</h2><p>비슷한 점수는 여러 경향이 함께 나타났거나, 문항이 나를 충분히 구분하지 못했다는 뜻일 수 있어요. 유형 소개를 읽으며 무엇이 나의 반복되는 동기인지 살펴보세요.</p>'}${r.confidence === "close" || (r.tiedTypes?.length > 1 && t) ? `<div class="notice">상위 유형 점수가 비슷합니다. ${r.tiedTypes?.length > 1 ? `동점 유형: ${r.tiedTypes.join(", ")}.` : ""} 결과를 확정하기보다 이웃한 가능성도 읽어보세요.</div>` : ""}<div class="scores-list">${r.scores.map((s, i) => `<div><span>${i + 1} ${escape(typeById(i + 1).name)}</span><div class="score-bar"><i style="width:${s}%;background:${escape(typeById(i + 1).color)}"></i></div><b>${s}</b></div>`).join("")}</div><p class="small-note">점수는 응답 경향을 0–100으로 환산한 값입니다. 확률이나 백분위가 아닙니다.</p></div></div>${t ? `<div class="advice-grid"><article class="panel"><div class="eyebrow">WITH MYSELF</div><h2>나에게 건네는 말</h2>${bullets(t.selfAdvice)}${p?.advice ? `<div class="wing-advice"><h3>${r.wing ? "날개와 함께 살펴보기" : "한 걸음 더"}</h3>${bullets(p.advice)}</div>` : ""}</article><article class="panel"><div class="eyebrow">WITH OTHERS</div><h2>관계를 돌보는 방법</h2>${bullets(t.relationshipAdvice)}</article></div><div class="growth-note"><span>✧</span><div><h3>전통 이론의 연결선을 참고해 보세요</h3><p>여유로울 때 ${t.growth}번 ${escape(typeById(t.growth)?.name)}, 부담이 클 때 ${t.stress}번 ${escape(typeById(t.stress)?.name)}의 모습을 떠올려볼 수 있어요. 날개와 화살표는 탐색을 위한 이론이며, 검증된 예측이 아닙니다.</p></div></div>` : ""}<div class="result-end"><p>이 결과가 당신의 전부를 설명하지는 않습니다.<br>익숙한 부분 하나를 오늘의 작은 실천으로 옮겨보세요.</p><div><button class="button secondary" data-action="types">다른 유형 둘러보기</button>${state.shared ? "" : `<button class="button secondary" data-action="review">답변 돌아보기</button><button class="text-button" data-action="restart">다시 검사하기 ↗</button>`}</div></div></section>`;
}
function about() {
  return `<section class="about-shell"><div class="eyebrow">HOW TO READ YOUR MAP</div><h1>지도를 읽는 법</h1><p class="intro">에니어그램은 행동 뒤에 있는 동기를 아홉 가지 관점으로 돌아보는 성격 이론입니다. 마음지도는 그 관점을 일상의 언어로 탐색하는 도구예요.</p><div class="about-grid"><article class="panel"><h2>결과는 이렇게 계산해요</h2><p>자체 제작한 54문항에 1–5점으로 답합니다. 유형마다 6문항을 같은 비중으로 더하며, 역문항은 6에서 응답값을 뺍니다. 유형별 평균을 0–100점으로 환산합니다.</p><p>가장 높은 유형을 먼저 소개합니다. 동점이면 낮은 유형 번호를 표시하되 동점을 알려드려요. 유형별 점수 차이가 약 4.17점 이하면 유형을 정하지 않습니다. 날개는 주유형 양옆 중 점수가 높은 유형이고, 두 날개가 같으면 표시하지 않아요.</p><p>9개 기본 해설과 18개 날개 해설, 총 27개를 미리 준비했습니다. 사람마다 다른 점수 도형은 따로 유지됩니다.</p></article><article class="panel"><h2>성격에 정답을 매기지 않아요</h2><p>에니어그램의 신뢰도와 타당도에 관한 연구 결과는 혼합되어 있습니다. 날개와 성장·스트레스 화살표의 근거는 특히 제한적입니다.</p><p>이 문항은 상용 검사에서 복사하지 않은 자체 문항이며, 심리 측정 도구로 표준화되거나 임상 검증되지 않았습니다. 채용·진단·관계의 단정에 사용하지 마세요. 결과보다 스스로 느끼는 반복되는 동기가 중요합니다.</p></article><article class="panel"><h2>이어 풀기와 저장 정책</h2><p>응답은 우선 이 브라우저에 저장합니다. 시크릿 모드, 기기 초기화, 사이트 데이터 삭제 시 사라질 수 있어요. 보관 ID를 연결하면 Supabase에 답변이 저장되어 다른 기기에서도 불러올 수 있습니다.</p><p>보관 ID는 로그인 대신 쓰는 열쇠입니다. 아는 사람은 답변을 읽거나 변경·삭제할 수 있습니다. 본명·전화번호 대신 길고 무작위인 ID를 사용하세요. ID 원문은 DB에 저장하지 않으며, 별도 인증이나 복구 절차는 없습니다.</p><p>보관 관리에서 서버 답변을 삭제할 수 있습니다. 공유 링크는 개인 응답을 포함하지 않는 별도 결과입니다. 공유 결과는 공개 링크로 접근할 수 있으며 보관 답변 삭제와 별개로 유지됩니다.</p></article><article class="panel"><h2>아홉 개의 캐릭터</h2><p>유형의 강점을 떠올리게 하는 캐릭터를 NovelAI로 제작했습니다. 캐릭터의 외모나 성별이 해당 유형의 기준은 아니에요.</p><p>직접 그린 이미지로 교체할 수 있도록 유형별 프롬프트와 생성 설정을 프로젝트 문서에 준비했습니다.</p><p>추후 다른 검사도 각자의 문항과 해석을 가진 지도로 추가할 수 있도록 검사 데이터와 계산을 분리했습니다.</p></article></div><section class="sources"><h2>참고한 자료</h2><p>제공된 나무위키 문서를 출발점으로, 연결된 자료와 연구를 검토했습니다. 문항과 해설은 직접 작성했습니다.</p>${SOURCES.map((s) => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer"><span>${escape(s.title)}<small>${escape(s.note || "")}</small></span><span>↗</span></a>`).join("")}</section><button class="button primary" data-action="start">내 마음지도 만들기 ↗</button></section>`;
}
function render() {
  app.innerHTML = `${header()}<main id="main" tabindex="-1">${state.view === "home" ? home() : state.view === "quiz" ? quiz() : state.view === "result" ? resultPage() : state.view === "about" ? about() : `<section class="types-section full-types"><div class="eyebrow">NINE WAYS OF BEING</div><h1>아홉 가지 마음의 풍경</h1><p class="intro">행동의 모습보다, 그 뒤에 있는 마음의 동기에 귀 기울여보세요.</p><div class="types-grid">${TYPES.map(typeCard).join("")}</div></section>`}</main>${footer()}`;
}
function openDialog(html) {
  document.querySelector("dialog")?.remove();
  const el = document.createElement("dialog");
  el.className = "modal";
  el.innerHTML = `<button class="modal-close" data-action="close" aria-label="닫기">×</button>${html}`;
  document.body.append(el);
  el.addEventListener("click", (e) => {
    if (e.target === el) el.close();
  });
  el.addEventListener("close", () => el.remove());
  el.showModal();
  return el;
}
function storageDialog() {
  openDialog(
    `<div class="eyebrow">KEEP YOUR PLACE</div><h2>마음을 이어서 살펴보기</h2><p>보관 ID 하나로 다른 기기에서도 계속할 수 있어요.</p><div class="notice">ID를 아는 사람은 답변에 접근할 수 있습니다. 본명이나 연락처 대신 무작위 ID를 사용해 주세요.</div><form id="storage-form" method="dialog"><label class="input-label" for="storage-id">나만의 보관 ID (8–64자)</label><div class="id-input"><input id="storage-id" name="storageId" value="${escape(state.id)}" minlength="8" maxlength="64" required placeholder="예: maple-forest-7k2x"><button type="button" data-action="random-id">만들기</button></div><p class="small-note">ID는 따로 메모해 주세요. 잊으면 복구할 수 없습니다.</p><div class="dialog-actions"><button type="submit" class="button primary" id="connect-button">${state.id ? "다시 불러오기" : "연결하고 이어 풀기"} ↗</button><button type="button" class="button secondary" data-action="copy-id">ID 복사</button></div></form><p id="storage-feedback" role="status"></p>${state.id ? '<div class="storage-management"><button class="text-button" data-action="disconnect">이 기기 연결 해제</button><button class="text-button danger" data-action="delete-session">서버에 저장한 답변 삭제</button></div>' : ""}`,
  );
}
function showType(id) {
  const t = typeById(id);
  openDialog(
    `<div class="type-detail"><div class="eyebrow">TYPE ${t.id} · ${escape(t.title || t.name)}</div><h2>${escape(t.name)}</h2><img class="detail-character" src="/characters/type-${t.id}.webp" alt="${escape(t.name)} 캐릭터" onerror="this.hidden=true"><p class="intro">${escape(t.tagline)}</p><p>${escape(t.description)}</p><div class="motivation-grid"><div><h3>마음이 향하는 곳</h3><p>${escape(t.motivation)}</p></div><div><h3>불편하게 느끼는 것</h3><p>${escape(t.fear)}</p></div></div><h3>내가 가진 힘</h3>${bullets(t.strengths)}<h3>놓치기 쉬운 부분</h3>${bullets(t.pitfalls)}<h3>나를 돌보기</h3>${bullets(t.selfAdvice)}<h3>다른 사람과 함께하기</h3>${bullets(t.relationshipAdvice)}<button class="button primary" data-action="start">나의 마음지도 만들기 ↗</button></div>`,
  );
}
async function sync() {
  if (!state.id || state.conflict) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  const id = state.id,
    answers = { ...state.answers },
    revision = state.revision;
  state.saveStatus = "보관 ID에 저장 중";
  updateStatus();
  try {
    const result = await api("session/save", { id, answers, revision });
    if (state.id === id) {
      state.revision = result.revision;
      state.saveStatus = "기기와 보관 ID에 저장됨";
      persist();
    }
  } catch (e) {
    if (state.id !== id) return;
    if (e.status === 409) {
      const remote = e.data.session;
      if (remote && sameAnswers(remote.answers, answers)) {
        state.revision = remote.revision;
        state.saveStatus = "기기와 보관 ID에 저장됨";
        persist();
        if (!sameAnswers(state.answers, answers)) saveAgain = true;
        return;
      }
      state.conflict = remote || { answers: {}, revision: 0 };
      state.saveStatus = "다른 기기의 변경 확인 필요";
      toast("다른 기기의 답변이 있습니다. 저장된 답변을 확인해 주세요.");
      if (state.view === "quiz") render();
    } else state.saveStatus = "기기에 저장됨 · 서버 연결은 재시도할 수 있어요";
  } finally {
    saving = false;
    updateStatus();
    if (saveAgain) {
      saveAgain = false;
      sync();
    }
  }
}
function updateStatus() {
  const el = document.querySelector("#save-status");
  if (el) el.textContent = state.saveStatus || "이 기기에 저장됨";
}
function start() {
  document.querySelector("dialog")?.close();
  const missing = QUESTIONS.findIndex((q) => !state.answers[q.id]);
  state.page = missing < 0 ? 8 : Math.floor(missing / 6);
  setView("quiz");
}
function completedResult() {
  state.result = scoreAnswers(state.answers);
  state.view = "result";
  state.shared = false;
  render();
  scrollTo(0, 0);
  sync();
}
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  openDialog(
    `<h2>복사해서 보관해 주세요</h2><input class="copy-field" readonly value="${escape(text)}" aria-label="복사할 내용">`,
  );
  document.querySelector(".copy-field")?.select();
  return false;
}
async function share() {
  const r = state.result;
  try {
    const data = await api("share", {
      scores: r.scores,
      primary: r.primary,
      wing: r.wing,
      profileKey: r.profileKey,
    });
    const url = `${location.origin}/#share=${data.id}`;
    openDialog(
      `<div class="eyebrow">SHARE YOUR LANDSCAPE</div><h2>당신의 마음을 나눠보세요</h2><p>도형과 유형 해설만 공유합니다. 응답과 보관 ID는 포함되지 않아요.</p><input class="copy-field" value="${escape(url)}" readonly aria-label="공유 링크"><div class="dialog-actions"><button class="button primary" data-action="copy-share" data-url="${escape(url)}">링크 복사 ↗</button>${navigator.share ? `<button class="button secondary" data-action="native-share" data-url="${escape(url)}">공유하기</button>` : ""}</div>`,
    );
  } catch {
    toast(
      "공유 링크를 만들지 못했습니다. 연결을 확인하거나 이미지로 저장해 주세요.",
    );
  }
}
document.addEventListener("change", (e) => {
  if (e.target.matches("#quiz-form input")) {
    state.answers[e.target.name] = Number(e.target.value);
    persist();
    state.saveStatus = "이 기기에 저장됨";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(sync, 1800);
    const pos = window.scrollY;
    render();
    window.scrollTo(0, pos);
    const chosen = document.querySelector(
      `input[name="${e.target.name}"][value="${e.target.value}"]`,
    );
    chosen?.focus({ preventScroll: true });
  }
});
document.addEventListener("submit", async (e) => {
  if (!e.target.matches("#storage-form")) return;
  e.preventDefault();
  const activeDialog = e.target.closest("dialog");
  if (saving) {
    toast("저장 중입니다. 잠시 후 다시 연결해 주세요.");
    return;
  }
  clearTimeout(saveTimer);
  const id = new FormData(e.target).get("storageId").trim().normalize("NFC");
  if (
    Array.from(id).length < 8 ||
    Array.from(id).length > 64 ||
    !/^[\p{L}\p{N}_-]+$/u.test(id)
  ) {
    toast("보관 ID는 문자·숫자·_·-로 8–64자를 입력해 주세요.");
    return;
  }
  const feedback = document.querySelector("#storage-feedback"),
    button = document.querySelector("#connect-button");
  button.disabled = true;
  feedback.textContent = "저장된 답변을 확인하고 있어요…";
  try {
    const { session } = await api("session/load", { id });
    if (!activeDialog.isConnected) return;
    if (session) {
      state.id = id;
      state.answers = session.answers;
      state.revision = session.revision;
      state.conflict = null;
      state.saveStatus = "보관 ID에서 불러옴";
      persist();
      document.querySelector("dialog").close();
      start();
      toast("저장된 답변을 불러왔습니다.");
    } else {
      feedback.innerHTML =
        '아직 저장되지 않은 ID입니다. 지금 기기의 답변을 이 ID로 보관할까요? <button class="button primary" data-action="create-session">새 ID로 저장</button>';
      feedback.dataset.id = id;
    }
  } catch {
    if (!activeDialog.isConnected) return;
    feedback.textContent =
      "서버에 연결하지 못했습니다. 이 기기에 저장된 답변은 유지됩니다.";
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-action]");
  if (!el) return;
  e.preventDefault();
  const action = el.dataset.action;
  if (["home", "types", "about"].includes(action)) {
    sync();
    document.querySelector("dialog")?.close();
    setView(action);
  } else if (action === "save-now") {
    await sync();
    if (state.saveStatus === "기기와 보관 ID에 저장됨")
      toast("보관 ID에 저장했습니다.");
  } else if (action === "start") start();
  else if (action === "storage") storageDialog();
  else if (action === "close") el.closest("dialog").close();
  else if (action === "type") showType(Number(el.dataset.type));
  else if (action === "previous") {
    state.page = Math.max(0, state.page - 1);
    render();
    scrollTo(0, 0);
  } else if (action === "next") {
    const incomplete = QUESTIONS.slice(state.page * 6, state.page * 6 + 6).find(
      (q) => !state.answers[q.id],
    );
    if (incomplete) {
      toast("이 페이지의 모든 질문에 답해주세요.");
      document.querySelector(`input[name="${incomplete.id}"]`)?.focus();
      return;
    }
    if (state.page === 8) {
      if (answered() !== 54) {
        toast("아직 답하지 않은 질문이 있어요.");
        start();
        return;
      }
      completedResult();
    } else {
      state.page++;
      render();
      scrollTo(0, 0);
    }
  } else if (action === "review") {
    state.page = 0;
    setView("quiz");
  } else if (action === "restart") {
    openDialog(
      `<h2>새로운 마음지도를 만들까요?</h2><p>현재 답변을 비우고 처음부터 시작합니다. 이미 만든 공유 링크는 유지됩니다.</p><div class="dialog-actions"><button class="button primary" data-action="confirm-restart">처음부터 시작</button><button class="button secondary" data-action="close">돌아가기</button></div>`,
    );
  } else if (action === "confirm-restart") {
    if (saving) {
      toast("저장이 끝난 후 다시 시작해 주세요.");
      return;
    }
    clearTimeout(saveTimer);
    state.answers = {};
    state.conflict = null;
    persist();
    sync();
    start();
  } else if (action === "random-id") {
    document.querySelector("#storage-id").value =
      `map-${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  } else if (action === "copy-id") {
    const id = document.querySelector("#storage-id").value.trim();
    if (!id) toast("ID를 먼저 만들어 주세요.");
    else if (await copyText(id)) toast("보관 ID를 복사했습니다.");
  } else if (action === "create-session") {
    if (saving) {
      toast("현재 저장이 끝난 뒤 다시 시도해 주세요.");
      return;
    }
    const activeDialog = el.closest("dialog");
    const id = document.querySelector("#storage-feedback").dataset.id;
    el.disabled = true;
    try {
      const data = await api("session/save", {
        id,
        answers: state.answers,
        revision: 0,
      });
      if (!activeDialog.isConnected) return;
      state.id = id;
      state.revision = data.revision;
      state.conflict = null;
      state.saveStatus = "보관 ID에 저장됨";
      persist();
      document.querySelector("dialog").close();
      start();
      toast("보관 ID를 연결했습니다. 따로 메모해 주세요.");
    } catch (err) {
      toast(
        err.status === 409
          ? "방금 사용된 ID입니다. 다시 불러오거나 다른 ID를 사용해 주세요."
          : "저장하지 못했습니다. 다시 시도해 주세요.",
      );
      el.disabled = false;
    }
  } else if (action === "disconnect") {
    if (saving) {
      toast("저장이 끝난 후 연결을 해제해 주세요.");
      return;
    }
    clearTimeout(saveTimer);
    state.id = "";
    state.revision = 0;
    state.conflict = null;
    persist();
    document.querySelector("dialog").close();
    render();
    toast("연결을 해제했습니다. 서버 답변은 유지됩니다.");
  } else if (action === "delete-session") {
    openDialog(
      `<h2>서버 답변을 삭제할까요?</h2><p>이 보관 ID에 저장한 답변을 삭제합니다. 현재 기기 답변과 공유 결과는 유지됩니다.</p><div class="dialog-actions"><button class="button primary" data-action="confirm-delete">서버 답변 삭제</button><button class="button secondary" data-action="close">취소</button></div>`,
    );
  } else if (action === "confirm-delete") {
    if (saving) {
      toast("저장이 끝난 후 삭제해 주세요.");
      return;
    }
    clearTimeout(saveTimer);
    el.disabled = true;
    try {
      await api("session", { id: state.id }, "DELETE");
      state.id = "";
      state.revision = 0;
      state.conflict = null;
      persist();
      document.querySelector("dialog").close();
      render();
      toast("서버 답변을 삭제했습니다.");
    } catch {
      toast("삭제하지 못했습니다. 다시 시도해 주세요.");
      el.disabled = false;
    }
  } else if (action === "resolve") {
    clearTimeout(saveTimer);
    const c = state.conflict;
    if (c) {
      state.answers = c.answers;
      state.revision = c.revision;
      state.conflict = null;
      persist();
      start();
    }
  } else if (action === "share") {
    el.disabled = true;
    await share();
    if (el.isConnected) el.disabled = false;
  } else if (action === "download") {
    try {
      await downloadCard(
        state.result,
        typeById(state.result.primary),
        state.result.primary
          ? `${state.result.primary}${state.result.wing ? "w" + state.result.wing : ""} · ${typeById(state.result.primary).name}`
          : "여러 가능성을 품은 마음",
      );
    } catch {
      toast("이미지를 저장하지 못했습니다. 다시 시도해 주세요.");
    }
  } else if (action === "copy-share") {
    if (await copyText(el.dataset.url)) toast("공유 링크를 복사했습니다.");
  } else if (action === "native-share") {
    try {
      await navigator.share({ title: "나의 마음지도", url: el.dataset.url });
    } catch {}
  }
});
async function loadShared() {
  const m = location.hash.match(/^#share=([a-f0-9-]{36})$/i);
  if (!m) return;
  state.view = "result";
  app.innerHTML = `${header()}<main id="main" class="loading">마음지도를 펼치고 있어요…</main>${footer()}`;
  try {
    const data = await api(`share/${m[1]}`, undefined, "GET");
    const max = Math.max(...data.scores),
      sorted = [...data.scores].sort((a, b) => b - a);
    const tiedTypes = data.scores.flatMap((v, i) => (v === max ? [i + 1] : []));
    state.result = {
      ...data,
      confidence: !data.primary
        ? "balanced"
        : tiedTypes.length > 1 || sorted[0] - sorted[1] < 8.25
          ? "close"
          : "clear",
      tiedTypes,
    };
    state.shared = true;
    render();
  } catch {
    setView("home");
    toast("공유 지도를 찾을 수 없거나 연결이 불안정합니다.");
  }
}
window.addEventListener("hashchange", loadShared);
window.addEventListener("online", sync);
window.addEventListener("pagehide", persist);
render();
loadShared();
