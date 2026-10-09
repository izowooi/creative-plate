"""크롤링 대상 입력(URL 또는 문서명)을 문서 제목으로 정규화한다."""
import re
from dataclasses import dataclass
from urllib.parse import quote, unquote, urlsplit

BASE_URL = "https://namu.wiki"
_HOSTS = {"namu.wiki", "www.namu.wiki", "m.namu.wiki"}
_SCHEMELESS = re.compile(r"^(?:www\.|m\.)?namu\.wiki/", re.I)


@dataclass(frozen=True)
class Target:
    title: str
    raw: str

    @property
    def url(self) -> str:
        return title_to_url(self.title)


def title_to_url(title: str) -> str:
    # ? # % + & 는 인코딩하고 하위 문서 구분자 / 와 namespace 구분자 : 는 그대로 둔다
    return f"{BASE_URL}/w/{quote(title, safe='/:()')}"


def _looks_like_url(s: str) -> bool:
    return s.lower().startswith(("http://", "https://")) or bool(_SCHEMELESS.match(s))


def parse_entry(entry: str) -> Target:
    s = entry.strip()
    if s.startswith("<") and s.endswith(">"):
        s = s[1:-1].strip()
    if _looks_like_url(s):
        if "://" not in s:
            s = "https://" + s
        parts = urlsplit(s)
        if (parts.hostname or "").lower() not in _HOSTS:
            raise ValueError("나무위키 URL이 아닙니다")
        if not parts.path.startswith("/w/"):
            raise ValueError("문서 URL(/w/...)만 지원합니다")
        title = unquote(parts.path[len("/w/"):])  # #앵커, ?from= 은 urlsplit 이 이미 분리
    else:
        title = s  # 문서명 그대로. C#, 우리말? 처럼 # ? 가 제목에 들어갈 수 있다
    title = title.strip()
    if not title:
        raise ValueError("문서명이 비어 있습니다")
    return Target(title=title, raw=entry.strip())


def parse_targets(text: str) -> tuple[list[Target], list[tuple[str, str]]]:
    """줄 단위 입력을 (대상 목록, 오류 목록)으로 변환한다. 중복 제목은 첫 항목만 남긴다.

    문서명에 공백이 있을 수 있어 한 줄을 한 항목으로 보되,
    한 줄에 URL이 공백으로 여러 개 붙어 있으면 URL 단위로 나눈다.
    """
    targets: list[Target] = []
    errors: list[tuple[str, str]] = []
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        tokens = line.split() if re.match(r"(?i)https?://\S+\s+https?://", line) else [line]
        for token in tokens:
            try:
                target = parse_entry(token)
            except ValueError as e:
                errors.append((token, str(e)))
                continue
            if target.title not in seen:
                seen.add(target.title)
                targets.append(target)
    return targets, errors
