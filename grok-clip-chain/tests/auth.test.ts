import test from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { removeDir, tempDir } from "./helpers.js";
import { readGrokAuthStatus, requestAuthJson, saveGrokTokens } from "../src/lib/auth.js";

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
