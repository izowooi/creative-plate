import type { Express } from "express";
import type { AppConfig } from "../lib/config.js";
import { registerAuthRoutes } from "./authRoutes.js";
import { registerPlanRoutes } from "./planRoutes.js";
import { registerRunRoutes } from "./runRoutes.js";

export function registerRoutes(app: Express, cfg: AppConfig): void {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, app: "grok-clip-chain" });
  });
  registerAuthRoutes(app);
  registerPlanRoutes(app, cfg);
  registerRunRoutes(app, cfg);
}
