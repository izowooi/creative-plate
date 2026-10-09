// 나무위키 문서 DOM 에서 본문을 구조 기반으로 추출한다. webapp/namu_crawler/extract.py 의 JS 이식본이며
// 두 구현이 같은 fixture 에서 같은 결과를 내는지 대조해 어긋남을 막는다 (webapp/tests/test_extension_parity.py).
//
// 나무위키의 CSS 클래스명은 배포마다 바뀌는 해시라서 클래스 선택자는 쓰지 않고,
// 바뀌지 않는 의미 단위(h1, 라이선스 링크, 목차/각주 앵커, /w/ 링크)를 기준으로 영역을 찾는다.
import { BASE_URL } from "./targets.js";

const BLOCK_STATUSES = new Set([403, 429, 503, 520, 521, 522, 523, 524, 525, 526, 527, 530]);
const BLOCK_MARKERS = [
  "challenges.cloudflare.com", "cf-turnstile", "cf-chl-", "Just a moment...",
  "Attention Required! | Cloudflare", "Checking your browser",
];
const HEADING_SELECTOR = ["h2", "h3", "h4", "h5", "h6"].map((h) => `${h} a[href="#toc"]`).join(", ");
const REMOVE_TAGS = "script, style, noscript, iframe, object, embed, template, link, meta, form, button, input, textarea, select";
const SAFE_HREF = /^(?:#|https?:|mailto:)/i;
const CATEGORY_PREFIX = "분류:";

// kind: blocked(차단·챌린지) | not_found(문서 없음) | layout(본문 영역을 못 찾음)
export class ExtractError extends Error {
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

export function isNamuPage(html) {
  return html.slice(0, 30000).includes('name="generator" content="the seed"');
}

// 응답이 정상 문서가 아니면 ExtractError 를 던진다.
export function checkResponse(status, html) {
  const namu = isNamuPage(html);
  if (BLOCK_STATUSES.has(status)) throw new ExtractError("blocked", `HTTP ${status}`);
  if (!namu) {
    const marker = BLOCK_MARKERS.find((m) => html.includes(m));
    throw new ExtractError("blocked", marker ? `챌린지 감지: ${marker}` : `나무위키 응답이 아님(HTTP ${status})`);
  }
  if (status === 404) throw new ExtractError("not_found", "문서가 없습니다");
  if (status >= 400) throw new ExtractError("blocked", `HTTP ${status}`);
  if (!html.includes("<h1") || !html.includes("creativecommons.org/licenses")) {
    throw new ExtractError("layout", "제목 또는 라이선스 영역이 없는 응답");
  }
}

// doc: DOMParser 로 만든 Document. 추출 과정에서 doc 을 변경한다.
export function extractDocument(doc, url) {
  const h1 = doc.querySelector("h1");
  const main = h1 ? findMain(doc, h1) : null;
  if (!h1 || !main) {
    throw new ExtractError("layout", "본문 영역을 찾지 못했습니다(사이트 구조 변경 또는 챌린지 응답)");
  }
  const title = strippedText(h1);
  const lastModified = findLastModified(doc);
  const stylesheets = [...doc.querySelectorAll("link[rel~='stylesheet'][href]")]
    .map((l) => new URL(l.getAttribute("href"), BASE_URL).href);

  main.remove();
  removeAds(main);
  clean(main);
  markStructure(main);
  const sections = collectSections(main);
  const categories = collectCategories(main);
  const links = collectLinks(main);
  const images = collectImages(main);

  const wrapper = doc.createElement("div");
  wrapper.className = "namu-doc";
  const head = doc.createElement("div");
  head.className = "namu-head";
  head.append(h1.cloneNode(true));
  if (lastModified) {
    const meta = doc.createElement("div");
    meta.className = "namu-meta";
    meta.append("최근 수정 시각: ");
    const time = doc.createElement("time");
    time.setAttribute("datetime", lastModified);
    time.textContent = lastModified.replace("T", " ").replace(".000Z", "");
    meta.append(time);
    head.append(meta);
  }
  wrapper.append(head, main);

  return {
    title, url, html: wrapper.outerHTML, stylesheets, last_modified: lastModified,
    categories, sections, links, images,
  };
}

// ---------- 본문 영역 탐지 ----------

function* textNodes(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const tag = node.parentElement && node.parentElement.tagName;
    if (tag !== "SCRIPT" && tag !== "STYLE") yield node;
  }
}

// bs4 get_text(strip=True) 와 같은 의미: 문자열마다 양끝 공백을 없애고 이어 붙인다.
function strippedText(el) {
  let out = "";
  for (const n of textNodes(el)) out += n.nodeValue.trim();
  return out;
}

function textLen(el) {
  return strippedText(el).length;
}

function ancestors(node) {
  const out = [];
  for (let p = node.parentElement; p; p = p.parentElement) out.push(p);
  return out;
}

function childContaining(parent, node) {
  let cur = node;
  while (cur.parentElement !== parent) cur = cur.parentElement;
  return cur;
}

// 두 방법으로 찾고, 앞의 것이 실패하면 뒤의 것을 쓴다.
//  1) h1 과 라이선스 푸터 사이의 가장 큰 형제 블록
//  2) 문단 제목/각주 앵커의 공통 조상에서 h1 을 포함하는 직전까지 올라간 블록
export function findMain(doc, h1) {
  return mainBetweenTitleAndLicense(doc, h1) || mainFromAnchors(doc, h1);
}

export function mainBetweenTitleAndLicense(doc, h1) {
  const license = doc.querySelector('a[href*="creativecommons.org/licenses"]');
  if (!license) return null;
  const h1Ancestors = new Set(ancestors(h1));
  const common = ancestors(license).find((p) => h1Ancestors.has(p));
  if (!common) return null;
  const siblings = [...common.children];
  const iTitle = siblings.indexOf(childContaining(common, h1));
  const iLicense = siblings.indexOf(childContaining(common, license));
  if (iTitle < 0 || iLicense < 0 || iTitle >= iLicense) return null;
  const between = siblings.slice(iTitle + 1, iLicense).filter((c) => textLen(c) > 0);
  return between.length ? between.reduce((a, b) => (textLen(b) > textLen(a) ? b : a)) : null;
}

export function mainFromAnchors(doc, h1) {
  const anchors = [...doc.querySelectorAll(`${HEADING_SELECTOR}, a[href^="#rfn-"]`)];
  if (!anchors.length) return null;
  let node = anchors[0];
  for (const other of anchors.slice(1)) {
    const known = new Set([node, ...ancestors(node)]);
    node = [other, ...ancestors(other)].find((p) => known.has(p));
  }
  while (node.parentElement && !["BODY", "HTML"].includes(node.parentElement.tagName)) {
    if (node.parentElement.querySelector("h1")) break;
    node = node.parentElement;
  }
  return node === h1 ? null : node;
}

function findLastModified(doc) {
  for (const node of textNodes(doc.body)) {
    if (!node.nodeValue.includes("최근 수정 시각")) continue;
    const parent = node.parentElement;
    const time = parent.querySelector("time") || (parent.parentElement && parent.parentElement.querySelector("time"));
    return time ? time.getAttribute("datetime") || time.textContent.trim() : null;
  }
  return null;
}

// ---------- 정제 ----------

// 광고는 href="#s-N" 가짜 앵커로만 이루어진 표로 위장한다.
// 실제 목차·문단 링크와 달리 링크 문구가 대상 문단 제목과 다르고, 블록 안의 모든 글자가 그런 앵커 안에 있다.
function removeAds(main) {
  const titles = new Map();
  for (const a of main.querySelectorAll(HEADING_SELECTOR)) {
    if (a.id) titles.set(a.id, headingTitle(a.parentElement));
  }
  const suspects = [...main.querySelectorAll('a[href^="#s-"]')].filter((a) => !matchesHeading(a, titles));
  for (const anchor of suspects) {
    if (!main.contains(anchor)) continue; // 앞선 블록 제거로 이미 사라짐
    let block = anchor;
    while (block.parentElement && block.parentElement !== main && onlySectionAnchors(block.parentElement)) {
      block = block.parentElement;
    }
    if (["TABLE", "DIV"].includes(block.tagName) && block.querySelectorAll('a[href^="#s-"]').length >= 3) {
      block.remove();
    }
  }
}

function matchesHeading(anchor, titles) {
  const text = anchor.textContent.replace(/\s+/g, "");
  if (!text || /^[\d.]+$/.test(text)) return true; // 목차 번호처럼 글자가 없거나 숫자뿐인 링크
  const target = (titles.get(anchor.getAttribute("href").slice(1)) || "").replace(/\s+/g, "");
  return Boolean(target) && (text.includes(target) || target.includes(text));
}

function insideAnchor(node, stop, predicate) {
  for (let p = node.parentElement; p; p = p.parentElement) {
    if (p.tagName === "A" && predicate(p.getAttribute("href") || "")) return true;
    if (p === stop) break;
  }
  return false;
}

function onlySectionAnchors(block) {
  for (const s of textNodes(block)) {
    if (s.nodeValue.trim() && !insideAnchor(s, block, (href) => href.startsWith("#s-"))) return false;
  }
  return true;
}

function headingTitle(heading) {
  let out = "";
  for (const s of textNodes(heading)) {
    if (!insideAnchor(s, heading, (href) => href === "#toc" || href.startsWith("/edit/"))) out += s.nodeValue;
  }
  return out.trim();
}

function clean(main) {
  main.querySelectorAll(REMOVE_TAGS).forEach((e) => e.remove());
  for (const edit of main.querySelectorAll('a[href^="/edit/"]')) {
    const wrapper = edit.parentElement;
    edit.remove();
    if (wrapper && wrapper !== main && wrapper.tagName === "SPAN" && textLen(wrapper) === 0) wrapper.remove();
  }
  for (const el of main.querySelectorAll("*")) {
    for (const attr of [...el.attributes]) {
      if (attr.name.toLowerCase().startsWith("on")) el.removeAttribute(attr.name);
    }
    if (el.tagName === "IMG") fixImage(el);
    else if (el.tagName === "A") fixLink(el);
  }
}

function fixImage(img) {
  const real = img.getAttribute("data-src");
  if (real) {
    img.removeAttribute("data-src");
    img.setAttribute("src", real); // 지연 로딩: 자리표시 SVG 를 실제 주소로 교체
  }
  for (const attr of ["src", "srcset"]) {
    const value = img.getAttribute(attr);
    if (value && value.startsWith("//")) img.setAttribute(attr, "https:" + value);
  }
}

function fixLink(a) {
  const href = a.getAttribute("href");
  if (href === null || href.startsWith("#")) return;
  let absolute;
  try {
    absolute = new URL(href, BASE_URL + "/").href;
  } catch {
    a.removeAttribute("href");
    return;
  }
  if (!SAFE_HREF.test(absolute)) {
    a.removeAttribute("href");
    return;
  }
  a.setAttribute("href", absolute);
  a.setAttribute("target", "_blank");
  a.setAttribute("rel", "noopener noreferrer");
}

// 내보내기에서 쓸 의미 단위에 data-namu 표시를 단다(해시 클래스 대신 쓰는 우리 쪽 표식).
function markStructure(main) {
  for (const ul of main.querySelectorAll("ul")) {
    const anchors = [...ul.querySelectorAll("li > a[href]")];
    if (anchors.length && anchors.every((a) => isCategoryHref(a.getAttribute("href")))) {
      ul.parentElement.setAttribute("data-namu", "categories");
      break;
    }
  }
  const numbers = [...main.querySelectorAll('a[href^="#s-"]')].filter((a) => /^[\d.]+$/.test(strippedText(a)));
  if (numbers.length >= 2) {
    let toc = numbers[0];
    for (const other of numbers.slice(1)) {
      const known = new Set([toc, ...ancestors(toc)]);
      toc = [other, ...ancestors(other)].find((p) => known.has(p));
    }
    if (toc.parentElement && toc.parentElement.tagName === "DETAILS") toc = toc.parentElement;
    if (toc !== main && !toc.querySelector("h2, h3, h4, h5, h6")) toc.setAttribute("data-namu", "toc");
  }
  for (const note of main.querySelectorAll('span[id^="fn-"]')) note.parentElement.setAttribute("data-namu", "footnote");
}

// ---------- 메타데이터 ----------

function collectSections(main) {
  return [...main.querySelectorAll(HEADING_SELECTOR)].map((a) => ({
    level: Number(a.parentElement.tagName[1]),
    number: a.textContent.trim().replace(/\.+$/, ""),
    title: headingTitle(a.parentElement),
    anchor: a.id || "",
  }));
}

function lenientDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function isCategoryHref(href) {
  return lenientDecode(href).split("/w/").pop().startsWith(CATEGORY_PREFIX);
}

function collectCategories(main) {
  for (const ul of main.querySelectorAll("ul")) {
    const anchors = [...ul.querySelectorAll("li > a[href]")];
    if (anchors.length && anchors.every((a) => isCategoryHref(a.getAttribute("href")))) {
      return anchors.map((a) => ({ title: a.textContent.trim(), url: a.getAttribute("href") }));
    }
  }
  return [];
}

function collectLinks(main) {
  const seen = new Map();
  for (const a of main.querySelectorAll('a[href^="https://namu.wiki/w/"]')) {
    const url = a.getAttribute("href");
    if (!seen.has(url)) seen.set(url, { title: a.getAttribute("title") || strippedText(a), url });
  }
  return [...seen.values()];
}

function collectImages(main) {
  const seen = new Set();
  for (const img of main.querySelectorAll("img[src]")) {
    const src = img.getAttribute("src");
    if (/^https?:\/\//.test(src)) seen.add(src);
  }
  return [...seen];
}
