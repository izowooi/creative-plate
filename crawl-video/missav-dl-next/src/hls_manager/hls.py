from __future__ import annotations

import re
from hashlib import sha256
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

from .models import HlsLevel, MediaPlaylist, PlaylistError, Segment
from .security import validate_public_http_url

_TAIL_NUMBER_RE = re.compile(r"^(.*?)(\d+)$")
_RESOLUTION_RE = re.compile(r"(?:^|,)RESOLUTION=\d+x(\d+)(?:,|$)", re.IGNORECASE)
_MAP_URI_RE = re.compile(r'(?:^|,)URI=(?:"([^"]+)"|([^,]+))', re.IGNORECASE)
_METHOD_RE = re.compile(r"(?:^|,)METHOD=([^,]+)", re.IGNORECASE)


def expand_range_urls(start_url: str, end_url: str, *, maximum: int = 10_000) -> list[str]:
    first = _TAIL_NUMBER_RE.match(start_url.strip())
    last = _TAIL_NUMBER_RE.match(end_url.strip())
    if not first or not last:
        raise ValueError("both URLs must end with a number")
    first_prefix, first_number = first.groups()
    last_prefix, last_number = last.groups()
    if first_prefix != last_prefix:
        raise ValueError("URL prefixes must match")
    start, end = int(first_number), int(last_number)
    if start > end:
        raise ValueError("start number must not exceed end number")
    count = end - start + 1
    if count > maximum:
        raise ValueError(f"range contains more than {maximum} URLs")
    width = len(first_number) if len(first_number) == len(last_number) else 0
    return [
        f"{first_prefix}{number:0{width}d}" if width else f"{first_prefix}{number}"
        for number in range(start, end + 1)
    ]


def parse_master_playlist(text: str, playlist_url: str) -> tuple[HlsLevel, ...]:
    validate_public_http_url(playlist_url)
    lines = [line.strip() for line in text.splitlines()]
    levels: list[HlsLevel] = []
    for index, line in enumerate(lines):
        if not line.upper().startswith("#EXT-X-STREAM-INF:"):
            continue
        uri = next(
            (
                candidate
                for candidate in lines[index + 1 :]
                if candidate and not candidate.startswith("#")
            ),
            "",
        )
        if not uri:
            continue
        match = _RESOLUTION_RE.search(line.split(":", 1)[1])
        height = int(match.group(1)) if match else 0
        absolute = urljoin(playlist_url, uri)
        validate_public_http_url(absolute)
        levels.append(HlsLevel(height=height, url=absolute))
    return tuple(levels)


def parse_media_playlist(
    text: str,
    playlist_url: str,
    *,
    max_segments: int = 100_000,
) -> MediaPlaylist:
    validate_public_http_url(playlist_url)
    lines = [line.strip() for line in text.splitlines()]
    if not lines or lines[0] != "#EXTM3U":
        raise PlaylistError("invalid HLS playlist")

    segments: list[Segment] = []
    for line in lines:
        upper = line.upper()
        if upper.startswith("#EXT-X-BYTERANGE"):
            raise PlaylistError("byte-range HLS playlists are not supported")
        if upper.startswith("#EXT-X-KEY:"):
            match = _METHOD_RE.search(line.split(":", 1)[1])
            method = match.group(1).strip().upper() if match else ""
            if method and method != "NONE":
                raise PlaylistError("encrypted HLS playlists are not supported")
        if upper.startswith("#EXT-X-MAP:"):
            attributes = line.split(":", 1)[1]
            if "BYTERANGE=" in attributes.upper():
                raise PlaylistError("byte-range HLS maps are not supported")
            match = _MAP_URI_RE.search(attributes)
            uri = (match.group(1) or match.group(2)).strip() if match else ""
            if not uri:
                raise PlaylistError("EXT-X-MAP is missing URI")
            absolute = urljoin(playlist_url, uri)
            validate_public_http_url(absolute)
            segments.append(Segment(absolute, is_init=True))
        elif line and not line.startswith("#"):
            absolute = urljoin(playlist_url, line)
            validate_public_http_url(absolute)
            segments.append(Segment(absolute))
        if len(segments) > max_segments:
            raise PlaylistError(f"playlist contains more than {max_segments} segments")

    if not segments:
        raise PlaylistError("playlist contains no media segments")
    return MediaPlaylist(tuple(segments))


def pick_level(levels: tuple[HlsLevel, ...], preferred_quality: str) -> HlsLevel:
    if not levels:
        raise PlaylistError("no HLS quality levels were found")
    preferred = preferred_quality.strip().lower()
    if preferred in {"", "auto", "best", "source", "original"}:
        return max(levels, key=lambda item: item.height)
    match = re.search(r"(\d+)", preferred)
    if not match:
        raise ValueError("preferredQuality must be auto or a vertical resolution")
    target = int(match.group(1))
    exact_or_lower = [level for level in levels if 0 < level.height <= target]
    if exact_or_lower:
        return max(exact_or_lower, key=lambda item: item.height)
    positive = [level for level in levels if level.height > 0]
    return min(positive or list(levels), key=lambda item: item.height)


def origin_from_url(url: str) -> str:
    validate_public_http_url(url)
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def build_output_filename(page_url: str, quality: str) -> str:
    parsed = urlparse(page_url)
    raw_slug = unquote(parsed.path.rstrip("/").rsplit("/", 1)[-1]) or "video"
    ascii_slug = raw_slug.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", ascii_slug).strip("._-") or "video"
    slug = slug[:60]
    short_hash = sha256(page_url.encode("utf-8")).hexdigest()[:10]
    safe_quality = re.sub(r"[^A-Za-z0-9_-]+", "_", quality).strip("_") or "source"
    return f"{slug}_{short_hash}_{safe_quality}.ts"


def slug_from_url(page_url: str) -> str:
    raw_slug = unquote(urlparse(page_url).path.rstrip("/").rsplit("/", 1)[-1])
    return raw_slug or "video"


def normalized_output_dir(path: str | Path) -> str:
    return str(Path(path).expanduser().resolve(strict=False))
