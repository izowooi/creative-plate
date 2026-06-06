import type { AppConfig } from "./config.js";
import { appError } from "./errors.js";
import { newId } from "./ids.js";
import { getGrokProxyUrl } from "./grokRuntime.js";
import { imageDataUrl } from "./videoAdapter.js";
import type { ClipPlan, SegmentPlan, StartMode, VideoAspectRatio, VideoResolution } from "../types/domain.js";

export interface CreatePlanInput {
  prompt: string;
  startImageB64?: string | null;
  startImageMime?: string | null;
  targetLength?: number;
  resolution?: VideoResolution;
  aspectRatio?: VideoAspectRatio;
}

function clampTargetLength(cfg: AppConfig, raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return cfg.chain.defaultTargetLength;
  return Math.min(cfg.chain.maxTargetLength, Math.max(cfg.chain.minTargetLength, Math.round(n)));
}

function normalizeResolution(value: unknown, cfg: AppConfig): VideoResolution {
  return value === "480p" || value === "720p" ? value : cfg.chain.defaultResolution;
}

function normalizeAspect(value: unknown, cfg: AppConfig): VideoAspectRatio {
  const allowed = new Set(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"]);
  return typeof value === "string" && allowed.has(value) ? (value as VideoAspectRatio) : cfg.chain.defaultAspectRatio;
}

export function buildPlanningPayload(cfg: AppConfig, input: CreatePlanInput, segmentCount: number, targetLength: number) {
  const content: any[] = [
    {
      type: "text",
      text: [
        "Create a production-ready chained video plan.",
        `The user may write Korean. Preserve intent, but every generated segment prompt must be English.`,
        `Target runtime: ${targetLength}s. Segment count: ${segmentCount}. Each segment should be about ${cfg.chain.segmentDuration}s.`,
        "Segment 1 will be text-to-video unless a starting image is provided; then it is image-to-video.",
        "Segments after the first will extend from the previous clip's final 10-second seed window.",
        "Each prompt must describe visual flow, camera movement, action, audio/no-music intent, dialogue/no-dialogue intent, and a stable ending frame for continuation.",
        "Do not mention APIs, JSON, or implementation details inside segment prompts.",
        "",
        "User prompt:",
        input.prompt,
      ].join("\n"),
    },
  ];
  if (input.startImageB64) {
    content.push({ type: "image_url", image_url: { url: imageDataUrl(input.startImageB64, input.startImageMime || "image/png"), detail: "high" } });
  }

  return {
    model: cfg.grok.plannerModel,
    stream: false,
    parallel_tool_calls: false,
    messages: [
      {
        role: "system",
        content: "You are a bilingual film pre-production planner. Return concise English video-generation prompts through the required tool only.",
      },
      { role: "user", content },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "create_video_plan",
          description: "Create a segment-by-segment plan for a chained Grok video.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    index: { type: "number" },
                    prompt: { type: "string" },
                  },
                  required: ["index", "prompt"],
                },
              },
            },
            required: ["title", "segments"],
          },
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "create_video_plan" } },
  };
}

export function parsePlanningResponse(data: any, segmentCount: number, segmentDuration: number): { title: string; segments: SegmentPlan[] } {
  const toolCalls = data?.choices?.[0]?.message?.tool_calls || [];
  const call = toolCalls.find((item: any) => item.type === "function" && item.function?.name === "create_video_plan");
  if (!call?.function?.arguments) throw appError("Grok planner did not return a video plan", 502, "PLAN_EMPTY_TOOL_CALL");
  let args: any;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    throw appError("Grok planner returned invalid plan JSON", 502, "PLAN_INVALID_JSON");
  }
  const rawSegments = Array.isArray(args.segments) ? args.segments : [];
  const segments: SegmentPlan[] = rawSegments
    .slice(0, segmentCount)
    .map((item: any, idx: number) => ({
      index: idx + 1,
      duration: segmentDuration,
      prompt: typeof item?.prompt === "string" && item.prompt.trim() ? item.prompt.trim() : "",
      status: "pending",
      attempts: 0,
      error: null,
      outputFile: null,
      seedFile: null,
      extendedFile: null,
      tailFile: null,
      xaiRequestId: null,
      revisedPrompt: null,
    }));
  while (segments.length < segmentCount) {
    segments.push({
      index: segments.length + 1,
      duration: segmentDuration,
      prompt: "Continue the cinematic scene with coherent motion, matching style, natural audio, and a stable final frame.",
      status: "pending",
      attempts: 0,
      error: null,
      outputFile: null,
      seedFile: null,
      extendedFile: null,
      tailFile: null,
      xaiRequestId: null,
      revisedPrompt: null,
    });
  }
  if (segments.some((segment) => !segment.prompt)) throw appError("Grok planner returned an empty segment prompt", 502, "PLAN_EMPTY_SEGMENT");
  const title = typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 120) : "Grok chained video";
  return { title, segments };
}

export async function createClipPlan(cfg: AppConfig, input: CreatePlanInput): Promise<ClipPlan> {
  if (!input.prompt || !input.prompt.trim()) throw appError("Prompt is required", 400, "PROMPT_REQUIRED");
  const targetLength = clampTargetLength(cfg, input.targetLength);
  const segmentCount = Math.ceil(targetLength / cfg.chain.segmentDuration);
  const payload = buildPlanningPayload(cfg, input, segmentCount, targetLength);
  const res = await fetch(getGrokProxyUrl(cfg, "/v1/chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer dummy" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(cfg.grok.plannerTimeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw appError(text || `Grok plan request failed: HTTP ${res.status}`, res.status >= 500 ? 502 : res.status, "PLAN_REQUEST_FAILED");
  }
  const parsed = parsePlanningResponse(await res.json(), segmentCount, cfg.chain.segmentDuration);
  const startMode: StartMode = input.startImageB64 ? "image" : "text";
  return {
    id: newId("plan"),
    title: parsed.title,
    originalPrompt: input.prompt.trim(),
    startMode,
    targetLength,
    segmentDuration: cfg.chain.segmentDuration,
    resolution: normalizeResolution(input.resolution, cfg),
    aspectRatio: normalizeAspect(input.aspectRatio, cfg),
    createdAt: Date.now(),
    estimatedOutputSeconds: segmentCount * cfg.chain.segmentDuration,
    estimatedSeedInputSeconds: Math.max(0, segmentCount - 1) * cfg.chain.segmentDuration,
    segments: parsed.segments,
  };
}
