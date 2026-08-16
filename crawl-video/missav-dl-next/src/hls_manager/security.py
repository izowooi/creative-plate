from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
import time
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

_HOST_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$")
_LEGACY_IPV4_COMPONENT_RE = re.compile(r"(?:0[xX][0-9a-fA-F]+|[0-9]+)")
_JSON_METHODS = frozenset({"POST", "PUT", "PATCH"})
_MUTATION_METHODS = _JSON_METHODS | {"DELETE"}
_RESPONSE_SECURITY_HEADERS = (
    (
        b"content-security-policy",
        b"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        b"connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    ),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
)


@dataclass(frozen=True, slots=True)
class ResolvedUrl:
    url: str
    hostname: str
    port: int
    addresses: tuple[str, ...]

    @property
    def curl_resolve_entry(self) -> str:
        host = f"[{self.hostname}]" if ":" in self.hostname else self.hostname
        addresses = ",".join(f"[{item}]" if ":" in item else item for item in self.addresses)
        return f"{host}:{self.port}:{addresses}"


Resolver = Callable[[str, int], Awaitable[Sequence[str]]]


def _canonical_host(
    parsed: SplitResult,
) -> tuple[str, ipaddress.IPv4Address | ipaddress.IPv6Address | None]:
    try:
        raw_hostname = parsed.hostname
    except ValueError as exc:
        raise ValueError("URL contains an invalid hostname") from exc
    if not raw_hostname:
        raise ValueError("URL must include a hostname")

    if raw_hostname.endswith(".") or not raw_hostname.isascii():
        # CURLOPT_RESOLVE must match libcurl's hostname byte-for-byte. Reject
        # alternate DNS spellings rather than risk a second, unpinned lookup.
        raise ValueError("URL contains a non-canonical hostname")
    hostname = raw_hostname.lower()
    if not hostname or any(character.isspace() for character in hostname):
        raise ValueError("URL contains an invalid hostname")

    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None

    if address is not None:
        # urllib and libcurl need to agree on the literal. This also rejects
        # zero-padded IPv4 components instead of letting a client interpret octal.
        if address.version == 4 and hostname != str(address):
            raise ValueError("non-canonical IPv4 URLs are not allowed")
        return str(address), address

    components = hostname.split(".")
    if all(_LEGACY_IPV4_COMPONENT_RE.fullmatch(component) for component in components):
        # Browsers and libcurl accept historical inet_aton forms such as a single
        # 32-bit integer, hexadecimal components, or octal components. DNS and
        # URL parsers do not interpret these consistently, so reject the entire
        # ambiguous class rather than trying to normalize it.
        raise ValueError("non-canonical IPv4 URLs are not allowed")

    try:
        ascii_hostname = hostname.encode("idna").decode("ascii")
    except UnicodeError as exc:
        raise ValueError("URL contains an invalid hostname") from exc
    if len(ascii_hostname) > 253:
        raise ValueError("URL hostname is too long")
    labels = ascii_hostname.split(".")
    if any(not _HOST_LABEL_RE.fullmatch(label) for label in labels):
        raise ValueError("URL contains an invalid hostname")
    return ascii_hostname, None


def validate_public_http_url(url: str, *, allow_fragment: bool = False) -> tuple[str, int]:
    """Structurally validate an outbound URL without performing network I/O."""

    if not isinstance(url, str) or not url:
        raise ValueError("URL must be a non-empty string")
    if "\\" in url or any(ord(character) < 0x20 for character in url):
        raise ValueError("URL contains invalid characters")
    try:
        parsed = urlsplit(url)
    except ValueError as exc:
        raise ValueError("URL is invalid") from exc
    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError("URL must use http or https")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URLs must not contain user information")
    if parsed.fragment and not allow_fragment:
        raise ValueError("URLs must not contain fragments")

    hostname, address = _canonical_host(parsed)
    if hostname == "localhost" or hostname.endswith(".localhost"):
        raise ValueError("localhost URLs are not allowed")
    if address is not None and not address.is_global:
        raise ValueError("local or private IP URLs are not allowed")
    try:
        explicit_port = parsed.port
    except ValueError as exc:
        raise ValueError("URL contains an invalid port") from exc
    if explicit_port == 0:
        raise ValueError("URL contains an invalid port")
    port = (
        explicit_port
        if explicit_port is not None
        else (443 if parsed.scheme.lower() == "https" else 80)
    )
    return hostname, port


async def _system_resolver(hostname: str, port: int) -> Sequence[str]:
    loop = asyncio.get_running_loop()
    records = await loop.getaddrinfo(
        hostname,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
    )
    return tuple(record[4][0] for record in records)


class PublicUrlPolicy:
    """Resolve outbound hosts once per TTL and reject every non-public answer."""

    def __init__(
        self,
        *,
        resolver: Resolver | None = None,
        ttl_seconds: float = 300.0,
        max_entries: int = 1024,
    ) -> None:
        self._resolver = resolver or _system_resolver
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._cache: dict[tuple[str, int], tuple[float, tuple[str, ...]]] = {}
        self._lock = asyncio.Lock()

    async def resolve(self, url: str) -> ResolvedUrl:
        hostname, port = validate_public_http_url(url)
        key = (hostname, port)
        now = time.monotonic()
        cached = self._cache.get(key)
        if cached is not None and cached[0] > now:
            return ResolvedUrl(url, hostname, port, cached[1])

        async with self._lock:
            now = time.monotonic()
            cached = self._cache.get(key)
            if cached is not None and cached[0] > now:
                return ResolvedUrl(url, hostname, port, cached[1])
            try:
                raw_addresses = await self._resolver(hostname, port)
            except OSError as exc:
                raise ValueError(f"URL hostname could not be resolved: {hostname}") from exc
            addresses: list[str] = []
            for raw_address in raw_addresses:
                try:
                    address = ipaddress.ip_address(raw_address.split("%", 1)[0])
                except ValueError as exc:
                    raise ValueError("URL hostname resolved to an invalid address") from exc
                if not address.is_global:
                    raise ValueError("URL hostname resolves to a local or private IP")
                canonical = str(address)
                if canonical not in addresses:
                    addresses.append(canonical)
            if not addresses:
                raise ValueError(f"URL hostname could not be resolved: {hostname}")
            resolved = tuple(addresses)
            if len(self._cache) >= self._max_entries:
                expired = [cache_key for cache_key, item in self._cache.items() if item[0] <= now]
                for cache_key in expired:
                    self._cache.pop(cache_key, None)
                if len(self._cache) >= self._max_entries:
                    oldest = min(self._cache, key=lambda cache_key: self._cache[cache_key][0])
                    self._cache.pop(oldest, None)
            self._cache[key] = (now + self._ttl_seconds, resolved)
            return ResolvedUrl(url, hostname, port, resolved)


def _header_values(scope: Scope, name: bytes) -> list[str]:
    return [value.decode("latin-1") for key, value in scope.get("headers", ()) if key == name]


def _origin_tuple(value: str) -> tuple[str, str, int] | None:
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
            return None
        if parsed.username is not None or parsed.password is not None:
            return None
        if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            return None
        hostname = parsed.hostname.rstrip(".").lower().encode("idna").decode("ascii")
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    except (UnicodeError, ValueError):
        return None
    return parsed.scheme.lower(), hostname, port


def _request_origin(scope: Scope) -> tuple[str, str, int] | None:
    hosts = _header_values(scope, b"host")
    if len(hosts) != 1:
        return None
    scheme = str(scope.get("scheme", "http")).lower()
    return _origin_tuple(f"{scheme}://{hosts[0]}")


class MutationGuardMiddleware:
    """Block browser cross-origin writes and non-JSON JSON endpoints."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        method = str(scope.get("method", "GET")).upper()
        path = str(scope.get("path", ""))
        if (
            scope["type"] != "http"
            or not path.startswith("/api/")
            or method not in _MUTATION_METHODS
        ):
            await self.app(scope, receive, send)
            return

        origins = _header_values(scope, b"origin")
        if origins and (len(origins) != 1 or _origin_tuple(origins[0]) != _request_origin(scope)):
            response = JSONResponse(
                {"error": "cross-origin mutation requests are not allowed"}, 403
            )
            await response(scope, receive, send)
            return

        if method in _JSON_METHODS:
            content_types = _header_values(scope, b"content-type")
            media_type = (
                content_types[0].split(";", 1)[0].strip().lower() if len(content_types) == 1 else ""
            )
            if media_type != "application/json":
                response = JSONResponse({"error": "Content-Type must be application/json"}, 415)
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)


class SecurityHeadersMiddleware:
    """Apply browser hardening headers to the local dashboard and API."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        async def send_with_headers(message: Message) -> None:
            if message.get("type") == "http.response.start":
                headers = list(message.get("headers", []))
                present = {name.lower() for name, _ in headers}
                headers.extend(
                    (name, value)
                    for name, value in _RESPONSE_SECURITY_HEADERS
                    if name not in present
                )
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_headers)
