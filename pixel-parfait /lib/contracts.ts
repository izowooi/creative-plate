import { z } from "zod";

export const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"] as const;
export const GENERATION_MODES = ["batch", "compare"] as const;

export const MODEL_IDS = [
  "seedream-5-lite",
  "seedream-4",
  "flux-2-pro",
  "flux-2-flex",
  "flux-2-max",
  "gpt-image-1.5",
  "nano-banana-pro",
  "p-image",
  "z-image-turbo",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type GenerationMode = (typeof GENERATION_MODES)[number];

export const DEFAULT_SELECTED_MODELS: ModelId[] = ["seedream-5-lite", "flux-2-pro"];
export const DEFAULT_BATCH_MODEL: ModelId = "seedream-5-lite";

const fluxResolutionSchema = z.enum(["0.5 MP", "1 MP", "2 MP"]);
const fluxOutputFormatSchema = z.enum(["webp", "jpg", "png"]);

export const advancedSettingsSchema = z.object({
  "seedream-5-lite": z.object({
    size: z.enum(["2K", "3K"]),
    outputFormat: z.enum(["png", "jpeg"]),
  }),
  "seedream-4": z.object({
    size: z.enum(["1K", "2K", "4K"]),
    outputFormat: z.enum(["png", "jpeg"]),
    enhancePrompt: z.boolean(),
  }),
  "flux-2-pro": z.object({
    resolution: fluxResolutionSchema,
    safetyTolerance: z.number().int().min(1).max(5),
    outputFormat: fluxOutputFormatSchema,
  }),
  "flux-2-flex": z.object({
    resolution: fluxResolutionSchema,
    steps: z.number().int().min(6).max(28),
    safetyTolerance: z.number().int().min(1).max(5),
    promptUpsampling: z.boolean(),
    outputFormat: fluxOutputFormatSchema,
  }),
  "flux-2-max": z.object({
    resolution: fluxResolutionSchema,
    safetyTolerance: z.number().int().min(1).max(5),
    outputFormat: fluxOutputFormatSchema,
  }),
  "gpt-image-1.5": z.object({
    quality: z.enum(["low", "medium", "high"]),
    background: z.enum(["auto", "opaque", "transparent"]),
    moderation: z.enum(["auto", "low"]),
    outputFormat: z.enum(["webp", "jpeg", "png"]),
    outputCompression: z.number().int().min(0).max(100),
  }),
  "nano-banana-pro": z.object({
    resolution: z.enum(["1K", "2K", "4K"]),
    outputFormat: z.enum(["jpg", "png"]),
    safetyFilterLevel: z.enum([
      "block_only_high",
      "block_medium_and_above",
      "block_low_and_above",
    ]),
  }),
  "z-image-turbo": z.object({
    outputFormat: z.enum(["jpg", "png", "webp"]),
    numInferenceSteps: z.number().int().min(8).max(12),
    goFast: z.boolean(),
  }),
  "p-image": z.object({
    promptUpsampling: z.boolean(),
    disableSafetyChecker: z.boolean(),
  }),
});

export type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  "seedream-5-lite": {
    size: "2K",
    outputFormat: "png",
  },
  "seedream-4": {
    size: "2K",
    outputFormat: "jpeg",
    enhancePrompt: true,
  },
  "flux-2-pro": {
    resolution: "1 MP",
    safetyTolerance: 2,
    outputFormat: "webp",
  },
  "flux-2-flex": {
    resolution: "1 MP",
    steps: 20,
    safetyTolerance: 2,
    promptUpsampling: true,
    outputFormat: "webp",
  },
  "flux-2-max": {
    resolution: "1 MP",
    safetyTolerance: 2,
    outputFormat: "webp",
  },
  "gpt-image-1.5": {
    quality: "high",
    background: "auto",
    moderation: "auto",
    outputFormat: "webp",
    outputCompression: 90,
  },
  "nano-banana-pro": {
    resolution: "2K",
    outputFormat: "png",
    safetyFilterLevel: "block_only_high",
  },
  "z-image-turbo": {
    outputFormat: "jpg",
    numInferenceSteps: 8,
    goFast: true,
  },
  "p-image": {
    promptUpsampling: true,
    disableSafetyChecker: false,
  },
};

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(10).max(4000),
  mode: z.enum(GENERATION_MODES),
  aspectRatio: z.enum(ASPECT_RATIOS),
  selectedModels: z.array(z.enum(MODEL_IDS)).min(1).max(4),
  imageCount: z.number().int().min(1).max(4),
  advancedSettings: advancedSettingsSchema,
}).superRefine((value, ctx) => {
  if (value.mode === "batch" && value.selectedModels.length !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "한 모델 여러 장 모드에서는 모델을 정확히 1개 선택해야 합니다.",
      path: ["selectedModels"],
    });
  }

  if (value.mode === "compare" && value.selectedModels.length > 4) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "비교 모드에서는 최대 4개 모델까지만 선택할 수 있습니다.",
      path: ["selectedModels"],
    });
  }
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;

export type PredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type PredictionSnapshot = {
  id: string;
  modelId: ModelId;
  variantIndex?: number;
  status: string;
  estimateUsd: number;
  outputUrls: string[];
  error: string | null;
  logs: string;
  webUrl?: string;
  metrics: Record<string, unknown> | null;
};

export type GeneratePredictionResponse = {
  issuedAt: string;
  totalEstimateUsd: number;
  predictions: PredictionSnapshot[];
};
