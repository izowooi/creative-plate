"""수집 결과를 단독 HTML, Markdown, JSON, ZIP 으로 내보낸다."""
from __future__ import annotations

import io
import json
import re
import zipfile
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Callable

from bs4 import BeautifulSoup, Comment, NavigableString, Tag

from .crawler import CrawlResult

LICENSE_URL = "https://creativecommons.org/licenses/by-nc-sa/2.0/kr/"
_KST = timezone(timedelta(hours=9))

# 저장한 HTML 을 파일로 열 때도 위키 콘텐츠의 스크립트가 실행되지 않도록 한다
_PAGE_CSP = ("default-src 'none'; img-src https: data:; style-src 'unsafe-inline' 'self' https:; "
             "font-src 'self' https: data:; base-uri 'none'; form-action 'none'")

_BASE_CSS = """
html{background:#fff}
body{margin:0}
.namu-page{max-width:1000px;margin:0 auto;padding:16px 20px 32px}
.namu-meta{font-size:12px;color:#666;margin:4px 0 12px}
.namu-source{max-width:1000px;margin:0 auto;padding:12px 20px 32px;font:12px/1.6 sans-serif;color:#666;
  border-top:1px solid #ddd}
.namu-source a{color:#4188f1}
.namu-error{max-width:1000px;margin:40px auto;padding:0 20px;font:15px/1.7 sans-serif}
"""


def kst(ts: float) -> str:
    return datetime.fromtimestamp(ts, _KST).strftime("%Y-%m-%d %H:%M:%S KST")


def render_page(result: CrawlResult, *, css_href: Callable[[str], str] | None = None,
                css_text: Callable[[str, str], str | None] | None = None) -> str:
    """수집한 문서를 한 장의 HTML 로 만든다.

    css_href(key) 가 있으면 <link> 로, 없고 css_text(key, 문서 HTML) 가 있으면 <style> 로 인라인한다(오프라인 저장용).
    같은 배포의 CSS 를 쓰므로 원본 클래스를 그대로 두어도 원본 모양이 재현된다.
    """
    if result.status != "ok" or result.doc is None:
        return _message_page(result)
    doc, page = result.doc, result.page
    styles = []
    for url in doc.stylesheets:
        key = result.css.get(url)
        if key and css_href:
            styles.append(f'<link rel="stylesheet" href="{escape(css_href(key))}">')
        elif key and css_text and (text := css_text(key, doc.html)):
            styles.append("<style>" + text.replace("</style", "<\\/style") + "</style>")
        else:
            styles.append(f'<link rel="stylesheet" href="{escape(url)}">')  # 캐시 실패 시 원본 주소
    note = f" · {escape(page.note)}" if page.note else ""
    source = (f'출처: <a href="{escape(doc.url)}" target="_blank" rel="noopener noreferrer">{escape(doc.url)}</a>'
              f" · 수집: {kst(page.fetched_at)} ({escape(page.via)}){note}<br>"
              f'이 저작물은 <a href="{LICENSE_URL}" target="_blank" rel="noopener noreferrer">CC BY-NC-SA 2.0 KR</a>'
              " 에 따라 이용할 수 있습니다. (비영리 · 출처 표시 · 동일 조건 변경 허락)")
    return (
        '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f'<meta http-equiv="Content-Security-Policy" content="{_PAGE_CSP}">'
        f"<title>{escape(doc.title)} - 나무위키 (수집본)</title>"
        f"<style>{_BASE_CSS}</style>{''.join(styles)}</head>"
        f'<body class="theseed-light-mode"><div id="app"><div class="namu-page">{doc.html}</div>'
        f'<div class="namu-source">{source}</div></div></body></html>'
    )


def _message_page(result: CrawlResult) -> str:
    if result.status == "not_found":
        body = f"<h2>문서가 없습니다</h2><p>나무위키에 &lsquo;{escape(result.title)}&rsquo; 문서가 없습니다.</p>"
    else:
        body = f"<h2>수집하지 못했습니다</h2><p>{escape(result.error or '알 수 없는 오류')}</p>"
    return (f'<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>{_BASE_CSS}</style></head>'
            f'<body><div class="namu-error">{body}</div></body></html>')


# ---------- Markdown ----------

_BLOCK_TAGS = {"div", "p", "table", "ul", "ol", "li", "blockquote", "details", "summary", "hr", "pre",
               "h1", "h2", "h3", "h4", "h5", "h6"}


def to_markdown(result: CrawlResult) -> str:
    if result.status != "ok" or result.doc is None or result.page is None:
        return f"# {result.title}\n\n> {'문서 없음' if result.status == 'not_found' else result.error}\n"
    doc, page = result.doc, result.page
    soup = BeautifulSoup(doc.html, "html.parser")
    body = soup.select_one("div.namu-doc")
    body.select_one("div.namu-head").decompose()
    for block in body.select('[data-namu="categories"], [data-namu="toc"]'):
        block.decompose()  # 분류는 머리말에, 목차는 제목 구조로 대체된다
    header = [f"# {doc.title}", ""]
    meta = [f"> 출처: <{doc.url}>", f"> 수집: {kst(page.fetched_at)} ({page.via}"
            + (f", {page.note}" if page.note else "") + ")"]
    if doc.last_modified:
        meta.append(f"> 최근 수정 시각: {doc.last_modified.replace('T', ' ').replace('.000Z', '')} UTC")
    meta.append(f"> 라이선스: [CC BY-NC-SA 2.0 KR]({LICENSE_URL})")
    if doc.categories:
        meta.append("> 분류: " + ", ".join(c.title for c in doc.categories))
    blocks = _container(body)
    return "\n".join(header + [m + "  " for m in meta]) + "\n\n" + "\n\n".join(blocks).strip() + "\n"


def _has_block(node) -> bool:
    return isinstance(node, Tag) and (node.name in _BLOCK_TAGS or node.get("data-namu") == "footnote"
                                      or node.find(list(_BLOCK_TAGS)) is not None
                                      or node.find(attrs={"data-namu": "footnote"}) is not None)


def _container(node: Tag) -> list[str]:
    out: list[str] = []
    run: list[str] = []

    def flush() -> None:
        text = _tidy("".join(run))
        if text:
            out.append(text)
        run.clear()

    for child in node.children:
        if isinstance(child, Comment):
            continue
        if _has_block(child):
            flush()
            out.extend(_blocks(child))
        else:
            run.append(_inline(child))
    flush()
    return out


def _blocks(tag: Tag) -> list[str]:
    name = tag.name
    if re.fullmatch(r"h[1-6]", name):
        text = _tidy(_inline(tag)).replace("\n", " ")
        return [f"{'#' * int(name[1])} {text}"] if text else []
    if name == "table":
        return _table(tag)
    if name in ("ul", "ol"):
        return [_list(tag)]
    if name == "blockquote":
        inner = "\n\n".join(_container(tag))
        return ["\n".join("> " + line for line in inner.splitlines())] if inner else []
    if name == "details":
        summary = tag.find("summary", recursive=False)
        title = _tidy(_inline(summary)).replace("\n", " ") if summary else ""
        if summary:
            summary.decompose()
        inner = _container(tag)
        return ([f"**{title}**"] if title else []) + inner
    if tag.get("data-namu") == "footnote":
        text = _tidy(_inline(tag))
        return [text] if text else []
    if name == "hr":
        return ["---"]
    if name == "pre":
        return ["```\n" + tag.get_text() + "\n```"]
    return _container(tag)


def _list(tag: Tag) -> str:
    lines = []
    ordered = tag.name == "ol"
    for i, li in enumerate(tag.find_all("li", recursive=False), 1):
        parts = _container(li)
        if not parts:
            continue
        marker = f"{i}. " if ordered else "- "
        pad = " " * len(marker)
        first, rest = parts[0], parts[1:]
        text = marker + first.replace("\n", "\n" + pad)
        for part in rest:
            text += "\n" + pad + part.replace("\n", "\n" + pad)
        lines.append(text)
    return "\n".join(lines)


def _table(tag: Tag) -> list[str]:
    rows = [tr for tr in tag.find_all("tr") if tr.find_parent("table") is tag]
    cells = [[c for c in tr.find_all(["td", "th"], recursive=False)] for tr in rows]
    cells = [r for r in cells if r]
    if len(cells) == 1 and len(cells[0]) == 1:  # 상자 모양을 내는 1칸짜리 표는 내용만 꺼낸다
        return _container(cells[0][0])
    grid: list[list[str]] = []
    for row in cells:
        line: list[str] = []
        for cell in row:
            text = " <br> ".join(p.replace("\n", " <br> ") for p in _container(cell)).replace("|", "\\|")
            line.append(text)
            line.extend([""] * (int(re.sub(r"\D", "", cell.get("colspan", "1")) or 1) - 1))
        grid.append(line)
    if not grid:
        return []
    width = max(len(r) for r in grid)
    grid = [r + [""] * (width - len(r)) for r in grid]
    md = ["| " + " | ".join(grid[0]) + " |", "|" + " --- |" * width]
    md += ["| " + " | ".join(r) + " |" for r in grid[1:]]
    return ["\n".join(md)]


def _inline(node) -> str:
    if isinstance(node, Comment):
        return ""
    if isinstance(node, NavigableString):
        return re.sub(r"\s+", " ", str(node))
    name = node.name
    if name == "br":
        return "\n"
    if name == "img":
        src = node.get("src", "")
        return "" if not src.startswith("http") else f"![{node.get('alt', '')}]({src})"
    inner = "".join(_inline(c) for c in node.children)
    stripped = inner.strip()
    if name == "a":
        href = node.get("href", "")
        return inner if not href or href.startswith("#") or not stripped else f"[{stripped}]({href})"
    wrappers = {"strong": "**", "b": "**", "em": "*", "i": "*", "del": "~~", "s": "~~", "strike": "~~",
                "code": "`"}
    if name in wrappers and stripped and "\n" not in stripped:
        mark = wrappers[name]
        lead = inner[:len(inner) - len(inner.lstrip())]
        trail = inner[len(inner.rstrip()):]
        return f"{lead}{mark}{stripped}{mark}{trail}"
    if name in ("sup", "sub") and stripped:
        return f"<{name}>{stripped}</{name}>"
    return inner


def _tidy(text: str) -> str:
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


# ---------- JSON / 파일명 / ZIP ----------

def to_json(result: CrawlResult) -> str:
    data: dict = {"key": result.key, "requested": result.title, "status": result.status,
                  "error": result.error, "elapsed": round(result.elapsed, 2)}
    if result.page:
        data["fetch"] = {"via": result.page.via, "note": result.page.note, "status": result.page.status,
                         "url": result.page.url, "fetched_at": kst(result.page.fetched_at)}
    if result.doc:
        data["document"] = asdict(result.doc)
        data["markdown"] = to_markdown(result)
    return json.dumps(data, ensure_ascii=False, indent=2)


def safe_filename(title: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", title).strip(" .") or "untitled"
    return name[:100]


def build_zip(results: list[CrawlResult], fmt: str, css_text: Callable[[str, str], str | None]) -> bytes:
    """fmt: html | md | json. 파일명이 겹치면 키를 덧붙인다."""
    buf = io.BytesIO()
    used: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for r in results:
            name = safe_filename(r.title)
            if name in used:
                name = f"{name}_{r.key[:6]}"
            used.add(name)
            zf.writestr(f"{name}.{fmt}", render_one(r, fmt, css_text))
    return buf.getvalue()


def render_one(result: CrawlResult, fmt: str, css_text: Callable[[str, str], str | None]) -> str:
    if fmt == "html":
        return render_page(result, css_text=css_text)
    if fmt == "md":
        return to_markdown(result)
    if fmt == "json":
        return to_json(result)
    raise ValueError(f"지원하지 않는 형식: {fmt}")
