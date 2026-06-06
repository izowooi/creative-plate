import type { Express } from "express";
import { errorInfo } from "../lib/errors.js";
import { getLoginSession, readGrokAuthStatus, startGrokLogin } from "../lib/auth.js";

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/status", (_req, res) => {
    res.json(readGrokAuthStatus());
  });

  app.post("/api/auth/login", async (_req, res) => {
    try {
      res.json(await startGrokLogin());
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });

  app.get("/api/auth/login/:id", (req, res) => {
    res.json(getLoginSession(req.params.id));
  });
}
