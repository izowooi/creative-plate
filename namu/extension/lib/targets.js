// 크롤링 대상 입력(URL 또는 문서명)을 문서 제목으로 정규화한다. webapp/namu_crawler/targets.py 와 같은 규칙.
export const BASE_URL = "https://namu.wiki";
const HOSTS = new Set(["namu.wiki", "www.namu.wiki", "m.namu.wiki"]);
const SCHEMELESS = /^(?:www\.|m\.)?namu\.wiki\//i;

export function titleToUrl(title) {
  // ? # % + & 는 인코딩하고 하위 문서 구분자 / 와 namespace 구분자 : 는 그대로 둔다 (Python quote(safe='/:()') 와 동일)
  const encoded = encodeURIComponent(title)
    .replace(/%2F/gi, "/")
    .replace(/%3A/gi, ":")
    .replace(/[!'*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  return `${BASE_URL}/w/${encoded}`;
}

function looksLikeUrl(s) {
  return /^https?:\/\//i.test(s) || SCHEMELESS.test(s);
}

function lenientDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // 100% 처럼 잘못된 퍼센트 표기는 그대로 둔다
  }
}

export function parseEntry(entry) {
  let s = entry.trim();
  if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1).trim();
  let title;
  if (looksLikeUrl(s)) {
    if (!s.includes("://")) s = "https://" + s;
    let url;
    try {
      url = new URL(s);
    } catch {
      throw new Error("올바른 URL이 아닙니다");
    }
    if (!HOSTS.has(url.hostname.toLowerCase())) throw new Error("나무위키 URL이 아닙니다");
    if (!url.pathname.startsWith("/w/")) throw new Error("문서 URL(/w/...)만 지원합니다");
    title = lenientDecode(url.pathname.slice("/w/".length)); // #앵커, ?from= 은 URL 이 이미 분리
  } else {
    title = s; // 문서명 그대로. C#, 우리말? 처럼 # ? 가 제목에 들어갈 수 있다
  }
  title = title.trim();
  if (!title) throw new Error("문서명이 비어 있습니다");
  return { title, raw: entry.trim() };
}

// 줄 단위 입력을 {targets, errors} 로 바꾼다. 중복 제목은 첫 항목만 남긴다.
// 문서명에 공백이 있을 수 있어 한 줄을 한 항목으로 보되, 한 줄에 URL 이 공백으로 여러 개 붙어 있으면 URL 단위로 나눈다.
export function parseTargets(text) {
  const targets = [];
  const errors = [];
  const seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const tokens = /^https?:\/\/\S+\s+https?:\/\//i.test(line) ? line.split(/\s+/) : [line];
    for (const token of tokens) {
      try {
        const target = parseEntry(token);
        if (!seen.has(target.title)) {
          seen.add(target.title);
          targets.push(target);
        }
      } catch (e) {
        errors.push({ entry: token, message: e.message });
      }
    }
  }
  return { targets, errors };
}
