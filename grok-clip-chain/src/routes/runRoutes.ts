import type { Express, Response } from "express";
import { readFile } from "node:fs/promises";
import type { AppConfig } from "../lib/config.js";
import { executeRun, markRunCanceled } from "../lib/chainRunner.js";
import { errorInfo } from "../lib/errors.js";
import { createRunManifest, listRuns, readRunManifest, runFile, saveRunManifest } from "../lib/runStore.js";
import type { ChainSseEvent, ClipPlan } from "../types/domain.js";

const controllers = new Map<string, AbortController>();

function sendSse(res: Response, event: ChainSseEvent["event"], data: Record<string, unknown>): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function stripDataUrl(value: unknown): { b64: string | null; mime: string | null } {
  if (typeof value !== "string" || !value.trim()) return { b64: null, mime: null };
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (match) return { b64: match[2], mime: match[1] };
  return { b64: value, mime: null };
}

function configureSse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

async function streamRun(cfg: AppConfig, runId: string, res: Response): Promise<void> {
  if (controllers.has(runId)) {
    sendSse(res, "error", { runId, error: "Run is already active", code: "RUN_ALREADY_ACTIVE", status: 409 });
    res.end();
    return;
  }
  const controller = new AbortController();
  controllers.set(runId, controller);
  try {
    await executeRun(cfg, runId, (event, data) => sendSse(res, event, data), controller.signal);
  } catch (error) {
    const info = errorInfo(error);
    sendSse(res, "error", { runId, error: info.message, code: info.code, status: info.status });
  } finally {
    controllers.delete(runId);
    res.end();
  }
}

export function registerRunRoutes(app: Express, cfg: AppConfig): void {
  app.get("/api/runs", async (_req, res) => {
    try {
      res.json({ runs: await listRuns(cfg) });
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });

  app.post("/api/runs", async (req, res) => {
    configureSse(res);
    try {
      const plan = req.body?.plan as ClipPlan | undefined;
      if (!plan?.segments?.length) {
        sendSse(res, "error", { error: "Plan is required", code: "PLAN_REQUIRED", status: 400 });
        res.end();
        return;
      }
      const image = stripDataUrl(req.body?.startImageB64);
      const manifest = await createRunManifest(cfg, {
        plan,
        startImageB64: image.b64,
        startImageMime: req.body?.startImageMime || image.mime,
      });
      await streamRun(cfg, manifest.id, res);
    } catch (error) {
      const info = errorInfo(error);
      sendSse(res, "error", { error: info.message, code: info.code, status: info.status });
      res.end();
    }
  });

  app.post("/api/runs/:id/resume", async (req, res) => {
    configureSse(res);
    try {
      const manifest = await readRunManifest(cfg, req.params.id);
      if (manifest.status === "completed") {
        sendSse(res, "merge-done", { runId: manifest.id, finalFile: manifest.finalFile, downloadUrl: `/api/runs/${manifest.id}/download` });
        res.end();
        return;
      }
      manifest.status = "planned";
      manifest.canceled = false;
      await saveRunManifest(cfg, manifest);
      await streamRun(cfg, req.params.id, res);
    } catch (error) {
      const info = errorInfo(error);
      sendSse(res, "error", { runId: req.params.id, error: info.message, code: info.code, status: info.status });
      res.end();
    }
  });

  app.post("/api/runs/:id/cancel", async (req, res) => {
    try {
      controllers.get(req.params.id)?.abort();
      const manifest = await markRunCanceled(cfg, req.params.id);
      res.json({ run: manifest });
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });

  app.get("/api/runs/:id", async (req, res) => {
    try {
      res.json({ run: await readRunManifest(cfg, req.params.id) });
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });

  app.get("/api/runs/:id/download", async (req, res) => {
    try {
      const manifest = await readRunManifest(cfg, req.params.id);
      if (!manifest.finalFile) return res.status(404).json({ error: "Final video is not ready", code: "FINAL_NOT_READY" });
      const path = runFile(cfg, manifest.id, manifest.finalFile);
      const bytes = await readFile(path);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${manifest.id}.mp4"`);
      res.send(bytes);
    } catch (error) {
      const info = errorInfo(error);
      res.status(info.status).json({ error: info.message, code: info.code, status: info.status });
    }
  });
}
