import express from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config, type AppConfig } from "./lib/config.js";
import { assertMediaTools } from "./lib/media.js";
import { startGrokProxy, type GrokProxyHandle } from "./lib/grokProxyLauncher.js";
import { registerRoutes } from "./routes/index.js";

export interface BuildAppOptions {
  config?: AppConfig;
}

export function buildApp(options: BuildAppOptions = {}) {
  const cfg = options.config || config;
  const app = express();
  app.use(express.json({ limit: cfg.server.bodyLimit }));

  const uiDir = join(process.cwd(), "dist-ui");
  if (existsSync(uiDir)) {
    app.use(express.static(uiDir));
  }
  registerRoutes(app, cfg);
  if (existsSync(uiDir)) {
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      return res.sendFile(join(uiDir, "index.html"));
    });
  }
  return app;
}

export async function startServer(cfg: AppConfig = config): Promise<{ url: string; stop: () => void }> {
  await assertMediaTools().catch((error) => {
    console.warn(`[media] ${error.message}`);
  });
  let proxy: GrokProxyHandle | null = null;
  if (process.env.GROK_CHAIN_NO_PROXY !== "1") {
    proxy = startGrokProxy(cfg);
  }
  const app = buildApp({ config: cfg });
  const server = app.listen(cfg.server.port, cfg.server.host);
  const url = `http://${cfg.server.host}:${cfg.server.port}`;
  await new Promise<void>((resolve) => server.once("listening", resolve));
  console.log(`Grok Clip Chain: ${url}`);

  const stop = () => {
    proxy?.stop();
    server.close();
  };
  process.once("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    stop();
    process.exit(0);
  });
  return { url, stop };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void startServer();
}
