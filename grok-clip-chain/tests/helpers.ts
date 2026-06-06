import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import type { AppConfig } from "../src/lib/config.js";
import { config } from "../src/lib/config.js";

export async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function testConfig(rootDir: string, proxyPort = 18645): AppConfig {
  return {
    ...config,
    storage: {
      rootDir,
      get runsDir() {
        return join(this.rootDir, "runs");
      },
    },
    grok: {
      ...config.grok,
      proxyPort,
      pollIntervalMs: 1,
      pollTimeoutMs: 20_000,
      startTimeoutMs: 5_000,
      downloadTimeoutMs: 5_000,
      plannerTimeoutMs: 5_000,
    },
  };
}

export function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as any).port}`)));
}

export function close(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });
}

export function parseSse(text: string): Array<{ event: string; data: any }> {
  const events: Array<{ event: string; data: any }> = [];
  for (const block of text.split("\n\n")) {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (event && data) events.push({ event, data: JSON.parse(data) });
  }
  return events;
}

export function jsonServer(handler: (url: string, body: any, res: any, req: any) => void): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let parsed: any = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        parsed = {};
      }
      handler(req.url || "", parsed, res, req);
    });
  });
}
