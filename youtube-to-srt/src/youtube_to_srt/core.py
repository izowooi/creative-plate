"""CLI와 UI가 공유하는 순수 로직: 모드 정의, URL 텍스트 파서."""
from __future__ import annotations

from enum import Enum

MAX_URLS = 10


class Mode(str, Enum):
    EXTRACT = "extract"
    TRANSCRIBE = "transcribe"
    ALL = "all"


def parse_urls_text(text: str) -> list[str]:
    """여러 줄 텍스트에서 URL 리스트를 추출한다.

    - 각 줄을 strip
    - 빈 줄 및 '#' 로 시작하는 주석 줄은 무시
    - 결과가 0개면 ValueError
    - 결과가 MAX_URLS 초과면 ValueError
    """
    urls: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        urls.append(line)

    if not urls:
        raise ValueError("URL이 하나도 없습니다. 한 줄에 하나씩 입력하세요.")
    if len(urls) > MAX_URLS:
        raise ValueError(
            f"URL 개수는 최대 {MAX_URLS}개까지 허용됩니다 (받은 개수: {len(urls)})."
        )
    return urls
