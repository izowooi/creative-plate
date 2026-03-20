import type {
  AdvancedSettings,
  AspectRatio,
  GenerationMode,
  ModelId,
} from "@/lib/contracts";

const Z_IMAGE_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:3": { width: 1152, height: 864 },
  "3:4": { width: 864, height: 1152 },
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "3:2": { width: 1152, height: 768 },
  "2:3": { width: 768, height: 1152 },
};

const FLUX_OUTPUT_MEGAPIXELS = {
  "0.5 MP": 0.5,
  "1 MP": 1,
  "2 MP": 2,
} as const;

export function getZImageDimensions(aspectRatio: AspectRatio) {
  return Z_IMAGE_DIMENSIONS[aspectRatio];
}

export function estimateModelUsd(
  modelId: ModelId,
  advancedSettings: AdvancedSettings,
  aspectRatio: AspectRatio,
) {
  switch (modelId) {
    case "seedream-5-lite":
      return 0.035;
    case "seedream-4":
      return 0.03;
    case "flux-2-pro":
      return 0.015 + FLUX_OUTPUT_MEGAPIXELS[advancedSettings["flux-2-pro"].resolution] * 0.015;
    case "flux-2-flex":
      return FLUX_OUTPUT_MEGAPIXELS[advancedSettings["flux-2-flex"].resolution] * 0.06;
    case "flux-2-max":
      return 0.04 + FLUX_OUTPUT_MEGAPIXELS[advancedSettings["flux-2-max"].resolution] * 0.03;
    case "gpt-image-1.5": {
      const quality = advancedSettings["gpt-image-1.5"].quality;

      if (quality === "low") {
        return 0.013;
      }

      if (quality === "medium") {
        return 0.05;
      }

      return 0.136;
    }
    case "nano-banana-pro":
      return advancedSettings["nano-banana-pro"].resolution === "4K" ? 0.3 : 0.15;
    case "p-image":
      return 0.005;
    case "z-image-turbo": {
      const { width, height } = getZImageDimensions(aspectRatio);
      const pixels = width * height;

      if (pixels <= 500_000) {
        return 0.0025;
      }

      if (pixels <= 1_000_000) {
        return 0.005;
      }

      return 0.01;
    }
  }
}

export function estimateBundleUsd(
  mode: GenerationMode,
  selectedModels: ModelId[],
  imageCount: number,
  advancedSettings: AdvancedSettings,
  aspectRatio: AspectRatio,
) {
  const unitTotal = selectedModels.reduce(
    (sum, modelId) => sum + estimateModelUsd(modelId, advancedSettings, aspectRatio),
    0,
  );

  return mode === "batch" ? unitTotal * imageCount : unitTotal;
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 0.1 ? 3 : 2,
    maximumFractionDigits: 3,
  }).format(value);
}
