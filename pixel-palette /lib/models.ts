export type ModelOutputType = 'single' | 'array'
export type SpeedRating = 'turbo' | 'fast' | 'medium'
export type QualityRating = 'good' | 'high' | 'highest'

export interface AdvancedParam {
  key: string
  label: string
  type: 'slider' | 'select' | 'number' | 'boolean' | 'text'
  min?: number
  max?: number
  step?: number
  options?: string[]
  default: string | number | boolean | null
  description?: string
}

export interface ModelConfig {
  id: string
  name: string
  vendor: string
  vendorShort: string
  description: string
  badge?: string
  speed: SpeedRating
  quality: QualityRating
  estimatedCostPerImage: number
  outputType: ModelOutputType
  supportsMultipleImages: boolean
  maxImages: number
  supportedAspectRatios: string[]
  defaultAspectRatio: string
  tags: string[]
  advancedParams: AdvancedParam[]
  color: string // tailwind color class for accent
}

export const ASPECT_RATIOS = [
  { value: '1:1', label: '1:1', icon: '⬛', width: 1, height: 1 },
  { value: '16:9', label: '16:9', icon: '▬', width: 16, height: 9 },
  { value: '9:16', label: '9:16', icon: '▮', width: 9, height: 16 },
  { value: '4:3', label: '4:3', icon: '▬', width: 4, height: 3 },
  { value: '3:4', label: '3:4', icon: '▯', width: 3, height: 4 },
  { value: '3:2', label: '3:2', icon: '▬', width: 3, height: 2 },
  { value: '2:3', label: '2:3', icon: '▯', width: 2, height: 3 },
]

export const MODELS: ModelConfig[] = [
  {
    id: 'black-forest-labs/flux-2-pro',
    name: 'FLUX.2 Pro',
    vendor: 'Black Forest Labs',
    vendorShort: 'BFL',
    description: 'Excellent text rendering & typography. Production-ready reliability.',
    badge: '인기',
    speed: 'fast',
    quality: 'high',
    estimatedCostPerImage: 0.055,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    defaultAspectRatio: '1:1',
    tags: ['text', 'photo', 'design'],
    color: 'indigo',
    advancedParams: [
      { key: 'output_quality', label: 'Output Quality', type: 'slider', min: 0, max: 100, step: 1, default: 90, description: 'Higher = better quality but larger file' },
      { key: 'safety_tolerance', label: 'Safety Level', type: 'slider', min: 1, max: 5, step: 1, default: 3, description: '1=strict, 5=permissive' },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: 'Fixed seed for reproducible results' },
    ],
  },
  {
    id: 'black-forest-labs/flux-2-max',
    name: 'FLUX.2 Max',
    vendor: 'Black Forest Labs',
    vendorShort: 'BFL',
    description: 'Maximum fidelity. Up to 8 reference images. 3x faster than competitors.',
    badge: '플래그십',
    speed: 'medium',
    quality: 'highest',
    estimatedCostPerImage: 0.08,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    defaultAspectRatio: '1:1',
    tags: ['photo', 'premium', 'consistency'],
    color: 'violet',
    advancedParams: [
      { key: 'output_quality', label: 'Output Quality', type: 'slider', min: 0, max: 100, step: 1, default: 90 },
      { key: 'safety_tolerance', label: 'Safety Level', type: 'slider', min: 1, max: 5, step: 1, default: 3 },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'black-forest-labs/flux-2-flex',
    name: 'FLUX.2 Flex',
    vendor: 'Black Forest Labs',
    vendorShort: 'BFL',
    description: 'Best for typography & UI mockups. Adjustable speed/quality balance.',
    speed: 'fast',
    quality: 'high',
    estimatedCostPerImage: 0.04,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '21:9'],
    defaultAspectRatio: '1:1',
    tags: ['text', 'ui', 'flexible'],
    color: 'blue',
    advancedParams: [
      { key: 'steps', label: 'Inference Steps', type: 'slider', min: 1, max: 50, step: 1, default: 28, description: 'More steps = better quality, slower' },
      { key: 'guidance', label: 'Guidance Scale', type: 'slider', min: 1, max: 10, step: 0.5, default: 3.5 },
      { key: 'output_quality', label: 'Output Quality', type: 'slider', min: 0, max: 100, step: 1, default: 90 },
      { key: 'safety_tolerance', label: 'Safety Level', type: 'slider', min: 1, max: 5, step: 1, default: 3 },
      { key: 'prompt_upsampling', label: 'Enhance Prompt', type: 'boolean', default: false },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'bytedance/seedream-4',
    name: 'Seedream 4',
    vendor: 'ByteDance',
    vendorShort: 'ByteDance',
    description: 'Up to 4K resolution. Batch generation & natural-language editing.',
    badge: '고해상도',
    speed: 'medium',
    quality: 'high',
    estimatedCostPerImage: 0.04,
    outputType: 'array',
    supportsMultipleImages: true,
    maxImages: 4,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    defaultAspectRatio: '1:1',
    tags: ['4k', 'batch', 'editing'],
    color: 'orange',
    advancedParams: [
      { key: 'size', label: 'Resolution', type: 'select', options: ['1K', '2K', '4K'], default: '2K', description: 'Output image resolution' },
      { key: 'enhance_prompt', label: 'Enhance Prompt', type: 'boolean', default: true },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
    ],
  },
  {
    id: 'bytedance/seedream-5-lite',
    name: 'Seedream 5 Lite',
    vendor: 'ByteDance',
    vendorShort: 'ByteDance',
    description: 'Built-in reasoning for spatial & physics understanding. Up to 14 references.',
    badge: '추론형',
    speed: 'medium',
    quality: 'high',
    estimatedCostPerImage: 0.035,
    outputType: 'array',
    supportsMultipleImages: true,
    maxImages: 4,
    supportedAspectRatios: ['1:1', '4:3', '3:4', '16:9', '9:16', '3:2', '2:3', '21:9'],
    defaultAspectRatio: '1:1',
    tags: ['reasoning', 'science', 'batch'],
    color: 'amber',
    advancedParams: [
      { key: 'size', label: 'Resolution', type: 'select', options: ['2K', '3K'], default: '2K' },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
    ],
  },
  {
    id: 'openai/gpt-image-1.5',
    name: 'GPT Image 1.5',
    vendor: 'OpenAI',
    vendorShort: 'OpenAI',
    description: 'Best instruction following & text rendering. 4x faster than predecessor.',
    badge: 'GPT',
    speed: 'fast',
    quality: 'high',
    estimatedCostPerImage: 0.04,
    outputType: 'array',
    supportsMultipleImages: true,
    maxImages: 4,
    supportedAspectRatios: ['1:1', '16:9', '9:16'],
    defaultAspectRatio: '1:1',
    tags: ['text', 'editing', 'instruction'],
    color: 'green',
    advancedParams: [
      { key: 'quality', label: 'Quality', type: 'select', options: ['low', 'medium', 'high', 'auto'], default: 'auto' },
      { key: 'background', label: 'Background', type: 'select', options: ['auto', 'transparent', 'opaque'], default: 'auto' },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
      { key: 'output_compression', label: 'Compression', type: 'slider', min: 0, max: 100, step: 1, default: 80 },
    ],
  },
  {
    id: 'prunaai/z-image-turbo',
    name: 'Z-Image Turbo',
    vendor: 'PrunaAI',
    vendorShort: 'PrunaAI',
    description: 'Super fast 6B model. Sub-second generation. Bilingual (EN/ZH) text.',
    badge: '최고속',
    speed: 'turbo',
    quality: 'good',
    estimatedCostPerImage: 0.005,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    defaultAspectRatio: '1:1',
    tags: ['fast', 'cheap', 'bilingual'],
    color: 'red',
    advancedParams: [
      { key: 'num_inference_steps', label: 'Steps', type: 'slider', min: 1, max: 20, step: 1, default: 8 },
      { key: 'go_fast', label: 'Turbo Mode', type: 'boolean', default: true },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
      { key: 'output_quality', label: 'Output Quality', type: 'slider', min: 0, max: 100, step: 1, default: 80 },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'prunaai/p-image',
    name: 'P-Image',
    vendor: 'PrunaAI',
    vendorShort: 'PrunaAI',
    description: 'Sub 1-second generation. Best speed-quality-cost balance. LoRA support.',
    badge: '최저가',
    speed: 'turbo',
    quality: 'high',
    estimatedCostPerImage: 0.004,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
    defaultAspectRatio: '1:1',
    tags: ['fast', 'cheap', 'lora'],
    color: 'rose',
    advancedParams: [
      { key: 'prompt_upsampling', label: 'Enhance Prompt', type: 'boolean', default: false },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
      { key: 'lora_weights', label: 'LoRA Weights (HuggingFace URL)', type: 'text', default: '', description: 'Optional HuggingFace LoRA model URL' },
      { key: 'lora_scale', label: 'LoRA Scale', type: 'slider', min: 0, max: 1, step: 0.1, default: 0.5 },
    ],
  },
  {
    id: 'google/nano-banana-pro',
    name: 'Nano Banana Pro',
    vendor: 'Google',
    vendorShort: 'Google',
    description: 'Gemini 3 Pro powered. Real-time info via Google Search. Multilingual text.',
    badge: 'Gemini',
    speed: 'medium',
    quality: 'high',
    estimatedCostPerImage: 0.06,
    outputType: 'single',
    supportsMultipleImages: false,
    maxImages: 1,
    supportedAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
    defaultAspectRatio: '1:1',
    tags: ['multilingual', 'reasoning', 'google'],
    color: 'teal',
    advancedParams: [
      { key: 'safety_filter_level', label: 'Safety Filter', type: 'select', options: ['block_only_high', 'block_medium_and_above', 'block_low_and_above'], default: 'block_medium_and_above' },
      { key: 'allow_fallback_model', label: 'Allow Fallback', type: 'boolean', default: true, description: 'Fallback to Seedream 5 if at capacity' },
      { key: 'output_format', label: 'File Format', type: 'select', options: ['webp', 'jpg', 'png'], default: 'webp' },
    ],
  },
]

export function getModelById(id: string): ModelConfig | undefined {
  return MODELS.find(m => m.id === id)
}

export function estimateCost(modelIds: string[], imageCount: number): number {
  return modelIds.reduce((total, modelId) => {
    const model = getModelById(modelId)
    if (!model) return total
    // For native multi-image models, cost per image stays same
    // For single-image models, each image = one API call
    return total + model.estimatedCostPerImage * imageCount
  }, 0)
}

export const SPEED_LABELS: Record<SpeedRating, string> = {
  turbo: '⚡ 최고속',
  fast: '🚀 고속',
  medium: '🎯 고품질',
}

export const QUALITY_LABELS: Record<QualityRating, string> = {
  good: '보통',
  high: '고품질',
  highest: '최고품질',
}
