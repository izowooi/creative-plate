from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Literal

from remind_prompt.time_utils import (
    ScheduleError,
    get_zone,
    resolve_local,
    resolve_relative,
    to_db,
    to_utc,
    utc_now,
)

DEFAULT_MAX_DOCUMENT_BYTES = 1_000_000
DEFAULT_MAX_TOTAL_BYTES = 5_000_000
DEFAULT_MAX_DOCUMENTS = 200
DEFAULT_TIMEZONE = "Asia/Seoul"

TriggerType = Literal["absolute", "relative", "fuzzy", "event", "count"]


class ImportValidationError(ValueError):
    """Raised when an in-memory import document fails a safety check."""


@dataclass(frozen=True, slots=True)
class ImportDocument:
    """An in-memory Markdown document.

    ``timestamp`` is optional source metadata, not the time at which the import is
    performed. Naive timestamps are interpreted in the requested import timezone.
    """

    name: str
    content: str | bytes
    timestamp: datetime | date | str | None = None


@dataclass(frozen=True, slots=True)
class ImportCandidate:
    """A reminder proposal. Extracting one never persists it."""

    id: str
    hash: str
    title: str
    prompt_text: str
    destination_label: str
    source_label: str
    source_ref: str
    trigger_type: TriggerType
    original_phrase: str
    evidence: str
    confidence: float
    due_at: datetime | None
    due_local: str | None
    schedule_expression: str | None
    timezone: str
    requires_confirmation: bool
    warnings: tuple[str, ...]

    @property
    def candidate_hash(self) -> str:
        return self.hash

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-safe representation for preview APIs."""

        return {
            "id": self.id,
            "hash": self.hash,
            "title": self.title,
            "prompt_text": self.prompt_text,
            "destination_label": self.destination_label,
            "source_label": self.source_label,
            "source_ref": self.source_ref,
            "trigger_type": self.trigger_type,
            "original_phrase": self.original_phrase,
            "evidence": self.evidence,
            "confidence": self.confidence,
            "due_at": to_db(self.due_at) if self.due_at is not None else None,
            "due_local": self.due_local,
            "schedule_expression": self.schedule_expression,
            "timezone": self.timezone,
            "requires_confirmation": self.requires_confirmation,
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True, slots=True)
class _ParsedDocument:
    name: str
    text: str
    title: str
    source_time: datetime
    source_time_kind: str
    lines: tuple[tuple[int, str, str], ...]


@dataclass(frozen=True, slots=True)
class _Trigger:
    kind: TriggerType
    phrase: str
    start: int
    amount: int | None = None
    unit: Literal["day", "week", "month"] | None = None
    year: int | None = None
    month: int | None = None
    day: int | None = None


_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
_MARKDOWN_PREFIX_RE = re.compile(r"^\s*(?:>\s*)?(?:(?:[-+*]|\d+[.)])\s+)?(?:\[[ xX]\]\s*)?")
_INLINE_MARKUP_RE = re.compile(r"(?:\*\*|__|~~|`)")
_SPACE_RE = re.compile(r"\s+")
_GENERIC_TITLE_RE = re.compile(
    r"^(?:작업\s*요약|업무\s*요약|태스크\s*요약|task[\s_-]*summary|summary|요약)\s*$",
    re.IGNORECASE,
)
_TITLE_PREFIX_RE = re.compile(
    r"^(?:작업\s*요약|업무\s*요약|태스크\s*요약|task[\s_-]*summary)\s*[:：|\-]\s*",
    re.IGNORECASE,
)
_REQUEST_SECTION_RE = re.compile(
    r"(?:요청|요구|할\s*일|해야\s*할\s*일|후속|추가\s*작업|next\s*action|todo)",
    re.IGNORECASE,
)
_RESULT_SECTION_RE = re.compile(
    r"(?:결과|완료|수행\s*내용|작업\s*내용|result|outcome)", re.IGNORECASE
)
_SOURCE_TIME_LABEL_RE = re.compile(
    r"^\s*(?:[-+*]\s*)?(?:\*\*|__)?"
    r"(?:작업\s*시각|작업\s*일시|작성\s*시각|작성\s*일시|작업일|작성일)"
    r"(?:\*\*|__)?\s*[:：]\s*(.+?)\s*$",
    re.IGNORECASE,
)

# Strong grammar is preferred over a bag of task-related nouns. This is the
# central guard against turning every date in an old task summary into a task.
_DIRECTIVE_RE = re.compile(
    r"(?:"
    r"TODO\b|TO[- ]?DO\b|리마인드|잊지\s*말|챙겨|"
    r"해\s*(?:줘|주세요|두자|둘\s*것)|하자|해야(?:\s*(?:함|한다|할\s*것))?|"
    r"(?:확인|검토|정리|작성|제출|전송|공유|연락|배포|실행|업데이트|예약|신청|"
    r"재시도|처리|점검|준비|비교|반영|논의|결정|보고|테스트|문의|회신)"
    r"(?:해\s*(?:줘|주세요)|하자|해야|하기|할\s*(?:것|예정|필요)|\s*필요)"
    r")",
    re.IGNORECASE,
)
_ACTION_NOUN_RE = re.compile(
    r"(?:확인|검토|정리|작성|제출|전송|공유|연락|배포|실행|업데이트|예약|신청|"
    r"재시도|처리|점검|준비|비교|반영|논의|결정|보고|테스트|문의|회신)"
)
_FUTURE_CUE_RE = re.compile(
    r"(?:까지|전에|이전에|후에|뒤에|때|예정|필요|해야|하도록|할\s*것|하기|"
    r"해\s*(?:줘|주세요)|하자|잊지\s*말|TODO)",
    re.IGNORECASE,
)
_PAST_OR_DONE_RE = re.compile(
    r"(?:"
    r"^\s*(?:[-+*]\s*)?\[[xX]\]|^\s*(?:[-+*]\s*)?(?:✅|☑)|"
    r"(?:완료|종료|마침|처리됨|해결됨)\s*(?:[.!。]|$)|"
    r"(?:했|하였|됐|되었|였|마쳤|확인했|검토했|작성했|배포했|처리했)"
    r"(?:습니다|다|음|어요|고|으며|던)?(?:[.!。]|\s|$)"
    r")"
)
_UNCHECKED_RE = re.compile(r"^\s*(?:[-+*]\s*)?\[\s\]")
_CHECKED_RE = re.compile(r"^\s*(?:[-+*]\s*)?\[[xX]\]")

_COUNT_TRIGGER_RE = re.compile(
    r"(?<!\d)(?P<count>\d{1,4})\s*(?:개|건|회|명|번|단계|항목|task|tasks)\s*"
    r"(?:가\s*)?(?:완료|처리|수집|확보|도달|끝(?:난|나))\s*(?:후|뒤|때)",
    re.IGNORECASE,
)
_FUZZY_TRIGGER_RE = re.compile(
    r"(?:"
    r"(?:\d{1,2}\s*월|이번\s*달|다음\s*달|다다음\s*달)\s*(?:초|초순|중순|말|말일|쯤)|"
    r"(?:이번|다음)\s*주\s*(?:중|안|쯤)|"
    r"조만간|나중에|언젠가|적당한\s*때|시간\s*될\s*때"
    r")"
)
_RELATIVE_NUMBER_RE = re.compile(
    r"(?<!\d)(?P<amount>\d{1,4}|한|두|세|네)\s*"
    r"(?P<unit>일|주(?:일)?|달|개월)\s*(?:후|뒤|이내|안에|내에?)"
)
_RELATIVE_WORD_RE = re.compile(r"(?:다다음\s*(?:주|달)|다음\s*(?:주|달)|차주|내달|내일|모레)")
_ISO_DATE_RE = re.compile(r"(?<!\d)(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})(?!\d)")
_KOREAN_DATE_RE = re.compile(
    r"(?<!\d)(?P<year>\d{4})\s*년\s*(?P<month>\d{1,2})\s*월\s*"
    r"(?P<day>\d{1,2})\s*일"
)
_YEARLESS_DATE_RE = re.compile(r"(?<![\d년])(?P<month>\d{1,2})\s*월\s*(?P<day>\d{1,2})\s*일")
_EVENT_TRIGGER_RE = re.compile(
    r"(?:다음\s*)?(?P<event>"
    r"(?:[A-Za-z가-힣][A-Za-z0-9가-힣_-]*\s*){1,4}?"
    r")(?P<relation>직전|직후|전|후|때)"
    r"(?P<particle>에는|에도|에|까지는|까지도|까지|부터는|부터도|부터|만)?"
    r"(?![A-Za-z0-9가-힣_])"
)
_EVENT_STOPWORDS = {
    "일",
    "주",
    "주일",
    "달",
    "개월",
    "시간",
    "분",
    "초",
    "완료",
    "처리",
    "수집",
}
_OVERDUE_CUE_RE = re.compile(
    r"(?:지났|연체|기한\s*초과|아직|미완료|overdue|past\s+due)", re.IGNORECASE
)

_FILENAME_DATETIME_RE = re.compile(
    r"(?<!\d)(?P<year>20\d{2})[-_.]?(?P<month>\d{2})[-_.]?(?P<day>\d{2})"
    r"(?:[Tt _.-]?(?P<hour>[01]\d|2[0-3])[-_.:]?(?P<minute>[0-5]\d)"
    r"(?:[-_.:]?(?P<second>[0-5]\d))?)?(?!\d)"
)
_ISO_DATETIME_RE = re.compile(
    r"(?P<year>\d{4})-(?P<month>\d{1,2})-(?P<day>\d{1,2})"
    r"(?:[T\s]+(?P<hour>\d{1,2}):(?P<minute>\d{2})"
    r"(?::(?P<second>\d{2}))?(?P<offset>Z|[+-]\d{2}:?\d{2})?)?"
)
_KOREAN_DATETIME_RE = re.compile(
    r"(?P<year>\d{4})\s*년\s*(?P<month>\d{1,2})\s*월\s*"
    r"(?P<day>\d{1,2})\s*일"
    r"(?:\s*(?P<ampm>오전|오후)?\s*(?P<hour>\d{1,2})\s*시"
    r"(?:\s*(?P<minute>\d{1,2})\s*분?)?)?"
)
_CLOCK_RE = re.compile(
    r"(?:(?P<ampm>오전|오후)\s*)?(?P<hour>\d{1,2})\s*시"
    r"(?:\s*(?P<minute>\d{1,2})\s*분?)?"
    r"|(?<!\d)(?P<hour24>[01]?\d|2[0-3]):(?P<minute24>[0-5]\d)(?!\d)"
)

_SLACK_WEBHOOK_RE = re.compile(r"https://hooks\.slack\.com/services/[A-Za-z0-9/_-]+", re.IGNORECASE)
_GENERIC_WEBHOOK_RE = re.compile(r"https?://[^\s)]+/(?:webhooks?|hooks?)/[^\s)]+", re.IGNORECASE)
_URL_CREDENTIAL_RE = re.compile(r"(?i)(https?://)[^\s/@:]+:[^\s/@]+@")
_EMAIL_RE = re.compile(
    r"(?<![A-Za-z0-9_.+-])[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"
    r"(?![A-Za-z0-9_.+-])"
)
_BEARER_RE = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/=-]{12,}")
_KNOWN_TOKEN_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|"
    r"xox[baprs]-[A-Za-z0-9-]{12,}|AIza[A-Za-z0-9_-]{20,}|"
    r"(?:AKIA|ASIA)[A-Z0-9]{16})\b"
)
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}\b")
_PRIVATE_KEY_BLOCK_RE = re.compile(
    r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----.*?"
    r"-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    re.DOTALL,
)
_SECRET_ASSIGNMENT_RE = re.compile(
    r"(?i)(?P<prefix>[\"']?(?:password|passwd|pwd|api[_ -]?key|access[_ -]?token|"
    r"secret|webhook|aws[_-]?access[_-]?key[_-]?id|database[_-]?url|"
    r"connection[_-]?string|"
    r"[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*_(?:key|secret|token|password|credentials?)|"
    r"비밀번호|암호|토큰)[\"']?\s*[:=]\s*)"
    r"(?P<value>[\"'][^\"'\r\n]*[\"']|[^\s,;]+)"
)
_SECRET_QUERY_RE = re.compile(
    r"(?i)(?P<prefix>[?&](?:token|api[_-]?key|key|password|secret)=)[^&#\s)]+"
)


def sanitize_excerpt(value: str, *, max_chars: int = 500) -> str:
    """Redact common secret/PII shapes before returning source excerpts."""

    sanitized = _SLACK_WEBHOOK_RE.sub("[REDACTED_WEBHOOK]", value)
    sanitized = _GENERIC_WEBHOOK_RE.sub("[REDACTED_WEBHOOK]", sanitized)
    sanitized = _URL_CREDENTIAL_RE.sub(r"\1[REDACTED_CREDENTIALS]@", sanitized)
    sanitized = _PRIVATE_KEY_BLOCK_RE.sub("[REDACTED_PRIVATE_KEY]", sanitized)
    sanitized = _BEARER_RE.sub("Bearer [REDACTED_TOKEN]", sanitized)
    sanitized = _KNOWN_TOKEN_RE.sub("[REDACTED_TOKEN]", sanitized)
    sanitized = _JWT_RE.sub("[REDACTED_TOKEN]", sanitized)
    sanitized = _SECRET_ASSIGNMENT_RE.sub(
        lambda match: f"{match.group('prefix')}[REDACTED]", sanitized
    )
    sanitized = _SECRET_QUERY_RE.sub(lambda match: f"{match.group('prefix')}[REDACTED]", sanitized)
    sanitized = _EMAIL_RE.sub("[REDACTED_EMAIL]", sanitized)
    sanitized = _SPACE_RE.sub(" ", sanitized).strip()
    if len(sanitized) <= max_chars:
        return sanitized
    return f"{sanitized[: max_chars - 1].rstrip()}…"


def extract_candidates(
    documents: Iterable[ImportDocument | Mapping[str, Any]],
    *,
    now: datetime | None = None,
    timezone: str = DEFAULT_TIMEZONE,
    max_document_bytes: int = DEFAULT_MAX_DOCUMENT_BYTES,
    max_total_bytes: int = DEFAULT_MAX_TOTAL_BYTES,
    max_documents: int = DEFAULT_MAX_DOCUMENTS,
) -> list[ImportCandidate]:
    """Extract reminder candidates from in-memory Markdown documents.

    This is deliberately a preview-only operation: it accepts strings/bytes already
    supplied by the caller and has no database or filesystem access.
    """

    _validate_limits(max_document_bytes, max_total_bytes, max_documents)
    try:
        get_zone(timezone)
    except ScheduleError as exc:
        raise ImportValidationError("timezone must be a valid IANA timezone") from exc

    import_time = _coerce_aware(now or utc_now(), timezone, field="now")
    prepared: list[tuple[ImportDocument, str, int]] = []
    total_bytes = 0

    for index, raw_document in enumerate(documents):
        if index >= max_documents:
            raise ImportValidationError("document count exceeds the configured limit")
        document = _coerce_document(raw_document)
        _validate_name(document.name)
        text, size = _decode_content(document.content)
        if size > max_document_bytes:
            raise ImportValidationError("a document exceeds the configured byte limit")
        total_bytes += size
        if total_bytes > max_total_bytes:
            raise ImportValidationError("documents exceed the configured total byte limit")
        prepared.append((document, text, size))

    candidates: list[ImportCandidate] = []
    seen_hashes: set[str] = set()
    for document, text, _ in prepared:
        parsed = _parse_document(document, text, import_time, timezone)
        for line_number, raw_line, section in parsed.lines:
            if _CHECKED_RE.search(raw_line):
                continue
            unchecked = bool(_UNCHECKED_RE.search(raw_line))
            for fragment in _sentence_fragments(raw_line):
                trigger = _find_trigger(fragment)
                if trigger is None or not _is_actionable(
                    fragment, section, trigger, unchecked=unchecked
                ):
                    continue
                candidate = _build_candidate(
                    parsed,
                    fragment,
                    line_number,
                    trigger,
                    import_time,
                    timezone,
                )
                if candidate is not None and candidate.hash not in seen_hashes:
                    candidates.append(candidate)
                    seen_hashes.add(candidate.hash)

    return candidates


def preview_import(
    documents: Iterable[ImportDocument | Mapping[str, Any]],
    **kwargs: Any,
) -> list[ImportCandidate]:
    """Explicitly named alias for callers exposing an import-preview endpoint."""

    return extract_candidates(documents, **kwargs)


def _validate_limits(max_document_bytes: int, max_total_bytes: int, max_documents: int) -> None:
    for value, label in (
        (max_document_bytes, "max_document_bytes"),
        (max_total_bytes, "max_total_bytes"),
        (max_documents, "max_documents"),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ImportValidationError(f"{label} must be a positive integer")
    if max_document_bytes > max_total_bytes:
        raise ImportValidationError("max_document_bytes cannot exceed max_total_bytes")


def _coerce_document(raw: ImportDocument | Mapping[str, Any]) -> ImportDocument:
    if isinstance(raw, ImportDocument):
        return raw
    if not isinstance(raw, Mapping):
        raise ImportValidationError("each document must contain name and content")
    if "name" not in raw or "content" not in raw:
        raise ImportValidationError("each document must contain name and content")
    return ImportDocument(name=raw["name"], content=raw["content"], timestamp=raw.get("timestamp"))


def _validate_name(name: str) -> None:
    if not isinstance(name, str) or not name.strip():
        raise ImportValidationError("document name must be a non-empty string")
    try:
        encoded_name = name.encode("utf-8")
    except UnicodeEncodeError as exc:
        raise ImportValidationError("document name must be valid UTF-8") from exc
    if len(encoded_name) > 512:
        raise ImportValidationError("document name exceeds the configured safety limit")
    if "\x00" in name or any(ord(character) < 32 for character in name):
        raise ImportValidationError("document name contains control characters")
    normalized = name.replace("\\", "/")
    parts = normalized.split("/")
    if (
        normalized.startswith(("/", "~/"))
        or re.match(r"^[A-Za-z]:/", normalized)
        or any(part in {"", ".", "..", "~"} for part in parts)
    ):
        raise ImportValidationError("document name must be a safe relative name")


def _decode_content(content: str | bytes) -> tuple[str, int]:
    if isinstance(content, str):
        try:
            encoded = content.encode("utf-8")
        except UnicodeEncodeError as exc:
            raise ImportValidationError("document content must be valid UTF-8") from exc
        text = content
    elif isinstance(content, bytes):
        encoded = content
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ImportValidationError("document content must be valid UTF-8") from exc
    else:
        raise ImportValidationError("document content must be text or UTF-8 bytes")
    return text.removeprefix("\ufeff").replace("\r\n", "\n").replace("\r", "\n"), len(encoded)


def _parse_document(
    document: ImportDocument,
    text: str,
    import_time: datetime,
    timezone: str,
) -> _ParsedDocument:
    title = ""
    section = "other"
    lines: list[tuple[int, str, str]] = []
    metadata_time: datetime | None = None
    in_fence = False
    fence_marker = ""

    for number, line in enumerate(text.split("\n"), start=1):
        stripped = line.strip()
        if re.match(r"^\s*(```|~~~)", line):
            marker = stripped[:3]
            if not in_fence:
                in_fence = True
                fence_marker = marker
            elif marker == fence_marker:
                in_fence = False
                fence_marker = ""
            continue
        if in_fence:
            continue

        heading = _HEADING_RE.match(line)
        if heading:
            heading_text = _clean_markdown(heading.group(2))
            if len(heading.group(1)) == 1 and not title:
                title = _normalize_title(heading_text)
            if _REQUEST_SECTION_RE.search(heading_text):
                section = "request"
            elif _RESULT_SECTION_RE.search(heading_text):
                section = "result"
            else:
                section = "other"
            continue

        metadata = _SOURCE_TIME_LABEL_RE.match(line)
        if metadata:
            metadata_time = metadata_time or _parse_datetime_text(
                _clean_markdown(metadata.group(1)), timezone
            )
            continue
        if stripped and not _is_markdown_decoration(stripped):
            lines.append((number, line, section))

    source_time: datetime | None = None
    source_time_kind = "import_time"
    if metadata_time is not None:
        source_time = metadata_time
        source_time_kind = "document_metadata"
    else:
        filename_time = _parse_filename_datetime(document.name, timezone)
        if filename_time is not None:
            source_time = filename_time
            source_time_kind = "filename"
        elif document.timestamp is not None:
            source_time = _coerce_source_timestamp(document.timestamp, timezone)
            source_time_kind = "document_timestamp"
    source_time = source_time or import_time

    if not title:
        title = _title_from_filename(document.name)
    if not title or _GENERIC_TITLE_RE.fullmatch(title):
        title = _derive_title_from_lines(lines) or "가져온 리마인더"
    title = sanitize_excerpt(title, max_chars=140)

    return _ParsedDocument(
        name=document.name,
        text=text,
        title=title,
        source_time=source_time,
        source_time_kind=source_time_kind,
        lines=tuple(lines),
    )


def _is_markdown_decoration(value: str) -> bool:
    if re.fullmatch(r"(?:[-*_]\s*){3,}", value):
        return True
    return value.startswith("|") and value.endswith("|")


def _clean_markdown(value: str) -> str:
    cleaned = _MARKDOWN_PREFIX_RE.sub("", value)
    cleaned = _INLINE_MARKUP_RE.sub("", cleaned)
    cleaned = re.sub(r"!?(?:\[([^]]*)\])\([^)]+\)", r"\1", cleaned)
    return _SPACE_RE.sub(" ", cleaned).strip()


def _normalize_title(value: str) -> str:
    return _TITLE_PREFIX_RE.sub("", _clean_markdown(value)).strip()


def _title_from_filename(name: str) -> str:
    stem = name.replace("\\", "/").rsplit("/", 1)[-1]
    stem = re.sub(r"\.(?:md|markdown)$", "", stem, flags=re.IGNORECASE)
    stem = _FILENAME_DATETIME_RE.sub("", stem)
    stem = re.sub(
        r"(?:task[\s_-]*summary|작업[\s_-]*요약|업무[\s_-]*요약)",
        "",
        stem,
        flags=re.IGNORECASE,
    )
    return _SPACE_RE.sub(" ", re.sub(r"[_-]+", " ", stem)).strip(" -_")


def _derive_title_from_lines(lines: list[tuple[int, str, str]]) -> str:
    ordered = sorted(lines, key=lambda item: item[2] != "request")
    for _, line, _ in ordered:
        cleaned = _clean_markdown(line)
        cleaned = re.sub(r"^(?:요청|할\s*일|TODO)\s*[:：]\s*", "", cleaned, flags=re.IGNORECASE)
        if cleaned and not _SOURCE_TIME_LABEL_RE.match(cleaned):
            return cleaned[:140]
    return ""


def _sentence_fragments(line: str) -> tuple[str, ...]:
    cleaned = _clean_markdown(line)
    if not cleaned:
        return ()
    parts = re.split(
        r"(?:<br\s*/?>|(?<=[.!?。])\s+(?=[A-Za-z0-9가-힣]))",
        cleaned,
        flags=re.IGNORECASE,
    )
    return tuple(part.strip() for part in parts if part.strip())


def _find_trigger(text: str) -> _Trigger | None:
    matches: list[_Trigger] = []

    count_match = _COUNT_TRIGGER_RE.search(text)
    if count_match:
        matches.append(
            _Trigger(
                "count",
                count_match.group(0),
                count_match.start(),
                amount=int(count_match.group("count")),
            )
        )

    fuzzy_match = _FUZZY_TRIGGER_RE.search(text)
    if fuzzy_match:
        matches.append(_Trigger("fuzzy", fuzzy_match.group(0), fuzzy_match.start()))

    number_match = _RELATIVE_NUMBER_RE.search(text)
    if number_match:
        unit_text = number_match.group("unit")
        unit: Literal["day", "week", "month"]
        if unit_text == "일":
            unit = "day"
        elif unit_text.startswith("주"):
            unit = "week"
        else:
            unit = "month"
        amount_text = number_match.group("amount")
        amount = (
            int(amount_text)
            if amount_text.isdigit()
            else {"한": 1, "두": 2, "세": 3, "네": 4}[amount_text]
        )
        matches.append(
            _Trigger(
                "relative", number_match.group(0), number_match.start(), amount=amount, unit=unit
            )
        )

    word_match = _RELATIVE_WORD_RE.search(text)
    if word_match:
        normalized = re.sub(r"\s+", "", word_match.group(0))
        amount, unit = {
            "내일": (1, "day"),
            "모레": (2, "day"),
            "다음주": (1, "week"),
            "차주": (1, "week"),
            "다다음주": (2, "week"),
            "다음달": (1, "month"),
            "내달": (1, "month"),
            "다다음달": (2, "month"),
        }[normalized]
        matches.append(
            _Trigger("relative", word_match.group(0), word_match.start(), amount=amount, unit=unit)
        )

    for pattern in (_ISO_DATE_RE, _KOREAN_DATE_RE, _YEARLESS_DATE_RE):
        absolute_match = pattern.search(text)
        if absolute_match:
            year = absolute_match.groupdict().get("year")
            matches.append(
                _Trigger(
                    "absolute",
                    absolute_match.group(0),
                    absolute_match.start(),
                    year=int(year) if year else None,
                    month=int(absolute_match.group("month")),
                    day=int(absolute_match.group("day")),
                )
            )
            break

    event_match = _EVENT_TRIGGER_RE.search(text)
    if event_match:
        event = _SPACE_RE.sub(" ", event_match.group("event")).strip()
        last_word = event.split()[-1] if event else ""
        if last_word not in _EVENT_STOPWORDS and not _COUNT_TRIGGER_RE.search(event_match.group(0)):
            phrase = text[event_match.start() : event_match.end("relation")]
            matches.append(_Trigger("event", phrase, event_match.start()))

    if not matches:
        return None

    # Semantic specificity wins before textual position: a line containing
    # "7개 완료 후" is a count condition, not a generic event or relative "후".
    priority = {"count": 0, "fuzzy": 1, "relative": 2, "absolute": 3, "event": 4}
    return min(matches, key=lambda match: (priority[match.kind], match.start))


def _is_actionable(
    text: str,
    section: str,
    trigger: _Trigger,
    *,
    unchecked: bool = False,
) -> bool:
    if not _ACTION_NOUN_RE.search(text) and not _DIRECTIVE_RE.search(text):
        return False
    if _PAST_OR_DONE_RE.search(text) and not _DIRECTIVE_RE.search(text):
        return False

    strong_directive = bool(_DIRECTIVE_RE.search(text))
    structured_action = unchecked or section == "request"
    future_cue = bool(_FUTURE_CUE_RE.search(text))

    # Result prose is treated as history unless it explicitly says another
    # action remains. This retains "결과: 다음 달에 재검토 필요" while dropping
    # "결과: 2026-01-03에 배포했습니다".
    if section == "result" and not (strong_directive or future_cue):
        return False

    if trigger.kind in {"event", "count", "fuzzy"}:
        return strong_directive or structured_action or future_cue
    return strong_directive or structured_action or future_cue


def _build_candidate(
    document: _ParsedDocument,
    text: str,
    line_number: int,
    trigger: _Trigger,
    import_time: datetime,
    timezone: str,
) -> ImportCandidate | None:
    evidence = sanitize_excerpt(text)
    phrase = sanitize_excerpt(trigger.phrase, max_chars=120)
    warnings: list[str] = []
    due_at: datetime | None = None
    due_local: str | None = None
    schedule_expression: str | None = phrase
    requires_confirmation = trigger.kind in {"fuzzy", "event", "count"}

    if trigger.kind == "relative":
        assert trigger.amount is not None and trigger.unit is not None
        due_at, local_due = resolve_relative(
            document.source_time, timezone, trigger.amount, trigger.unit
        )
        local_due, used_clock = _apply_clock(text, local_due)
        if used_clock:
            due_at = resolve_local(local_due, timezone)
        due_local = local_due.isoformat(timespec="seconds")
        schedule_expression = f"{trigger.amount} {trigger.unit}"
        if document.source_time_kind == "import_time":
            warnings.append("source_time_missing_used_import_time")
    elif trigger.kind == "absolute":
        due_at, local_due, absolute_warnings = _resolve_absolute(
            trigger, text, document.source_time, timezone
        )
        warnings.extend(absolute_warnings)
        if local_due is not None:
            due_local = local_due.isoformat(timespec="seconds")
        if due_at is None:
            requires_confirmation = True
        elif due_at < document.source_time:
            if not _OVERDUE_CUE_RE.search(text):
                return None
            warnings.append("due_time_precedes_source_time_explicit_overdue")
    else:
        warnings.append(f"{trigger.kind}_trigger_requires_confirmation")

    if due_at is not None and due_at < import_time:
        warnings.append("due_time_is_in_the_past")

    safe_source = sanitize_excerpt(document.name, max_chars=300)
    digest_input = "\x00".join(
        (
            "remind-prompt-import-v1",
            safe_source,
            str(line_number),
            trigger.kind,
            phrase,
            evidence,
        )
    ).encode("utf-8")
    digest = hashlib.sha256(digest_input).hexdigest()

    confidence = {
        "absolute": 0.94,
        "relative": 0.91,
        "fuzzy": 0.72,
        "event": 0.68,
        "count": 0.75,
    }[trigger.kind]
    if not _DIRECTIVE_RE.search(text):
        confidence = round(confidence - 0.08, 2)

    return ImportCandidate(
        id=f"import_{digest[:24]}",
        hash=digest,
        title=document.title,
        prompt_text=evidence,
        destination_label="",
        source_label=safe_source,
        source_ref=f"{safe_source}:{line_number}",
        trigger_type=trigger.kind,
        original_phrase=phrase,
        evidence=evidence,
        confidence=confidence,
        due_at=due_at,
        due_local=due_local,
        schedule_expression=schedule_expression,
        timezone=timezone,
        requires_confirmation=requires_confirmation,
        warnings=tuple(warnings),
    )


def _resolve_absolute(
    trigger: _Trigger,
    text: str,
    anchor: datetime,
    timezone: str,
) -> tuple[datetime | None, datetime | None, list[str]]:
    warnings: list[str] = []
    anchor_local = to_utc(anchor).astimezone(get_zone(timezone)).replace(tzinfo=None)
    year = trigger.year or anchor_local.year
    if trigger.year is None:
        warnings.append("year_inferred_from_source_time")
        try:
            candidate_date = date(year, trigger.month or 0, trigger.day or 0)
        except ValueError:
            candidate_date = None
        if candidate_date is not None and candidate_date < anchor_local.date():
            year += 1

    clock = _extract_clock(text)
    if clock is None:
        hour, minute = 9, 0
        warnings.append("time_missing_defaulted_to_09:00")
    else:
        hour, minute = clock

    try:
        local_due = datetime(year, trigger.month or 0, trigger.day or 0, hour, minute)
        due_at = resolve_local(local_due, timezone)
    except (ValueError, ScheduleError):
        warnings.append("date_could_not_be_resolved")
        return None, None, warnings
    return due_at, local_due, warnings


def _apply_clock(text: str, local_due: datetime) -> tuple[datetime, bool]:
    clock = _extract_clock(text)
    if clock is None:
        return local_due, False
    return local_due.replace(hour=clock[0], minute=clock[1], second=0, microsecond=0), True


def _extract_clock(text: str) -> tuple[int, int] | None:
    match = _CLOCK_RE.search(text)
    if not match:
        return None
    if match.group("hour24") is not None:
        return int(match.group("hour24")), int(match.group("minute24"))
    hour = int(match.group("hour"))
    minute = int(match.group("minute") or 0)
    if not 0 <= minute <= 59 or not 0 <= hour <= 23:
        return None
    if match.group("ampm") == "오전":
        hour = 0 if hour == 12 else hour
    elif match.group("ampm") == "오후":
        if not 1 <= hour <= 12:
            return None
        hour = hour if hour == 12 else hour + 12
    return hour, minute


def _coerce_source_timestamp(value: datetime | date | str, timezone: str) -> datetime:
    if isinstance(value, datetime):
        return _coerce_aware(value, timezone, field="timestamp")
    if isinstance(value, date):
        return resolve_local(datetime.combine(value, datetime.min.time()), timezone)
    if isinstance(value, str):
        parsed = _parse_datetime_text(value, timezone)
        if parsed is not None:
            return parsed
    raise ImportValidationError("document timestamp must be a valid date or datetime")


def _coerce_aware(value: datetime, timezone: str, *, field: str) -> datetime:
    if not isinstance(value, datetime):
        raise ImportValidationError(f"{field} must be a datetime")
    try:
        if value.tzinfo is None or value.utcoffset() is None:
            return resolve_local(value, timezone)
        return to_utc(value)
    except ScheduleError as exc:
        raise ImportValidationError(f"{field} could not be resolved") from exc


def _parse_datetime_text(value: str, timezone: str) -> datetime | None:
    for pattern in (_ISO_DATETIME_RE, _KOREAN_DATETIME_RE):
        match = pattern.search(value)
        if not match:
            continue
        groups = match.groupdict()
        hour = int(groups.get("hour") or 0)
        minute = int(groups.get("minute") or 0)
        second = int(groups.get("second") or 0)
        ampm = groups.get("ampm")
        if ampm == "오전":
            hour = 0 if hour == 12 else hour
        elif ampm == "오후":
            if not 1 <= hour <= 12:
                return None
            hour = hour if hour == 12 else hour + 12
        try:
            local_value = datetime(
                int(groups["year"]),
                int(groups["month"]),
                int(groups["day"]),
                hour,
                minute,
                second,
            )
        except ValueError:
            return None
        offset = groups.get("offset")
        if offset:
            normalized = f"{local_value.isoformat()}{'+00:00' if offset == 'Z' else offset}"
            try:
                return datetime.fromisoformat(normalized).astimezone(UTC)
            except ValueError:
                return None
        try:
            return resolve_local(local_value, timezone)
        except ScheduleError:
            return None
    return None


def _parse_filename_datetime(name: str, timezone: str) -> datetime | None:
    match = _FILENAME_DATETIME_RE.search(name.rsplit("/", 1)[-1])
    if not match:
        return None
    try:
        local_value = datetime(
            int(match.group("year")),
            int(match.group("month")),
            int(match.group("day")),
            int(match.group("hour") or 0),
            int(match.group("minute") or 0),
            int(match.group("second") or 0),
        )
        return resolve_local(local_value, timezone)
    except (ValueError, ScheduleError):
        return None
