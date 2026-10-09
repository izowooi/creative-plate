// 정제된 문서 HTML 을 Markdown 으로 바꾼다. webapp/namu_crawler/export.py 의 to_markdown 이식본.
import { kst, LICENSE_URL } from "./page.js";

const BLOCK_SELECTOR = "div, p, table, ul, ol, li, blockquote, details, summary, hr, pre, h1, h2, h3, h4, h5, h6";
const BLOCK_TAGS = new Set(BLOCK_SELECTOR.toUpperCase().split(", "));
const WRAPPERS = { strong: "**", b: "**", em: "*", i: "*", del: "~~", s: "~~", strike: "~~", code: "`" };

// result: {title, status, error, doc, page:{via, note, fetched_at}}
export function toMarkdown(result) {
  if (result.status !== "ok" || !result.doc || !result.page) {
    return `# ${result.title}\n\n> ${result.status === "not_found" ? "문서 없음" : result.error}\n`;
  }
  const { doc, page } = result;
  const body = new DOMParser().parseFromString(doc.html, "text/html").querySelector("div.namu-doc");
  body.querySelector("div.namu-head").remove();
  body.querySelectorAll('[data-namu="categories"], [data-namu="toc"]').forEach((b) => b.remove());
  const meta = [
    `> 출처: <${doc.url}>`,
    `> 수집: ${kst(page.fetched_at)} (${page.via}${page.note ? ", " + page.note : ""})`,
  ];
  if (doc.last_modified) meta.push(`> 최근 수정 시각: ${doc.last_modified.replace("T", " ").replace(".000Z", "")} UTC`);
  meta.push(`> 라이선스: [CC BY-NC-SA 2.0 KR](${LICENSE_URL})`);
  if (doc.categories.length) meta.push("> 분류: " + doc.categories.map((c) => c.title).join(", "));
  const blocks = container(body);
  return [`# ${doc.title}`, "", ...meta.map((m) => m + "  ")].join("\n") + "\n\n" + blocks.join("\n\n").trim() + "\n";
}

function hasBlock(node) {
  return node.nodeType === 1 && (
    BLOCK_TAGS.has(node.tagName) || node.dataset.namu === "footnote"
    || node.querySelector(BLOCK_SELECTOR) !== null || node.querySelector('[data-namu="footnote"]') !== null);
}

function container(node) {
  const out = [];
  let run = [];
  const flush = () => {
    const text = tidy(run.join(""));
    if (text) out.push(text);
    run = [];
  };
  for (const child of node.childNodes) {
    if (child.nodeType === 8) continue;
    if (hasBlock(child)) {
      flush();
      out.push(...blocks(child));
    } else {
      run.push(inline(child));
    }
  }
  flush();
  return out;
}

function blocks(tag) {
  const name = tag.tagName.toLowerCase();
  if (/^h[1-6]$/.test(name)) {
    const text = tidy(inline(tag)).replace(/\n/g, " ");
    return text ? [`${"#".repeat(Number(name[1]))} ${text}`] : [];
  }
  if (name === "table") return table(tag);
  if (name === "ul" || name === "ol") return [list(tag)];
  if (name === "blockquote") {
    const inner = container(tag).join("\n\n");
    return inner ? [inner.split("\n").map((line) => "> " + line).join("\n")] : [];
  }
  if (name === "details") {
    const summary = [...tag.children].find((c) => c.tagName === "SUMMARY");
    const title = summary ? tidy(inline(summary)).replace(/\n/g, " ") : "";
    if (summary) summary.remove();
    return [...(title ? [`**${title}**`] : []), ...container(tag)];
  }
  if (tag.dataset.namu === "footnote") {
    const text = tidy(inline(tag));
    return text ? [text] : [];
  }
  if (name === "hr") return ["---"];
  if (name === "pre") return ["```\n" + tag.textContent + "\n```"];
  return container(tag);
}

function list(tag) {
  const lines = [];
  const ordered = tag.tagName === "OL";
  [...tag.children].filter((c) => c.tagName === "LI").forEach((li, index) => {
    const parts = container(li);
    if (!parts.length) return;
    const marker = ordered ? `${index + 1}. ` : "- ";
    const pad = " ".repeat(marker.length);
    const [first, ...rest] = parts;
    let text = marker + first.replace(/\n/g, "\n" + pad);
    for (const part of rest) text += "\n" + pad + part.replace(/\n/g, "\n" + pad);
    lines.push(text);
  });
  return lines.join("\n");
}

function table(tag) {
  const rows = [...tag.querySelectorAll("tr")].filter((tr) => tr.closest("table") === tag);
  const cells = rows.map((tr) => [...tr.children].filter((c) => c.tagName === "TD" || c.tagName === "TH")).filter((r) => r.length);
  if (cells.length === 1 && cells[0].length === 1) return container(cells[0][0]); // 상자 모양을 내는 1칸짜리 표
  let grid = cells.map((row) => {
    const line = [];
    for (const cell of row) {
      line.push(container(cell).map((p) => p.replace(/\n/g, " <br> ")).join(" <br> ").replace(/\|/g, "\\|"));
      const span = Number((cell.getAttribute("colspan") || "1").replace(/\D/g, "")) || 1;
      for (let i = 1; i < span; i++) line.push("");
    }
    return line;
  });
  if (!grid.length) return [];
  const width = Math.max(...grid.map((r) => r.length));
  grid = grid.map((r) => [...r, ...Array(width - r.length).fill("")]);
  const md = ["| " + grid[0].join(" | ") + " |", "|" + " --- |".repeat(width)];
  for (const r of grid.slice(1)) md.push("| " + r.join(" | ") + " |");
  return [md.join("\n")];
}

function inline(node) {
  if (node.nodeType === 8) return "";
  if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, " ");
  if (node.nodeType !== 1) return "";
  const name = node.tagName.toLowerCase();
  if (name === "br") return "\n";
  if (name === "img") {
    const src = node.getAttribute("src") || "";
    return src.startsWith("http") ? `![${node.getAttribute("alt") || ""}](${src})` : "";
  }
  const inner = [...node.childNodes].map(inline).join("");
  const stripped = inner.trim();
  if (name === "a") {
    const href = node.getAttribute("href") || "";
    return !href || href.startsWith("#") || !stripped ? inner : `[${stripped}](${href})`;
  }
  if (name in WRAPPERS && stripped && !stripped.includes("\n")) {
    const mark = WRAPPERS[name];
    const lead = inner.slice(0, inner.length - inner.trimStart().length);
    const trail = inner.slice(inner.trimEnd().length);
    return `${lead}${mark}${stripped}${mark}${trail}`;
  }
  if ((name === "sup" || name === "sub") && stripped) return `<${name}>${stripped}</${name}>`;
  return inner;
}

function tidy(text) {
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
