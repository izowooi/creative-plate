import type { AppConfig } from "./config.js";
import { appError } from "./errors.js";
import { getGrokProxyUrl } from "./grokRuntime.js";
import type { VideoAspectRatio, VideoPollResult, VideoResolution } from "../types/domain.js";

export interface VideoGenerateOptions {
  prompt: string;
  duration: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  sourceImageB64?: string | null;
  sourceImageMime?: string | null;
  signal?: AbortSignal;
  onProgress?: (progress: number | null, stalled: boolean) => void;
}

export interface VideoExtendOptions {
  prompt: string;
  duration: number;
  seedVideo: Buffer;
  signal?: AbortSignal;
  onProgress?: (progress: number | null, stalled: boolean) => void;
}

export interface VideoResult {
  buffer: Buffer;
  contentType: string;
  xaiRequestId: string;
  duration: number | null;
  sourceUrl: string;
  usage: Record<string, number> | null;
}

const STALE_PROGRESS_MS = 180_000;

function withTimeoutSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function headers(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: "Bearer dummy" };
}

export function imageDataUrl(b64: string, mime = "image/png"): string {
  if (b64.startsWith("data:") || b64.startsWith("http")) return b64;
  return `data:${mime};base64,${b64}`;
}

export function videoDataUrl(buffer: Buffer): string {
  return `data:video/mp4;base64,${buffer.toString("base64")}`;
}

export function buildVideoGenerationPayload(cfg: AppConfig, opts: VideoGenerateOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: cfg.grok.model,
    prompt: opts.prompt,
    duration: opts.duration,
    resolution: opts.resolution,
    aspect_ratio: opts.aspectRatio,
  };
  if (opts.sourceImageB64) {
    payload.image = { url: imageDataUrl(opts.sourceImageB64, opts.sourceImageMime || "image/png") };
  }
  return payload;
}

export function buildVideoExtensionPayload(cfg: AppConfig, opts: VideoExtendOptions): Record<string, unknown> {
  return {
    model: cfg.grok.model,
    prompt: opts.prompt,
    duration: opts.duration,
    video: { url: videoDataUrl(opts.seedVideo) },
  };
}

export function normalizeVideoPoll(data: any): VideoPollResult {
  const poll: VideoPollResult = {
    status: data?.status,
    ...(typeof data?.progress === "number" ? { progress: data.progress } : {}),
    ...(typeof data?.video?.url === "string" ? { videoUrl: data.video.url } : {}),
    duration: data?.video?.duration ?? null,
    ...(typeof data?.video?.respect_moderation === "boolean" ? { respectModeration: data.video.respect_moderation } : {}),
    ...(typeof data?.error?.code === "string" ? { failedCode: data.error.code } : {}),
    usage: data?.usage ? { grok_cost_usd_ticks: data.usage.cost_in_usd_ticks ?? 0 } : null,
  };
  return poll;
}

async function startVideoRequest(cfg: AppConfig, path: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const res = await fetch(getGrokProxyUrl(cfg, path), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
    signal: withTimeoutSignal(signal, cfg.grok.startTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw appError(text || `Grok video start failed: HTTP ${res.status}`, res.status >= 500 ? 502 : res.status, "GROK_VIDEO_REQUEST_FAILED");
  }
  const data = (await res.json()) as { request_id?: string; id?: string };
  const requestId = data.request_id || data.id;
  if (!requestId) throw appError("Grok video start returned no request id", 502, "GROK_VIDEO_REQUEST_FAILED");
  return requestId;
}

async function pollVideoOnce(cfg: AppConfig, requestId: string, signal?: AbortSignal): Promise<VideoPollResult> {
  const res = await fetch(getGrokProxyUrl(cfg, `/v1/videos/${requestId}`), {
    method: "GET",
    headers: headers(),
    signal: withTimeoutSignal(signal, cfg.grok.startTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw appError(text || `Grok video poll failed: HTTP ${res.status}`, res.status >= 500 ? 502 : res.status, "GROK_VIDEO_POLL_FAILED");
  }
  return normalizeVideoPoll(await res.json());
}

function failedPollError(poll: VideoPollResult): Error {
  if (poll.status === "expired") return appError("Grok video job expired", 502, "GROK_VIDEO_EXPIRED");
  if (poll.failedCode === "invalid_argument") return appError("Grok video invalid argument", 400, "GROK_VIDEO_REQUEST_FAILED");
  if (poll.failedCode === "permission_denied") return appError("Grok video permission denied", 403, "GROK_VIDEO_REQUEST_FAILED");
  if (poll.failedCode === "failed_precondition") return appError("Grok video failed precondition", 412, "GROK_VIDEO_REQUEST_FAILED");
  if (poll.failedCode === "service_unavailable") return appError("Grok video service unavailable", 502, "GROK_VIDEO_POLL_FAILED");
  return appError("Grok video generation failed", 502, "GROK_VIDEO_FAILED");
}

async function pollVideoUntilDone(
  cfg: AppConfig,
  requestId: string,
  opts: { signal?: AbortSignal; onProgress?: (progress: number | null, stalled: boolean) => void },
): Promise<VideoPollResult> {
  const deadline = Date.now() + cfg.grok.pollTimeoutMs;
  let lastProgress = -1;
  let lastProgressAt = Date.now();
  for (;;) {
    if (Date.now() > deadline) throw appError("Grok video poll budget exceeded", 504, "GROK_VIDEO_TIMEOUT");
    const poll = await pollVideoOnce(cfg, requestId, opts.signal);
    if (poll.status === "done") return poll;
    if (poll.status === "failed" || poll.status === "expired") throw failedPollError(poll);
    const progress = poll.progress ?? lastProgress;
    if (progress !== lastProgress) {
      lastProgress = progress;
      lastProgressAt = Date.now();
    }
    opts.onProgress?.(typeof poll.progress === "number" ? poll.progress : null, Date.now() - lastProgressAt > STALE_PROGRESS_MS);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, cfg.grok.pollIntervalMs);
      opts.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(appError("Run canceled", 499, "RUN_CANCELED"));
        },
        { once: true },
      );
    });
  }
}

export async function downloadVideo(cfg: AppConfig, url: string, signal?: AbortSignal): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: withTimeoutSignal(signal, cfg.grok.downloadTimeoutMs) });
  if (!res.ok) throw appError(`Video download failed: HTTP ${res.status}`, 502, "GROK_VIDEO_DOWNLOAD_FAILED");
  const contentType = res.headers.get("content-type") || "video/mp4";
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function finishStartedVideo(
  cfg: AppConfig,
  requestId: string,
  opts: { signal?: AbortSignal; onProgress?: (progress: number | null, stalled: boolean) => void },
): Promise<VideoResult> {
  const poll = await pollVideoUntilDone(cfg, requestId, opts);
  if (poll.respectModeration === false) throw appError("Grok video blocked by moderation", 502, "GROK_VIDEO_MODERATION_BLOCKED");
  if (!poll.videoUrl) throw appError("Grok video done without a video url", 502, "GROK_VIDEO_EMPTY_RESPONSE");
  const downloaded = await downloadVideo(cfg, poll.videoUrl, opts.signal);
  return {
    buffer: downloaded.buffer,
    contentType: downloaded.contentType,
    xaiRequestId: requestId,
    duration: poll.duration ?? null,
    sourceUrl: poll.videoUrl,
    usage: poll.usage ?? null,
  };
}

export async function generateInitialVideo(cfg: AppConfig, opts: VideoGenerateOptions): Promise<VideoResult> {
  const requestId = await startVideoRequest(cfg, "/v1/videos/generations", buildVideoGenerationPayload(cfg, opts), opts.signal);
  return finishStartedVideo(cfg, requestId, opts);
}

export async function extendVideo(cfg: AppConfig, opts: VideoExtendOptions): Promise<VideoResult> {
  const requestId = await startVideoRequest(cfg, "/v1/videos/extensions", buildVideoExtensionPayload(cfg, opts), opts.signal);
  return finishStartedVideo(cfg, requestId, opts);
}
