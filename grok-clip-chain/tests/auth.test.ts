import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { removeDir, tempDir } from "./helpers.js";
import { extractAuthorizeUrl, readGrokAuthStatus, requestAuthJson, saveGrokTokens } from "../src/lib/auth.js";

test("extractAuthorizeUrl strips ANSI codes and returns a clean authorize URL", () => {
  const line =
    "\x1b[2mVisit this URL to authorize:\nhttps://auth.x.ai/oauth2/authorize?client_id=b1a00492&redirect_uri=http%3A%2F%2F127.0.0.1%3A56121%2Fcallback&code_challenge_method=S256\x1b[0m";
  const url = extractAuthorizeUrl(line);
  assert.ok(url, "should find a URL");
  assert.doesNotMatch(url!, /\x1b/, "no ANSI escape leaks into the URL");
  assert.equal(url!.endsWith("S256"), true);
  assert.equal(url!.startsWith("https://auth.x.ai/oauth2/authorize?"), true);
});

test("extractAuthorizeUrl returns null when no authorize URL is present", () => {
  assert.equal(extractAuthorizeUrl("Opening browser for xAI login...\n"), null);
});

test("saveGrokTokens writes local auth file with private permissions", async () => {
  const dir = await tempDir("grok-chain-auth-");
  try {
    saveGrokTokens({ access_token: "access", refresh_token: "refresh", expires_in: 3600 }, dir);
    const authFile = join(dir, "auth.json");
    const info = await stat(authFile);
    assert.equal(info.mode & 0o777, 0o600);
    const status = readGrokAuthStatus(dir);
    assert.equal(status.loggedIn, true);
    assert.equal(status.path, authFile);
    assert.ok(status.expiresAt && status.expiresAt > Date.now());
  } finally {
    await removeDir(dir);
  }
});

test("requestAuthJson falls back to curl when Node fetch hits a local TLS chain error", async () => {
  const seen: Array<{ url: string; method: string; body?: URLSearchParams }> = [];
  const data = await requestAuthJson(
    "https://auth.x.ai/.well-known/openid-configuration",
    { method: "GET" },
    {
      fetchFn: async () => {
        const err = new TypeError("fetch failed") as TypeError & { cause?: { code?: string } };
        err.cause = { code: "SELF_SIGNED_CERT_IN_CHAIN" };
        throw err;
      },
      curlJson: async (url, options) => {
        seen.push({ url, method: options.method, body: options.body });
        return { token_endpoint: "https://auth.x.ai/oauth2/token" };
      },
    },
  );
  assert.equal(data.token_endpoint, "https://auth.x.ai/oauth2/token");
  assert.deepEqual(seen.map((item) => `${item.method} ${item.url}`), ["GET https://auth.x.ai/.well-known/openid-configuration"]);
});
