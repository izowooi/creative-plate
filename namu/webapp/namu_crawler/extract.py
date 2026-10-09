"""나무위키 문서 HTML(SSR)에서 본문을 구조 기반으로 추출한다.

나무위키의 CSS 클래스명은 배포마다 바뀌는 해시(예: YujukE4J)라서 클래스 선택자는 쓰지 않는다.
대신 바뀌지 않는 의미 단위(h1, 라이선스 링크, 목차/각주 앵커, /w/ 링크)를 기준으로 영역을 찾는다.
원본 클래스와 data-v-* 속성은 그대로 남겨, 같은 페이지에서 받은 CSS로 원본 모양을 재현한다.
"""
from __future__ import annotations

import re
from copy import copy
from dataclasses import dataclass, field
from urllib.parse import unquote, urljoin

from bs4 import BeautifulSoup, NavigableString, Tag

BASE_URL = "https://namu.wiki"

_BLOCK_STATUSES = {403, 429, 503, 520, 521, 522, 523, 524, 525, 526, 527, 530}
_BLOCK_MARKERS = (
    "challenges.cloudflare.com",
    "cf-turnstile",
    "cf-chl-",
    "Just a moment...",
    "Attention Required! | Cloudflare",
    "Checking your browser",
)
_HEADING_SELECTOR = ", ".join(f'{h} a[href="#toc"]' for h in ("h2", "h3", "h4", "h5", "h6"))
_REMOVE_TAGS = ("script", "style", "noscript", "iframe", "object", "embed", "template", "link", "meta",
                "form", "button", "input", "textarea", "select")
_SAFE_HREF = re.compile(r"^(?:#|https?:|mailto:)", re.I)
_CATEGORY_PREFIX = "분류:"


class ExtractError(Exception):
    """추출 실패의 공통 부모."""


class Blocked(ExtractError):
    """차단·챌린지·속도 제한으로 정상 문서를 받지 못함."""


class NotFound(ExtractError):
    """나무위키가 '문서 없음'을 돌려줌."""


class LayoutChanged(ExtractError):
    """나무위키 페이지는 맞지만 본문 영역을 찾지 못함(사이트 구조 변경 또는 챌린지)."""


@dataclass
class Link:
    title: str
    url: str


@dataclass
class Section:
    level: int
    number: str
    title: str
    anchor: str


@dataclass
class Document:
    title: str
    url: str
    html: str                       # 렌더링용 정제 본문 조각
    stylesheets: list[str]          # 같은 페이지에서 읽은 스킨 CSS (절대 URL)
    last_modified: str | None = None
    categories: list[Link] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)
    links: list[Link] = field(default_factory=list)
    images: list[str] = field(default_factory=list)


def is_namu_page(html: str) -> bool:
    return 'name="generator" content="the seed"' in html[:30000]


def check_response(status: int, html: str) -> None:
    """응답이 정상 문서가 아니면 Blocked/NotFound 로 알린다."""
    namu = is_namu_page(html)
    if status in _BLOCK_STATUSES:
        raise Blocked(f"HTTP {status}")
    if not namu:
        marker = next((m for m in _BLOCK_MARKERS if m in html), None)
        raise Blocked(f"챌린지 감지: {marker}" if marker else f"나무위키 응답이 아님(HTTP {status})")
    if status == 404:
        raise NotFound("문서가 없습니다")
    if status >= 400:
        raise Blocked(f"HTTP {status}")
    if "<h1" not in html or "creativecommons.org/licenses" not in html:
        raise LayoutChanged("제목 또는 라이선스 영역이 없는 응답")


def extract_document(html: str, url: str) -> Document:
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    main = _find_main(soup, h1)
    if h1 is None or main is None:
        raise LayoutChanged("본문 영역을 찾지 못했습니다(사이트 구조 변경 또는 챌린지 응답)")

    title = h1.get_text(strip=True)
    last_modified = _last_modified(soup)
    stylesheets = [urljoin(BASE_URL, link["href"]) for link in soup.find_all("link", rel="stylesheet")
                   if link.get("href")]

    main = main.extract()
    _remove_ads(main)
    _clean(main)
    _mark_structure(main)
    sections = _sections(main)
    categories = _categories(main)
    links = _links(main)
    images = _images(main)

    wrapper = soup.new_tag("div", attrs={"class": "namu-doc"})
    head = soup.new_tag("div", attrs={"class": "namu-head"})
    head.append(copy(h1))
    if last_modified:
        meta = soup.new_tag("div", attrs={"class": "namu-meta"})
        meta.append(NavigableString("최근 수정 시각: "))
        time = soup.new_tag("time", attrs={"datetime": last_modified})
        time.string = last_modified.replace("T", " ").replace(".000Z", "")
        meta.append(time)
        head.append(meta)
    wrapper.append(head)
    wrapper.append(main)

    return Document(
        title=title, url=url, html=str(wrapper), stylesheets=stylesheets, last_modified=last_modified,
        categories=categories, sections=sections, links=links, images=images,
    )


# ---------- 본문 영역 탐지 ----------

def _find_main(soup: BeautifulSoup, h1: Tag | None) -> Tag | None:
    """두 방법으로 찾고, 앞의 것이 실패하면 뒤의 것을 쓴다.

    1) h1 과 라이선스 푸터 사이의 가장 큰 형제 블록 (제목 헤더 ~ 푸터 사이가 본문 영역)
    2) 문단 제목/각주 앵커의 공통 조상에서 h1 을 포함하는 직전까지 올라간 블록
    """
    if h1 is None:
        return None
    return _main_between_title_and_license(soup, h1) or _main_from_anchors(soup, h1)


def _main_between_title_and_license(soup: BeautifulSoup, h1: Tag) -> Tag | None:
    license_link = soup.find("a", href=re.compile(r"creativecommons\.org/licenses"))
    if license_link is None:
        return None
    h1_parents = {id(p) for p in h1.parents}
    common = next((p for p in license_link.parents if id(p) in h1_parents), None)
    if common is None:
        return None
    siblings = [c for c in common.children if isinstance(c, Tag)]
    i_title = _index_of(siblings, _child_containing(common, h1))
    i_license = _index_of(siblings, _child_containing(common, license_link))
    if i_title is None or i_license is None or i_title >= i_license:
        return None
    between = [c for c in siblings[i_title + 1:i_license] if _text_len(c) > 0]
    return max(between, key=_text_len) if between else None


def _main_from_anchors(soup: BeautifulSoup, h1: Tag) -> Tag | None:
    anchors = soup.select(_HEADING_SELECTOR) + soup.select('a[href^="#rfn-"]')
    if not anchors:
        return None
    node = anchors[0]
    for other in anchors[1:]:
        node_ancestors = {id(p) for p in [node, *node.parents]}
        node = next(p for p in [other, *other.parents] if id(p) in node_ancestors)
    while node.parent is not None and node.parent.name not in ("body", "html", "[document]"):
        if node.parent.find("h1") is not None:
            break
        node = node.parent
    return node if node is not h1 else None


def _child_containing(parent: Tag, node: Tag) -> Tag:
    cur = node
    while cur.parent is not parent:
        cur = cur.parent
    return cur


def _index_of(items: list[Tag], item: Tag) -> int | None:
    return next((i for i, x in enumerate(items) if x is item), None)


def _text_len(tag: Tag) -> int:
    return len(tag.get_text(strip=True))


def _last_modified(soup: BeautifulSoup) -> str | None:
    label = soup.find(string=re.compile("최근 수정 시각"))
    if label is None:
        return None
    time = label.parent.find("time") or (label.parent.parent.find("time") if label.parent.parent else None)
    if time is None:
        return None
    return time.get("datetime") or time.get_text(strip=True)


# ---------- 정제 ----------

def _remove_ads(main: Tag) -> None:
    """광고는 href="#s-N" 가짜 앵커로만 이루어진 표로 위장한다.

    실제 목차·문단 링크와 달리 링크 문구가 대상 문단 제목과 다르고, 블록 안의 모든 글자가 그런 앵커 안에 있다.
    """
    titles = {a.get("id"): _heading_title(a.parent) for a in main.select(_HEADING_SELECTOR) if a.get("id")}
    suspects = [a for a in main.find_all("a", href=re.compile(r"^#s-"))
                if not _matches_heading(a, titles)]
    for anchor in suspects:
        if anchor.decomposed:
            continue
        block = anchor
        while block.parent is not None and block.parent is not main and _only_section_anchors(block.parent):
            block = block.parent
        if block.name in ("table", "div") and len(block.find_all("a", href=re.compile(r"^#s-"))) >= 3:
            block.decompose()


def _matches_heading(anchor: Tag, titles: dict[str, str]) -> bool:
    text = re.sub(r"\s+", "", anchor.get_text())
    if not text or re.fullmatch(r"[\d.]+", text):
        return True  # 목차 번호처럼 글자가 없거나 숫자뿐인 링크
    target = re.sub(r"\s+", "", titles.get(anchor["href"][1:], ""))
    return bool(target) and (target in text or text in target)


def _only_section_anchors(block: Tag) -> bool:
    for s in block.strings:
        if not s.strip():
            continue
        if not any(p.name == "a" and p.get("href", "").startswith("#s-") for p in _parents_until(s, block)):
            return False
    return True


def _parents_until(node, stop: Tag):
    for p in node.parents:
        yield p
        if p is stop:
            return


def _heading_title(heading: Tag) -> str:
    parts = []
    for s in heading.strings:
        skip = any(p.name == "a" and (p.get("href") == "#toc" or p.get("href", "").startswith("/edit/"))
                   for p in _parents_until(s, heading))
        if not skip:
            parts.append(s)
    return "".join(parts).strip()


def _clean(main: Tag) -> None:
    for tag in main.find_all(_REMOVE_TAGS):
        tag.decompose()
    for edit in main.select('a[href^="/edit/"]'):
        wrapper = edit.parent
        edit.decompose()
        if wrapper is not main and not wrapper.get_text(strip=True) and wrapper.name == "span":
            wrapper.decompose()
    for tag in main.find_all(True):
        for attr in [a for a in tag.attrs if a.lower().startswith("on")]:
            del tag.attrs[attr]
        if tag.name == "img":
            _fix_image(tag)
        elif tag.name == "a":
            _fix_link(tag)


def _fix_image(img: Tag) -> None:
    real = img.attrs.pop("data-src", None)
    if real:
        img["src"] = real  # 지연 로딩: 자리표시 SVG 를 실제 주소로 교체
    for attr in ("src", "srcset"):
        if img.get(attr, "").startswith("//"):
            img[attr] = "https:" + img[attr]


def _fix_link(a: Tag) -> None:
    href = a.get("href")
    if href is None or href.startswith("#"):
        return
    href = urljoin(BASE_URL + "/", href)
    if not _SAFE_HREF.match(href):
        del a["href"]
        return
    a["href"] = href
    a["target"] = "_blank"
    a["rel"] = "noopener noreferrer"


def _mark_structure(main: Tag) -> None:
    """내보내기에서 쓸 의미 단위에 data-namu 표시를 단다(해시 클래스 대신 쓰는 우리 쪽 표식)."""
    for ul in main.find_all("ul"):
        anchors = ul.select("li > a[href]")
        if anchors and all(_is_category_href(a["href"]) for a in anchors):
            ul.parent["data-namu"] = "categories"
            break
    numbers = [a for a in main.find_all("a", href=re.compile(r"^#s-")) if re.fullmatch(r"[\d.]+", a.get_text(strip=True))]
    if len(numbers) >= 2:
        toc = numbers[0]
        for other in numbers[1:]:
            toc_ancestors = {id(p) for p in [toc, *toc.parents]}
            toc = next(p for p in [other, *other.parents] if id(p) in toc_ancestors)
        if toc.parent is not None and toc.parent.name == "details":
            toc = toc.parent
        if toc is not main and not toc.find(re.compile(r"^h[2-6]$")):
            toc["data-namu"] = "toc"
    for note in main.select('span[id^="fn-"]'):
        note.parent["data-namu"] = "footnote"


# ---------- 메타데이터 ----------

def _sections(main: Tag) -> list[Section]:
    sections = []
    for a in main.select(_HEADING_SELECTOR):
        heading = a.parent
        sections.append(Section(
            level=int(heading.name[1]),
            number=a.get_text(strip=True).rstrip("."),
            title=_heading_title(heading),
            anchor=a.get("id", ""),
        ))
    return sections


def _categories(main: Tag) -> list[Link]:
    for ul in main.find_all("ul"):
        anchors = ul.select("li > a[href]")
        if anchors and all(_is_category_href(a["href"]) for a in anchors):
            return [Link(a.get_text(strip=True), a["href"]) for a in anchors]
    return []


def _is_category_href(href: str) -> bool:
    return unquote(href).split("/w/", 1)[-1].startswith(_CATEGORY_PREFIX)


def _links(main: Tag) -> list[Link]:
    seen: dict[str, Link] = {}
    for a in main.find_all("a", href=re.compile(r"^https://namu\.wiki/w/")):
        url = a["href"]
        if url not in seen:
            seen[url] = Link(a.get("title") or a.get_text(strip=True), url)
    return list(seen.values())


def _images(main: Tag) -> list[str]:
    seen: dict[str, None] = {}
    for img in main.find_all("img", src=re.compile(r"^https?://")):
        seen.setdefault(img["src"])
    return list(seen)
