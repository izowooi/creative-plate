import type { GenerateRequest, ModelId, PredictionSnapshot } from "@/lib/contracts";
import { MODEL_LOOKUP } from "@/lib/models";
import { estimateModelUsd, getZImageDimensions } from "@/lib/pricing";

type ReplicatePrediction = {
  id: string;
  status: string;
  output: string | string[] | null;
  error: string | null;
  logs: string;
  metrics?: Record<string, unknown> | null;
  urls?: {
    web?: string;
  };
};

const REPLICATE_API_BASE_URL = "https://api.replicate.com/v1";

function getReplicateApiToken() {
  const token = process.env.REPLICATE_API_TOKEN;

  if (!token) {
    throw new Error("REPLICATE_API_TOKEN 이 설정되지 않았습니다.");
  }

  return token;
}

async function replicateFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${REPLICATE_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getReplicateApiToken()}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { detail?: string; title?: string }
      | null;

    throw new Error(payload?.detail ?? payload?.title ?? "Replicate 요청에 실패했습니다.");
  }

  return response.json();
}

function normalizePrediction(
  modelId: ModelId,
  prediction: ReplicatePrediction,
  estimateUsd: number,
): PredictionSnapshot {
  const outputUrls = Array.isArray(prediction.output)
    ? prediction.output.filter(Boolean)
    : prediction.output
      ? [prediction.output]
      : [];

  return {
    id: prediction.id,
    modelId,
    status: prediction.status,
    estimateUsd,
    outputUrls,
    error: prediction.error,
    logs: prediction.logs ?? "",
    webUrl: prediction.urls?.web,
    metrics: prediction.metrics ?? null,
  };
}

function buildPredictionInput(modelId: ModelId, request: GenerateRequest) {
  const { prompt, aspectRatio, advancedSettings } = request;

  switch (modelId) {
    case "seedream-4": {
      const settings = advancedSettings["seedream-4"];

      return {
        prompt,
        size: settings.size,
        aspect_ratio: aspectRatio,
        sequential_image_generation: "disabled",
        max_images: 1,
        enhance_prompt: settings.enhancePrompt,
        output_format: settings.outputFormat,
        image_input: [],
      };
    }
    case "seedream-5-lite": {
      const settings = advancedSettings["seedream-5-lite"];

      return {
        prompt,
        size: settings.size,
        aspect_ratio: aspectRatio,
        sequential_image_generation: "disabled",
        max_images: 1,
        output_format: settings.outputFormat,
        image_input: [],
      };
    }
    case "flux-2-pro": {
      const settings = advancedSettings["flux-2-pro"];

      return {
        prompt,
        input_images: [],
        aspect_ratio: aspectRatio,
        resolution: settings.resolution,
        safety_tolerance: settings.safetyTolerance,
        output_format: settings.outputFormat,
        output_quality: 90,
      };
    }
    case "nano-banana-pro": {
      const settings = advancedSettings["nano-banana-pro"];

      return {
        prompt,
        image_input: [],
        aspect_ratio: aspectRatio,
        resolution: settings.resolution,
        output_format: settings.outputFormat,
        safety_filter_level: settings.safetyFilterLevel,
        allow_fallback_model: false,
      };
    }
    case "z-image-turbo": {
      const settings = advancedSettings["z-image-turbo"];
      const dimensions = getZImageDimensions(aspectRatio);

      return {
        prompt,
        width: dimensions.width,
        height: dimensions.height,
        num_inference_steps: settings.numInferenceSteps,
        guidance_scale: 0,
        go_fast: settings.goFast,
        output_format: settings.outputFormat,
        output_quality: 90,
      };
    }
  }
}

export async function createPrediction(modelId: ModelId, request: GenerateRequest) {
  const model = MODEL_LOOKUP[modelId];
  const estimateUsd = estimateModelUsd(modelId, request.advancedSettings, request.aspectRatio);
  const prediction = (await replicateFetch(`/models/${model.replicatePath}/predictions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Cancel-After": "2m",
    },
    body: JSON.stringify({
      input: buildPredictionInput(modelId, request),
    }),
  })) as ReplicatePrediction;

  return normalizePrediction(modelId, prediction, estimateUsd);
}

export async function fetchPredictionStatus(id: string) {
  const prediction = (await replicateFetch(`/predictions/${id}`)) as ReplicatePrediction & {
    model?: string;
  };

  const modelId = inferModelId(prediction.model);

  if (!modelId) {
    throw new Error("prediction 모델을 식별할 수 없습니다.");
  }

  return normalizePrediction(modelId, prediction, inferEstimateFromModel(modelId, prediction));
}

function inferModelId(modelName?: string) {
  if (!modelName) {
    return null;
  }

  for (const modelId of Object.keys(MODEL_LOOKUP) as ModelId[]) {
    if (MODEL_LOOKUP[modelId].replicatePath === modelName) {
      return modelId;
    }
  }

  return null;
}

function inferEstimateFromModel(modelId: ModelId, prediction: ReplicatePrediction & { input?: unknown }) {
  const input = prediction as ReplicatePrediction & {
    input?: Record<string, unknown>;
  };

  switch (modelId) {
    case "seedream-4":
      return 0.03;
    case "seedream-5-lite":
      return 0.035;
    case "flux-2-pro": {
      const resolution = input.input?.resolution;
      const outputMegapixels =
        resolution === "0.5 MP" ? 0.5 : resolution === "2 MP" ? 2 : 1;
      return 0.015 + outputMegapixels * 0.015;
    }
    case "nano-banana-pro":
      return input.input?.resolution === "4K" ? 0.3 : 0.15;
    case "z-image-turbo": {
      const width = Number(input.input?.width ?? 1024);
      const height = Number(input.input?.height ?? 1024);
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
