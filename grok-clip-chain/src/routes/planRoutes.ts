import type { Express } from "express";
import type { AppConfig } from "../lib/config.js";
import { createClipPlan } from "../lib/planner.js";
import { errorInfo } from "../lib/errors.js";

function stripDataUrl(value: unknown): { b64: string | null; mime: string | null } {
  if (typeof value !== "string" || !value.trim()) return { b64: null, mime: null };
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (match) return { b64: match[2], mime: match[1] };
  return { b64: value, mime: null };
}

export function registerPlanRoutes(app: Express, cfg: AppConfig): void {
  app.post("/api/plans", async (req, res) => {
    try {
      const image = stripDataUrl(req.body?.startImageB64);
      const plan = await createClipPlan(cfg, {
        prompt: req.body?.prompt,
        startImageB64: image.b64,
        startImageMime: req.body?.startImageMime || image.mime,
        targetLength: req.body?.targetLength,
        resolution: req.body?.resolution,
        aspectRatio: req.body?.aspectRatio,
      });
      res.json({ plan });
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });
}
