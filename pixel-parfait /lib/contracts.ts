import { z } from "zod";

export const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"] as const;
export const GENERATION_MODES = ["batch", "compare"] as const;

export const MODEL_IDS = [
  "seedream-4",
  "seedream-5-lite",
  "flux-2-pro",
  "nano-banana-pro",
  "z-image-turbo",
] as const;

export type ModelId = (typeof MODEL_IDS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type GenerationMode = (typeof GENERATION_MODES)[number];

export const DEFAULT_SELECTED_MODELS: ModelId[] = ["z-image-turbo", "seedream-5-lite"];
export const DEFAULT_BATCH_MODEL: ModelId = "seedream-5-lite";

export const advancedSettingsSchema = z.object({
  "seedream-4": z.object({
    size: z.enum(["1K", "2K", "4K"]),
    outputFormat: z.enum(["png", "jpeg"]),
    enhancePrompt: z.boolean(),
  }),
  "seedream-5-lite": z.object({
    size: z.enum(["2K", "3K"]),
    outputFormat: z.enum(["png", "jpeg"]),
  }),
  "flux-2-pro": z.object({
    resolution: z.enum(["0.5 MP", "1 MP", "2 MP"]),
    outputFormat: z.enum(["webp", "jpg", "png"]),
    safetyTolerance: z.number().int().min(1).max(5),
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
});

export type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;

export const DEFAULT_ADVANCED_SETTINGS: AdvancedSettings = {
  "seedream-4": {
    size: "2K",
    outputFormat: "jpeg",
    enhancePrompt: true,
  },
  "seedream-5-lite": {
    size: "2K",
    outputFormat: "png",
  },
  "flux-2-pro": {
    resolution: "1 MP",
    outputFormat: "webp",
    safetyTolerance: 2,
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
