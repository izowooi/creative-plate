import type { AppConfig } from "./config.js";
import { appError, errorInfo } from "./errors.js";
import { concatMp4, extractExtensionTail, extractSeedWindow, probeDuration, readMp4, writeMp4 } from "./media.js";
import { generateInitialVideo, extendVideo } from "./videoAdapter.js";
import { readRunManifest, runFile, saveRunManifest } from "./runStore.js";
import type { ChainSseEvent, RunManifest, SegmentPlan } from "../types/domain.js";

export type EmitChainEvent = (event: ChainSseEvent["event"], data: Record<string, unknown>) => void;

function segmentPath(index: number): string {
  return `segments/segment-${String(index).padStart(2, "0")}.mp4`;
}

function seedPath(index: number): string {
  return `work/segment-${String(index).padStart(2, "0")}-seed.mp4`;
}

function extendedPath(index: number): string {
  return `work/segment-${String(index).padStart(2, "0")}-extended.mp4`;
}

function finalPath(): string {
  return "final.mp4";
}

function completedSegmentFiles(manifest: RunManifest): string[] {
  return manifest.plan.segments
    .filter((segment) => segment.status === "completed" && segment.outputFile)
    .map((segment) => segment.outputFile!);
}

function markRunning(manifest: RunManifest, segment: SegmentPlan, attempt: number): void {
  manifest.status = "running";
  manifest.error = null;
  manifest.currentSegment = segment.index;
  segment.status = "running";
  segment.attempts = attempt;
  segment.error = null;
}

async function updateFinal(cfg: AppConfig, manifest: RunManifest): Promise<void> {
  const files = completedSegmentFiles(manifest).map((relative) => runFile(cfg, manifest.id, relative));
  const relativeFinal = finalPath();
  await concatMp4(files, runFile(cfg, manifest.id, relativeFinal));
  manifest.finalFile = relativeFinal;
  manifest.files.final = relativeFinal;
}

async function runFirstSegment(
  cfg: AppConfig,
  manifest: RunManifest,
  segment: SegmentPlan,
  signal: AbortSignal | undefined,
  emit: EmitChainEvent,
): Promise<void> {
  let sourceImageB64: string | null = null;
  if (manifest.files.startImage) {
    sourceImageB64 = (await readMp4(runFile(cfg, manifest.id, manifest.files.startImage))).toString("base64");
  }
  const result = await generateInitialVideo(cfg, {
    prompt: segment.prompt,
    duration: segment.duration,
    resolution: manifest.plan.resolution,
    aspectRatio: manifest.plan.aspectRatio,
    sourceImageB64,
    sourceImageMime: manifest.files.startImageMime || "image/png",
    signal,
    onProgress: (progress, stalled) => emit("progress", { runId: manifest.id, segment: segment.index, progress, stalled }),
  });
  const output = segmentPath(segment.index);
  await writeMp4(runFile(cfg, manifest.id, output), result.buffer);
  segment.outputFile = output;
  segment.sourceFile = result.sourceUrl;
  segment.xaiRequestId = result.xaiRequestId;
  segment.revisedPrompt = segment.prompt;
}

async function runExtensionSegment(
  cfg: AppConfig,
  manifest: RunManifest,
  segment: SegmentPlan,
  signal: AbortSignal | undefined,
  emit: EmitChainEvent,
): Promise<void> {
  if (!manifest.finalFile) throw appError("Previous final video is missing", 500, "CHAIN_FINAL_MISSING");
  const currentFinal = runFile(cfg, manifest.id, manifest.finalFile);
  const seed = seedPath(segment.index);
  const extended = extendedPath(segment.index);
  const tail = segmentPath(segment.index);
  const seedDuration = await extractSeedWindow(currentFinal, runFile(cfg, manifest.id, seed), manifest.plan.segmentDuration);
  const seedBuffer = await readMp4(runFile(cfg, manifest.id, seed));
  const result = await extendVideo(cfg, {
    prompt: segment.prompt,
    duration: segment.duration,
    seedVideo: seedBuffer,
    signal,
    onProgress: (progress, stalled) => emit("progress", { runId: manifest.id, segment: segment.index, progress, stalled }),
  });
  await writeMp4(runFile(cfg, manifest.id, extended), result.buffer);
  await extractExtensionTail(runFile(cfg, manifest.id, extended), runFile(cfg, manifest.id, tail), seedDuration, segment.duration);
  segment.seedFile = seed;
  segment.extendedFile = extended;
  segment.tailFile = tail;
  segment.outputFile = tail;
  segment.sourceFile = result.sourceUrl;
  segment.xaiRequestId = result.xaiRequestId;
  segment.revisedPrompt = segment.prompt;
}

async function completeSegment(cfg: AppConfig, manifest: RunManifest, segment: SegmentPlan, emit: EmitChainEvent): Promise<void> {
  segment.status = "completed";
  segment.error = null;
  await updateFinal(cfg, manifest);
  const duration = manifest.finalFile ? await probeDuration(runFile(cfg, manifest.id, manifest.finalFile)).catch(() => null) : null;
  manifest.currentSegment = segment.index + 1;
  emit("segment-done", {
    runId: manifest.id,
    segment: segment.index,
    outputFile: segment.outputFile,
    xaiRequestId: segment.xaiRequestId,
    finalDuration: duration,
  });
  await saveRunManifest(cfg, manifest);
}

async function runSegmentAttempt(
  cfg: AppConfig,
  manifest: RunManifest,
  segment: SegmentPlan,
  signal: AbortSignal | undefined,
  emit: EmitChainEvent,
): Promise<void> {
  if (segment.index === 1) await runFirstSegment(cfg, manifest, segment, signal, emit);
  else await runExtensionSegment(cfg, manifest, segment, signal, emit);
  await completeSegment(cfg, manifest, segment, emit);
}

export async function executeRun(cfg: AppConfig, runId: string, emit: EmitChainEvent, signal?: AbortSignal): Promise<RunManifest> {
  const manifest = await readRunManifest(cfg, runId);
  if (manifest.status === "completed") return manifest;
  manifest.status = "running";
  manifest.canceled = false;
  await saveRunManifest(cfg, manifest);
  emit("planning", { runId: manifest.id, title: manifest.plan.title });

  for (let idx = Math.max(1, manifest.currentSegment); idx <= manifest.plan.segments.length; idx += 1) {
    const segment = manifest.plan.segments[idx - 1];
    if (!segment || segment.status === "completed") continue;
    for (let attempt = (segment.attempts ?? 0) + 1; attempt <= cfg.chain.maxAttempts; attempt += 1) {
      if (signal?.aborted || manifest.canceled) throw appError("Run canceled", 499, "RUN_CANCELED");
      markRunning(manifest, segment, attempt);
      await saveRunManifest(cfg, manifest);
      emit("segment-start", { runId: manifest.id, segment: segment.index, attempt, prompt: segment.prompt });
      try {
        await runSegmentAttempt(cfg, manifest, segment, signal, emit);
        break;
      } catch (error) {
        const info = errorInfo(error);
        segment.status = "failed";
        segment.error = info.message;
        segment.attempts = attempt;
        await saveRunManifest(cfg, manifest);
        if (attempt < cfg.chain.maxAttempts) {
          emit("retry", { runId: manifest.id, segment: segment.index, attempt, nextAttempt: attempt + 1, error: info.message, code: info.code });
          continue;
        }
        manifest.status = "paused";
        manifest.currentSegment = segment.index;
        manifest.error = info.message;
        await saveRunManifest(cfg, manifest);
        emit("paused", { runId: manifest.id, segment: segment.index, attempts: attempt, error: info.message, code: info.code });
        return manifest;
      }
    }
  }

  manifest.status = "completed";
  manifest.error = null;
  manifest.currentSegment = manifest.plan.segments.length + 1;
  await saveRunManifest(cfg, manifest);
  emit("merge-done", { runId: manifest.id, finalFile: manifest.finalFile, downloadUrl: `/api/runs/${manifest.id}/download` });
  return manifest;
}

export async function markRunCanceled(cfg: AppConfig, runId: string): Promise<RunManifest> {
  const manifest = await readRunManifest(cfg, runId);
  manifest.canceled = true;
  manifest.status = "canceled";
  manifest.error = "Canceled by user";
  await saveRunManifest(cfg, manifest);
  return manifest;
}
