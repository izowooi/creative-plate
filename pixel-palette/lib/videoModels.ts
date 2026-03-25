import { AdvancedParam, SpeedRating, QualityRating, formatPrice, Currency } from './models'

export interface VideoModelConfig {
  id: string
  name: string
  vendor: string
  vendorShort: string
  description: string
  badge?: string
  speed: SpeedRating
  quality: QualityRating
  pricePerSecond: number
  supportsImageInput: boolean
  supportsLastFrame: boolean
  supportsAudio: boolean
  supportsNegativePrompt: boolean
  supportedAspectRatios: string[]
  defaultAspectRatio: string
  supportedResolutions: string[]
  defaultResolution: string
  supportedDurations: number[]
  defaultDuration: number
  tags: string[]
  color: string
  advancedParams: AdvancedParam[]
  flags?: string[]
}

export const VIDEO_ASPECT_RATIOS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

export const VIDEO_MODELS: VideoModelConfig[] = [
  {
    id: 'bytedance/seedance-1-pro-fast',
    name: 'Seedance Pro Fast',
    vendor: 'ByteDance',
    vendorShort: 'ByteDance',
    description: '30~60% 빠른 추론, ~60% 저렴한 비용. 텍스트/이미지 to 비디오 지원.',
    badge: '최고속',
    flags: ['🇨🇳'],
    speed: 'fast',
    quality: 'high',
    pricePerSecond: 0.04,
    supportsImageInput: true,
    supportsLastFrame: false,
    supportsAudio: false,
    supportsNegativePrompt: false,
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    supportedResolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    supportedDurations: [5, 10],
    defaultDuration: 5,
    tags: ['fast', 'cheap', 'i2v'],
    color: 'amber',
    advancedParams: [
      { key: 'fps', label: 'FPS', type: 'slider', min: 12, max: 30, step: 6, default: 24 },
      { key: 'camera_fixed', label: '카메라 고정', type: 'boolean', default: false, description: '카메라를 고정 위치에 유지합니다' },
      { key: 'seed', label: 'Seed', type: 'number', default: null, description: '재현 가능한 결과를 위한 고정 시드' },
    ],
  },
  {
    id: 'google/veo-3-fast',
    name: 'Veo 3 Fast',
    vendor: 'Google',
    vendorShort: 'Google',
    description: 'Google Veo 3의 빠르고 저렴한 버전. 오디오 자동 생성 포함.',
    badge: '오디오',
    flags: ['🇺🇸'],
    speed: 'fast',
    quality: 'high',
    pricePerSecond: 0.05,
    supportsImageInput: true,
    supportsLastFrame: false,
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    supportedResolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    supportedDurations: [5, 8],
    defaultDuration: 5,
    tags: ['audio', 'google', 'i2v'],
    color: 'teal',
    advancedParams: [
      { key: 'generate_audio', label: '오디오 생성', type: 'boolean', default: true, description: '영상과 함께 오디오를 자동 생성합니다' },
      { key: 'negative_prompt', label: '네거티브 프롬프트', type: 'text', default: '', description: '영상에서 제외할 요소를 설명하세요' },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'xai/grok-imagine-video',
    name: 'Grok Video',
    vendor: 'xAI',
    vendorShort: 'xAI',
    description: '오디오 자동 생성. 텍스트/이미지 to 비디오. 1~15초 자유 설정.',
    badge: '오디오',
    flags: ['🇺🇸'],
    speed: 'medium',
    quality: 'high',
    pricePerSecond: 0.06,
    supportsImageInput: true,
    supportsLastFrame: false,
    supportsAudio: true,
    supportsNegativePrompt: false,
    supportedAspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'],
    defaultAspectRatio: '16:9',
    supportedResolutions: ['480p', '720p'],
    defaultResolution: '720p',
    supportedDurations: [5, 8, 10, 15],
    defaultDuration: 5,
    tags: ['audio', 'flexible', 'i2v'],
    color: 'violet',
    advancedParams: [
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'kwaivgi/kling-v2.5-turbo-pro',
    name: 'Kling 2.5 Turbo',
    vendor: 'KwaiVGI',
    vendorShort: 'Kwai',
    description: '부드러운 모션, 시네마틱 깊이감. 시작/끝 프레임 설정 가능.',
    badge: '시작/끝',
    flags: ['🇨🇳'],
    speed: 'fast',
    quality: 'high',
    pricePerSecond: 0.07,
    supportsImageInput: true,
    supportsLastFrame: true,
    supportsAudio: false,
    supportsNegativePrompt: true,
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    defaultAspectRatio: '16:9',
    supportedResolutions: [],
    defaultResolution: '',
    supportedDurations: [5, 10],
    defaultDuration: 5,
    tags: ['cinematic', 'last-frame', 'i2v'],
    color: 'rose',
    advancedParams: [
      { key: 'negative_prompt', label: '네거티브 프롬프트', type: 'text', default: '', description: '영상에서 제외할 요소를 설명하세요' },
    ],
  },
  {
    id: 'google/veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    vendor: 'Google',
    vendorShort: 'Google',
    description: 'Veo 3 Fast 개선판. 고화질 + 오디오 + 마지막 프레임 보간 지원.',
    badge: '최신',
    flags: ['🇺🇸'],
    speed: 'fast',
    quality: 'highest',
    pricePerSecond: 0.05,
    supportsImageInput: true,
    supportsLastFrame: true,
    supportsAudio: true,
    supportsNegativePrompt: true,
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    supportedResolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    supportedDurations: [4, 6, 8],
    defaultDuration: 8,
    tags: ['audio', 'last-frame', 'google', 'i2v'],
    color: 'blue',
    advancedParams: [
      { key: 'generate_audio', label: '오디오 생성', type: 'boolean', default: true, description: '영상과 함께 오디오를 자동 생성합니다' },
      { key: 'negative_prompt', label: '네거티브 프롬프트', type: 'text', default: '', description: '영상에서 제외할 요소를 설명하세요' },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
  {
    id: 'bytedance/seedance-1-pro',
    name: 'Seedance Pro',
    vendor: 'ByteDance',
    vendorShort: 'ByteDance',
    description: '최고 품질. 멀티샷 내러티브, 1080p. 텍스트/이미지 to 비디오.',
    badge: '최고품질',
    flags: ['🇨🇳'],
    speed: 'medium',
    quality: 'highest',
    pricePerSecond: 0.09,
    supportsImageInput: true,
    supportsLastFrame: true,
    supportsAudio: false,
    supportsNegativePrompt: false,
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    supportedResolutions: ['480p', '1080p'],
    defaultResolution: '1080p',
    supportedDurations: [5, 10],
    defaultDuration: 5,
    tags: ['quality', 'multishot', 'i2v'],
    color: 'orange',
    advancedParams: [
      { key: 'fps', label: 'FPS', type: 'slider', min: 12, max: 30, step: 6, default: 24 },
      { key: 'camera_fixed', label: '카메라 고정', type: 'boolean', default: false },
      { key: 'seed', label: 'Seed', type: 'number', default: null },
    ],
  },
]

export function getVideoModelById(id: string): VideoModelConfig | undefined {
  return VIDEO_MODELS.find(m => m.id === id)
}

export function estimateVideoCost(modelIds: string[], videoCount: number, duration: number): number {
  return modelIds.reduce((total, modelId) => {
    const model = getVideoModelById(modelId)
    if (!model) return total
    return total + model.pricePerSecond * duration * videoCount
  }, 0)
}

export { formatPrice }
export type { Currency }
