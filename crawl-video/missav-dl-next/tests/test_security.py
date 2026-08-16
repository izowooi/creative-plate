from __future__ import annotations

import pytest
from curl_cffi import CurlOpt

import hls_manager.http_client as http_module
from hls_manager.hls import parse_master_playlist, parse_media_playlist
from hls_manager.http_client import CurlHttpClient
from hls_manager.security import PublicUrlPolicy, validate_public_http_url


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/video",
        "http://2130706433/video",
        "http://0x7f000001/video",
        "http://0177.0.0.1/video",
        "http://[::1]/video",
        "http://localhost/video",
        "http://service.localhost/video",
        "https://user:password@example.com/video",
        "https://example.com/video#fragment",
        "file:///etc/passwd",
    ],
)
def test_structural_url_policy_rejects_local_and_ambiguous_hosts(url: str) -> None:
    with pytest.raises(ValueError):
        validate_public_http_url(url)


def test_hls_parsers_reject_non_http_or_private_discovered_urls() -> None:
    with pytest.raises(ValueError):
        parse_master_playlist(
            "#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720\nhttp://2130706433/a.m3u8\n",
            "https://cdn.example/master.m3u8",
        )
    with pytest.raises(ValueError):
        parse_media_playlist(
            "#EXTM3U\nfile:///etc/passwd\n",
            "https://cdn.example/media.m3u8",
        )


@pytest.mark.asyncio
async def test_dns_policy_caches_public_result_and_rejects_any_private_answer() -> None:
    calls: list[tuple[str, int]] = []

    async def public_resolver(hostname: str, port: int) -> tuple[str, ...]:
        calls.append((hostname, port))
        return ("93.184.216.34",)

    policy = PublicUrlPolicy(resolver=public_resolver)
    first = await policy.resolve("https://cdn.example/a.ts")
    second = await policy.resolve("https://cdn.example/b.ts")
    assert first.addresses == second.addresses == ("93.184.216.34",)
    assert calls == [("cdn.example", 443)]

    async def mixed_resolver(_hostname: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34", "127.0.0.1")

    with pytest.raises(ValueError, match="local or private"):
        await PublicUrlPolicy(resolver=mixed_resolver).resolve("https://cdn.example/a.ts")


class RedirectResponse:
    encoding = "utf-8"

    def __init__(
        self,
        status_code: int,
        *,
        headers: dict[str, str] | None = None,
        chunks: tuple[bytes, ...] = (),
    ) -> None:
        self.status_code = status_code
        self.headers = headers or {}
        self.chunks = chunks
        self.closed = False

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def close(self) -> None:
        self.closed = True


class RedirectSession:
    responses: list[RedirectResponse] = []
    instances: list[RedirectSession] = []

    def __init__(self, **options: object) -> None:
        self.options = options
        self.curl_options = options["curl_options"]
        self.calls: list[tuple[str, str, object]] = []
        self.closed = False
        self.instances.append(self)

    async def get(
        self, url: str, *, content_callback: object, **kwargs: object
    ) -> RedirectResponse:
        self.calls.append(("GET", url, kwargs.get("allow_redirects")))
        response = self.responses.pop(0)
        header_callback = self.curl_options[CurlOpt.HEADERFUNCTION]  # type: ignore[index]
        header_callback(f"HTTP/1.1 {response.status_code} Test\r\n".encode())  # type: ignore[operator]
        for name, value in response.headers.items():
            header_callback(f"{name}: {value}\r\n".encode())  # type: ignore[operator]
        header_callback(b"\r\n")  # type: ignore[operator]
        for chunk in response.chunks:
            content_callback(chunk)  # type: ignore[operator]
        return response

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_curl_client_validates_and_pins_each_safe_redirect(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolver(_hostname: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    RedirectSession.responses = [
        RedirectResponse(302, headers={"location": "https://media.example/final.m3u8"}),
        RedirectResponse(200, chunks=(b"#EXTM3U\n",)),
    ]
    RedirectSession.instances = []
    monkeypatch.setattr(http_module, "_SessionFactory", RedirectSession)
    client = CurlHttpClient(
        "https://example.com",
        url_policy=PublicUrlPolicy(resolver=resolver),
    )
    text = await client.get_text("https://cdn.example/master.m3u8", max_bytes=1024)
    session = RedirectSession.instances[0]
    assert text == "#EXTM3U\n"
    assert [item[1] for item in session.calls] == [
        "https://cdn.example/master.m3u8",
        "https://media.example/final.m3u8",
    ]
    assert all(item[2] is False for item in session.calls)
    assert session.options["trust_env"] is False
    assert session.curl_options[CurlOpt.PROTOCOLS_STR] == "http,https"
    assert session.curl_options[CurlOpt.RESOLVE] == ["media.example:443:93.184.216.34"]
    await client.close()


@pytest.mark.asyncio
async def test_curl_client_rejects_private_redirect_before_connecting(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def resolver(_hostname: str, _port: int) -> tuple[str, ...]:
        return ("93.184.216.34",)

    RedirectSession.responses = [
        RedirectResponse(302, headers={"location": "http://2130706433/admin"}),
    ]
    RedirectSession.instances = []
    monkeypatch.setattr(http_module, "_SessionFactory", RedirectSession)
    client = CurlHttpClient(
        "https://example.com",
        url_policy=PublicUrlPolicy(resolver=resolver),
    )
    with pytest.raises(ValueError, match="non-canonical IPv4"):
        await client.get_text("https://cdn.example/master.m3u8", max_bytes=1024)
    assert len(RedirectSession.instances[0].calls) == 1
    await client.close()
