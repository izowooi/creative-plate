import type { ModelId } from "@/lib/contracts";

type ModelDescriptor = {
  id: ModelId;
  name: string;
  provider: string;
  lane: string;
  description: string;
  replicatePath: string;
};

export const MODEL_LIST: ModelDescriptor[] = [
  {
    id: "seedream-4",
    name: "Seedream 4",
    provider: "ByteDance",
    lane: "variation",
    description: "해상도와 디테일이 좋고, 프롬프트를 한층 더 정리해 주는 균형형 모델입니다.",
    replicatePath: "bytedance/seedream-4",
  },
  {
    id: "seedream-5-lite",
    name: "Seedream 5 Lite",
    provider: "ByteDance",
    lane: "balanced",
    description: "구도 이해력과 텍스트 표현력이 좋고, 초보자도 비교적 안정적으로 다루기 쉽습니다.",
    replicatePath: "bytedance/seedream-5-lite",
  },
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    lane: "premium",
    description: "광고 컷이나 포토리얼 결과물에 강하고 텍스트 렌더링도 안정적인 편입니다.",
    replicatePath: "black-forest-labs/flux-2-pro",
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "Google",
    lane: "reasoning",
    description: "추론과 지식 활용이 강력한 프리미엄 모델입니다. 품질은 높지만 비용도 높습니다.",
    replicatePath: "google/nano-banana-pro",
  },
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    provider: "PrunaAI",
    lane: "speed",
    description: "가볍고 빠르게 샘플을 보고 싶을 때 좋은 저비용 모델입니다.",
    replicatePath: "prunaai/z-image-turbo",
  },
];

export const MODEL_LOOKUP = Object.fromEntries(
  MODEL_LIST.map((model) => [model.id, model]),
) as Record<ModelId, ModelDescriptor>;
