import type { AspectRatio, ModelId } from "@/lib/contracts";

const ALL_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"] as const satisfies readonly AspectRatio[];
const GPT_IMAGE_ASPECT_RATIOS = ["1:1", "3:2", "2:3"] as const satisfies readonly AspectRatio[];

export type ModelDescriptor = {
  id: ModelId;
  name: string;
  provider: string;
  lane: string;
  description: string;
  replicatePath: string;
  supportedAspectRatios: readonly AspectRatio[];
};

export const MODEL_LIST: ModelDescriptor[] = [
  {
    id: "seedream-5-lite",
    name: "Seedream 5 Lite",
    provider: "ByteDance",
    lane: "Balanced",
    description: "추론과 장면 이해가 좋아 복잡한 요청도 안정적으로 풀어내는 메인 선택지입니다.",
    replicatePath: "bytedance/seedream-5-lite",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "seedream-4",
    name: "Seedream 4",
    provider: "ByteDance",
    lane: "Detail",
    description: "4K까지 선명한 결과를 노릴 때 좋은 고해상도 중심 모델입니다.",
    replicatePath: "bytedance/seedream-4",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    lane: "Pro",
    description: "광고 컷, 제품샷, 포토리얼 결과물을 안정적으로 뽑는 정석형입니다.",
    replicatePath: "black-forest-labs/flux-2-pro",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "flux-2-flex",
    name: "FLUX.2 Flex",
    provider: "Black Forest Labs",
    lane: "Typography",
    description: "텍스트 렌더링과 레이아웃, 작은 디테일 보존에 특히 강합니다.",
    replicatePath: "black-forest-labs/flux-2-flex",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "flux-2-max",
    name: "FLUX.2 Max",
    provider: "Black Forest Labs",
    lane: "Flagship",
    description: "프롬프트 충실도와 결과 일관성을 최대로 끌어올린 상위 모델입니다.",
    replicatePath: "black-forest-labs/flux-2-max",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "gpt-image-1.5",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    lane: "Precise",
    description: "지시 이행과 편집 일관성이 뛰어나고 텍스트가 들어간 장면에도 강합니다.",
    replicatePath: "openai/gpt-image-1.5",
    supportedAspectRatios: GPT_IMAGE_ASPECT_RATIOS,
  },
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "Google",
    lane: "Reasoning",
    description: "추론과 사실성이 뛰어난 구글 계열 프리미엄 모델입니다.",
    replicatePath: "google/nano-banana-pro",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "p-image",
    name: "P-Image",
    provider: "Pruna AI",
    lane: "Fastest",
    description: "1초 안팎으로 방향성을 빠르게 볼 때 좋은 초고속 생산형 모델입니다.",
    replicatePath: "prunaai/p-image",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    provider: "Pruna AI",
    lane: "Speed",
    description: "저렴하게 여러 스타일을 빠르게 탐색하기 좋은 속도 우선형입니다.",
    replicatePath: "prunaai/z-image-turbo",
    supportedAspectRatios: ALL_ASPECT_RATIOS,
  },
];

export const MODEL_LOOKUP = Object.fromEntries(
  MODEL_LIST.map((model) => [model.id, model]),
) as Record<ModelId, ModelDescriptor>;
