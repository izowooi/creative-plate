import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { appError } from "./errors.js";

const GROK_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const GROK_SCOPE = "openid profile email offline_access grok-cli:access api:access";
const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const DEVICE_CODE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const MAX_CONCURRENT_SESSIONS = 20;
const execFileAsync = promisify(execFile);

export interface AuthSession {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
  status: "pending" | "complete" | "error" | "expired";
  error?: string;
  pollTimer?: ReturnType<typeof setInterval>;
  deviceCode?: string;
}

export interface GrokAuthStatus {
  loggedIn: boolean;
  email: string | null;
  expiresAt: number | null;
  path: string;
}

const sessions = new Map<string, AuthSession>();

export interface AuthJsonRequestOptions {
  method?: "GET" | "POST";
  body?: URLSearchParams;
  timeoutMs?: number;
}

export interface AuthRequestDeps {
  fetchFn?: typeof fetch;
  curlJson?: (url: string, options: Required<AuthJsonRequestOptions>) => Promise<any>;
}

function sid(): string {
  return randomBytes(16).toString("hex");
}

export function grokAuthPath(baseDir = join(homedir(), ".progrok")): string {
  return join(baseDir, "auth.json");
}

function cleanup(id: string): void {
  const session = sessions.get(id);
  if (session?.pollTimer) clearInterval(session.pollTimer);
  if (session) delete session.deviceCode;
  setTimeout(() => sessions.delete(id), 120_000).unref?.();
}

function decodeEmail(tokens: Record<string, unknown>): string | undefined {
  if (typeof tokens.id_token !== "string") return undefined;
  try {
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email : undefined;
  } catch {
    return undefined;
  }
}

function isRecoverableNodeFetchError(error: unknown): boolean {
  const err = error as { message?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
  const code = err?.cause?.code || err?.code;
  return code === "SELF_SIGNED_CERT_IN_CHAIN" || code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || err?.message === "fetch failed";
}

async function curlJson(url: string, options: Required<AuthJsonRequestOptions>): Promise<any> {
  const args = ["-fsSL", "--connect-timeout", "10", "--max-time", String(Math.ceil(options.timeoutMs / 1000)), "-X", options.method];
  if (options.method === "POST") {
    args.push("-H", "Content-Type: application/x-www-form-urlencoded", "--data", options.body.toString());
  }
  args.push(url);
  try {
    const { stdout } = await execFileAsync("curl", args, { timeout: options.timeoutMs + 2000, maxBuffer: 2 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error: any) {
    throw appError(`xAI auth request failed: ${error.stderr || error.message}`, 502, "AUTH_REQUEST_FAILED");
  }
}

export async function requestAuthJson(url: string, options: AuthJsonRequestOptions = {}, deps: AuthRequestDeps = {}): Promise<any> {
  const normalized: Required<AuthJsonRequestOptions> = {
    method: options.method || "GET",
    body: options.body || new URLSearchParams(),
    timeoutMs: options.timeoutMs || 15_000,
  };
  const fetchFn = deps.fetchFn || fetch;
  try {
    const res = await fetchFn(url, {
      method: normalized.method,
      headers: normalized.method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : undefined,
      body: normalized.method === "POST" ? normalized.body : undefined,
      signal: AbortSignal.timeout(normalized.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw appError(text || `xAI auth request failed: HTTP ${res.status}`, res.status >= 500 ? 502 : res.status, "AUTH_REQUEST_FAILED");
    }
    return res.json();
  } catch (error) {
    if (!isRecoverableNodeFetchError(error)) throw error;
    return (deps.curlJson || curlJson)(url, normalized);
  }
}

export function saveGrokTokens(tokens: Record<string, unknown>, baseDir = join(homedir(), ".progrok")): void {
  if (!existsSync(baseDir)) mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  const email = decodeEmail(tokens);
  const data: Record<string, unknown> = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: typeof tokens.expires_in === "number" ? Date.now() + tokens.expires_in * 1000 : undefined,
    tokenEndpoint: GROK_TOKEN_URL,
  };
  if (email) data.email = email;

  const target = grokAuthPath(baseDir);
  const tmp = join(baseDir, `auth.json.tmp-${randomBytes(6).toString("hex")}`);
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, target);
}

export function readGrokAuthStatus(baseDir = join(homedir(), ".progrok")): GrokAuthStatus {
  const path = grokAuthPath(baseDir);
  if (!existsSync(path)) return { loggedIn: false, email: null, expiresAt: null, path };
  try {
    const data = JSON.parse(readFileSync(path, "utf-8")) as {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: number;
      email?: string;
    };
    return {
      loggedIn: Boolean(data.accessToken || data.refreshToken),
      email: typeof data.email === "string" ? data.email : null,
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : null,
      path,
    };
  } catch {
    return { loggedIn: false, email: null, expiresAt: null, path };
  }
}

export async function startGrokLogin(): Promise<{ sessionId: string; userCode: string; verificationUrl: string; expiresIn: number }> {
  if (sessions.size >= MAX_CONCURRENT_SESSIONS) {
    throw appError("Too many pending auth sessions", 429, "AUTH_TOO_MANY_SESSIONS");
  }

  const disc = (await requestAuthJson("https://auth.x.ai/.well-known/openid-configuration", { method: "GET", timeoutMs: 15_000 })) as { device_authorization_endpoint?: string; token_endpoint?: string };
  if (!disc.device_authorization_endpoint || !disc.token_endpoint) {
    throw appError("xAI device authorization endpoint is unavailable", 502, "AUTH_DISCOVERY_FAILED");
  }

  const device = (await requestAuthJson(disc.device_authorization_endpoint, {
    method: "POST",
    body: new URLSearchParams({ client_id: GROK_CLIENT_ID, scope: GROK_SCOPE }),
    timeoutMs: 15_000,
  })) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval?: number;
  };
  const id = sid();
  const session: AuthSession = {
    userCode: device.user_code,
    verificationUrl: device.verification_uri_complete || device.verification_uri,
    expiresAt: Date.now() + device.expires_in * 1000,
    status: "pending",
    deviceCode: device.device_code,
  };
  sessions.set(id, session);

  const interval = Math.max((device.interval || 5) * 1000, 5_000);
  session.pollTimer = setInterval(async () => {
    if (session.status !== "pending") {
      cleanup(id);
      return;
    }
    if (Date.now() > session.expiresAt) {
      session.status = "expired";
      cleanup(id);
      return;
    }
    try {
      const token = await requestAuthJson(disc.token_endpoint!, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: DEVICE_CODE_GRANT,
          client_id: GROK_CLIENT_ID,
          device_code: device.device_code,
        }),
        timeoutMs: 10_000,
      });
      saveGrokTokens(token as Record<string, unknown>);
      session.status = "complete";
      cleanup(id);
      return;
    } catch (error: any) {
      const message = typeof error?.message === "string" ? error.message : "";
      if (!message.includes("authorization_pending") && !message.includes("slow_down")) {
        // Keep polling through transient network failures and xAI pending responses.
      }
    }
  }, interval);
  session.pollTimer.unref?.();

  return { sessionId: id, userCode: device.user_code, verificationUrl: session.verificationUrl, expiresIn: device.expires_in };
}

export function getLoginSession(id: string): { status: AuthSession["status"]; error?: string } {
  const session = sessions.get(id);
  if (!session) return { status: "expired" };
  if (Date.now() > session.expiresAt && session.status === "pending") {
    session.status = "expired";
    cleanup(id);
  }
  return { status: session.status, error: session.error };
}
