// 수집 결과를 한 장의 HTML 로 만들고, 파일명·시각 같은 공용 함수를 둔다. webapp/namu_crawler/export.py 이식본.
export const LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/2.0/kr/";

// 저장한 HTML 을 파일로 열거나 뷰어 iframe 에 넣어도 위키 콘텐츠의 스크립트가 실행되지 않게 한다
const PAGE_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; "
  + "font-src https: data:; base-uri 'none'; form-action 'none'";

const BASE_CSS = `
html{background:#fff}
body{margin:0}
.namu-page{max-width:1000px;margin:0 auto;padding:16px 20px 32px}
.namu-meta{font-size:12px;color:#666;margin:4px 0 12px}
.namu-source{max-width:1000px;margin:0 auto;padding:12px 20px 32px;font:12px/1.6 sans-serif;color:#666;border-top:1px solid #ddd}
.namu-source a{color:#4188f1}
.namu-error{max-width:1000px;margin:40px auto;padding:0 20px;font:15px/1.7 sans-serif}
`;

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));
}

// ts: 초 단위 epoch
export function kst(ts) {
  return new Date(ts * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ") + " KST";
}

export function safeFilename(title) {
  const name = title.replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/^[ .]+|[ .]+$/g, "") || "untitled";
  return name.slice(0, 100);
}

// cssTexts: 문서 스킨 CSS 문자열 목록(폰트가 data URI 로 내장된 것)
export function renderPage(result, cssTexts) {
  if (result.status !== "ok" || !result.doc) return messagePage(result);
  const { doc, page } = result;
  const styles = cssTexts.map((css) => `<style>${css.replaceAll("</style", "<\\/style")}</style>`).join("");
  const note = page.note ? ` · ${escapeHtml(page.note)}` : "";
  const source = `출처: <a href="${escapeHtml(doc.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(doc.url)}</a>`
    + ` · 수집: ${kst(page.fetched_at)} (${escapeHtml(page.via)})${note}<br>`
    + `이 저작물은 <a href="${LICENSE_URL}" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 2.0 KR</a>`
    + " 에 따라 이용할 수 있습니다. (비영리 · 출처 표시 · 동일 조건 변경 허락)";
  return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">`
    + `<title>${escapeHtml(doc.title)} - 나무위키 (수집본)</title>`
    + `<style>${BASE_CSS}</style>${styles}</head>`
    + `<body class="theseed-light-mode"><div id="app"><div class="namu-page">${doc.html}</div>`
    + `<div class="namu-source">${source}</div></div></body></html>`;
}

function messagePage(result) {
  const body = result.status === "not_found"
    ? `<h2>문서가 없습니다</h2><p>나무위키에 &lsquo;${escapeHtml(result.title)}&rsquo; 문서가 없습니다.</p>`
    : `<h2>수집하지 못했습니다</h2><p>${escapeHtml(result.error || "알 수 없는 오류")}</p>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>`
    + `<body><div class="namu-error">${body}</div></body></html>`;
}

export function toJson(result, markdown) {
  const data = {
    key: result.key, requested: result.title, status: result.status, error: result.error || null,
    elapsed: Math.round(result.elapsed * 100) / 100,
  };
  if (result.page) {
    data.fetch = {
      via: result.page.via, note: result.page.note, status: result.page.status, url: result.page.url,
      fetched_at: kst(result.page.fetched_at),
    };
  }
  if (result.doc) {
    data.document = result.doc;
    data.markdown = markdown;
  }
  return JSON.stringify(data, null, 2);
}
