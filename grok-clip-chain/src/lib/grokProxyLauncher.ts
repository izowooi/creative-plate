import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import type { AppConfig } from "./config.js";

const PROGROK_LOGIN_COMMAND = "progrok login";

export interface GrokProxyHandle {
  child: ChildProcess | null;
  stop: () => void;
}

export function isGrokProxyAuthRequiredMessage(line: string): boolean {
  const normalized = String(line || "").toLowerCase();
  return normalized.includes("not logged in") && (normalized.includes(PROGROK_LOGIN_COMMAND) || normalized.includes("ima2 grok login"));
}

export function normalizeGrokProxyMessage(line: string): string {
  return String(line || "").replace(/`?progrok login`?/gi, "웹앱에서 Grok 로그인을 완료하세요");
}

export function startGrokProxy(cfg: AppConfig): GrokProxyHandle {
  const progrokBin = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "progrok.cmd" : "progrok");
  const handle: GrokProxyHandle = { child: null, stop };
  let stopping = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleRestart(): void {
    if (stopping) return;
    restartTimer = setTimeout(spawnProxy, 3000);
    restartTimer.unref?.();
  }

  function spawnProxy(): void {
    if (stopping) return;
    const child = spawn(progrokBin, ["proxy", "--host", cfg.grok.proxyHost, "--port", String(cfg.grok.proxyPort)], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
      env: process.env,
    });
    handle.child = child;

    child.stdout?.on("data", (chunk) => {
      const msg = normalizeGrokProxyMessage(chunk.toString().trim());
      if (msg) console.log(`[grok] ${msg}`);
    });
    child.stderr?.on("data", (chunk) => {
      const msg = normalizeGrokProxyMessage(chunk.toString().trim());
      if (msg) console.error(`[grok] ${msg}`);
    });
    child.on("error", (err) => {
      console.error(`[grok] failed to start proxy: ${err.message}`);
      scheduleRestart();
    });
    child.on("exit", (code) => {
      if (handle.child === child) handle.child = null;
      if (stopping) return;
      if (code && code !== 0) console.error(`[grok] proxy exited with code ${code}; retrying after login is completed.`);
      scheduleRestart();
    });
  }

  function stop(): void {
    stopping = true;
    if (restartTimer) clearTimeout(restartTimer);
    try {
      handle.child?.kill("SIGTERM");
    } catch {
      // ignore shutdown races
    }
  }

  spawnProxy();
  return handle;
}
