export type VideoResolution = "480p" | "720p";
export type VideoAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
export type StartMode = "text" | "image";
export type RunStatus = "planned" | "running" | "paused" | "completed" | "failed" | "canceled";
export type SegmentStatus = "pending" | "running" | "completed" | "failed";

export interface SegmentPlan {
  index: number;
  duration: number;
  prompt: string;
  status?: SegmentStatus;
  attempts?: number;
  error?: string | null;
  sourceFile?: string | null;
  outputFile?: string | null;
  seedFile?: string | null;
  extendedFile?: string | null;
  tailFile?: string | null;
  xaiRequestId?: string | null;
  revisedPrompt?: string | null;
}

export interface ClipPlan {
  id: string;
  title: string;
  originalPrompt: string;
  startMode: StartMode;
  targetLength: number;
  segmentDuration: number;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  createdAt: number;
  estimatedOutputSeconds: number;
  estimatedSeedInputSeconds: number;
  segments: SegmentPlan[];
}

export interface RunManifest {
  id: string;
  plan: ClipPlan;
  status: RunStatus;
  createdAt: number;
  updatedAt: number;
  currentSegment: number;
  finalFile: string | null;
  error: string | null;
  canceled: boolean;
  files: {
    startImage?: string | null;
    startImageMime?: string | null;
    final?: string | null;
  };
}

export interface VideoStartResult {
  requestId: string;
}

export interface VideoPollResult {
  status: "pending" | "done" | "failed" | "expired";
  progress?: number;
  videoUrl?: string;
  duration?: number | null;
  respectModeration?: boolean;
  failedCode?: string;
  usage?: Record<string, number> | null;
}

export type ChainSseEvent =
  | { event: "planning"; data: Record<string, unknown> }
  | { event: "segment-start"; data: Record<string, unknown> }
  | { event: "progress"; data: Record<string, unknown> }
  | { event: "retry"; data: Record<string, unknown> }
  | { event: "segment-done"; data: Record<string, unknown> }
  | { event: "merge-done"; data: Record<string, unknown> }
  | { event: "paused"; data: Record<string, unknown> }
  | { event: "error"; data: Record<string, unknown> };
