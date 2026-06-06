import { randomBytes } from "node:crypto";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, renameSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { appError } from "./errors.js";

const GROK_TOKEN_URL = "https://auth.x.ai/oauth2/token";
// PKCE 브라우저 flow 한도. device-code consent가 일부 환경에서 거부되어 progrok PKCE로 통일한다.
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const AUTHORIZE_URL_RE = /https:\/\/auth\.x\.ai\/oauth2\/authorize\S+/;
const execFileAsync = promisify(execFile);

export interface LoginSession {
  status: "pending" | "complete" | "error" | "expired";
  error?: string;
  authorizeUrl?: string;
  expiresAt: number;
  child?: ChildProcess;
}

export interface GrokAuthStatus {
  loggedIn: boolean;
  email: string | null;
  expiresAt: number | null;
  path: string;
}

const sessions = new Map<string, LoginSession>();

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

export function progrokBinPath(): string {
  return join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "progrok.cmd" : "progrok");
}

function cleanup(id: string): void {
  const session = sessions.get(id);
  if (session) delete session.child;
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

function activeLoginId(): string | null {
  for (const [id, session] of sessions) {
    if (session.status === "pending") return id;
  }
  return null;
}

/**
 * progrok PKCE 브라우저 flow로 xAI 로그인을 시작한다.
 * `progrok login --browser`가 브라우저를 열고 loopback(127.0.0.1:56121)으로 콜백을 직접 수신·교환해
 * `~/.progrok/auth.json`에 토큰을 저장한다. 서버는 자식 프로세스의 종료 코드만 추적한다.
 * (xAI device-code consent가 일부 환경에서 일관되게 거부되어 PKCE로 통일했다.)
 */
export async function startGrokLogin(): Promise<{ sessionId: string; authorizeUrl: string | null; expiresIn: number }> {
  const existing = activeLoginId();
  if (existing) {
    const session = sessions.get(existing)!;
    return { sessionId: existing, authorizeUrl: session.authorizeUrl ?? null, expiresIn: Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)) };
  }

  const id = sid();
  let child: ChildProcess;
  try {
    child = spawn(progrokBinPath(), ["login", "--browser"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
      env: process.env,
    });
  } catch (error: any) {
    throw appError(`progrok 로그인 프로세스를 시작하지 못했습니다: ${error.message}`, 500, "AUTH_LOGIN_SPAWN_FAILED");
  }

  const session: LoginSession = { status: "pending", expiresAt: Date.now() + LOGIN_TIMEOUT_MS, child };
  sessions.set(id, session);

  const onOutput = (chunk: Buffer): void => {
    // progrok은 ANSI 색상 코드와 함께 URL을 출력하므로 제거 후 매칭한다.
    const text = chunk.toString().replace(/\x1b\[[0-9;]*m/g, "");
    const match = AUTHORIZE_URL_RE.exec(text);
    if (match && !session.authorizeUrl) session.authorizeUrl = match[0];
    if (/logged in to xai/i.test(text)) session.status = "complete";
  };
  child.stdout?.on("data", onOutput);
  child.stderr?.on("data", onOutput);

  child.on("error", (err) => {
    if (session.status === "pending") {
      session.status = "error";
      session.error = err.message;
    }
    cleanup(id);
  });
  child.on("exit", (code) => {
    if (session.status !== "complete") {
      session.status = code === 0 ? "complete" : "error";
      if (code !== 0 && !session.error) session.error = "브라우저 로그인이 완료되지 않았습니다. 다시 시도해 주세요.";
    }
    cleanup(id);
  });

  const timer = setTimeout(() => {
    if (session.status === "pending") {
      session.status = "expired";
      session.child?.kill("SIGTERM");
      cleanup(id);
    }
  }, LOGIN_TIMEOUT_MS);
  timer.unref?.();

  // authorize URL이 stdout에 나타날 때까지 잠깐 대기(자동 열기 실패 시 fallback 링크 제공용).
  const deadline = Date.now() + 4000;
  while (!session.authorizeUrl && session.status === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { sessionId: id, authorizeUrl: session.authorizeUrl ?? null, expiresIn: Math.round(LOGIN_TIMEOUT_MS / 1000) };
}

export function getLoginSession(id: string): { status: LoginSession["status"]; error?: string; authorizeUrl?: string } {
  const session = sessions.get(id);
  if (!session) return { status: "expired" };
  if (Date.now() > session.expiresAt && session.status === "pending") {
    session.status = "expired";
    session.child?.kill("SIGTERM");
    cleanup(id);
  }
  return { status: session.status, error: session.error, authorizeUrl: session.authorizeUrl };
}
