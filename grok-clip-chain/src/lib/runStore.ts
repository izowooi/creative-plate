import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import type { AppConfig } from "./config.js";
import { appError } from "./errors.js";
import { newId } from "./ids.js";
import type { ClipPlan, RunManifest } from "../types/domain.js";

export interface CreateRunInput {
  plan: ClipPlan;
  startImageB64?: string | null;
  startImageMime?: string | null;
}

export function runDir(cfg: AppConfig, runId: string): string {
  return join(cfg.storage.runsDir, runId);
}

export function manifestPath(cfg: AppConfig, runId: string): string {
  return join(runDir(cfg, runId), "manifest.json");
}

export function runFile(cfg: AppConfig, runId: string, relativePath: string): string {
  const base = resolve(runDir(cfg, runId));
  const target = resolve(base, relativePath);
  if (target !== base && !target.startsWith(`${base}${sep}`)) throw appError("Invalid run file path", 400, "RUN_FILE_INVALID");
  return target;
}

export async function ensureRunRoot(cfg: AppConfig): Promise<void> {
  await mkdir(cfg.storage.runsDir, { recursive: true });
}

async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

function imageExtension(mime: string | null | undefined): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

export async function createRunManifest(cfg: AppConfig, input: CreateRunInput): Promise<RunManifest> {
  await ensureRunRoot(cfg);
  const id = newId("run");
  const dir = runDir(cfg, id);
  await mkdir(join(dir, "segments"), { recursive: true });
  await mkdir(join(dir, "work"), { recursive: true });
  let startImage: string | null = null;
  if (input.startImageB64) {
    startImage = `input/start.${imageExtension(input.startImageMime)}`;
    await mkdir(join(dir, "input"), { recursive: true });
    const b64 = input.startImageB64.startsWith("data:") ? input.startImageB64.split(",", 2)[1] || "" : input.startImageB64;
    await writeFile(join(dir, startImage), Buffer.from(b64, "base64"));
  }
  const now = Date.now();
  const manifest: RunManifest = {
    id,
    plan: { ...input.plan, id, segments: input.plan.segments.map((segment) => ({ ...segment, status: "pending", attempts: 0, error: null })) },
    status: "planned",
    createdAt: now,
    updatedAt: now,
    currentSegment: 1,
    finalFile: null,
    error: null,
    canceled: false,
    files: { startImage, startImageMime: input.startImageMime || null, final: null },
  };
  await saveRunManifest(cfg, manifest);
  return manifest;
}

export async function saveRunManifest(cfg: AppConfig, manifest: RunManifest): Promise<void> {
  const dir = runDir(cfg, manifest.id);
  await mkdir(dir, { recursive: true });
  manifest.updatedAt = Date.now();
  await atomicWriteJson(manifestPath(cfg, manifest.id), manifest);
}

export async function readRunManifest(cfg: AppConfig, runId: string): Promise<RunManifest> {
  const path = manifestPath(cfg, runId);
  if (!existsSync(path)) throw appError("Run not found", 404, "RUN_NOT_FOUND");
  return JSON.parse(await readFile(path, "utf-8")) as RunManifest;
}

export async function listRuns(cfg: AppConfig): Promise<Array<{ id: string; title: string; status: string; updatedAt: number }>> {
  await ensureRunRoot(cfg);
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(cfg.storage.runsDir, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const manifest = await readRunManifest(cfg, basename(entry.name));
          return { id: manifest.id, title: manifest.plan.title, status: manifest.status, updatedAt: manifest.updatedAt };
        } catch {
          return null;
        }
      }),
  );
  const compact = runs.filter((run): run is NonNullable<(typeof runs)[number]> => Boolean(run));
  return compact.sort((a, b) => b.updatedAt - a.updatedAt);
}
