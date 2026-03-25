'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import PasswordGate from '@/components/PasswordGate'
import ThemeToggle from '@/components/ThemeToggle'
import VideoModelSelector from '@/components/VideoModelSelector'
import VideoAdvancedSettings from '@/components/VideoAdvancedSettings'
import LoadingMessages from '@/components/LoadingMessages'
import VideoGrid, { GeneratedVideo } from '@/components/VideoGrid'
import { VIDEO_MODELS, VIDEO_ASPECT_RATIOS, getVideoModelById, estimateVideoCost, formatPrice, Currency } from '@/lib/videoModels'

type Mode = 'single' | 'compare'

interface Prediction {
  id: string
  index: number
  modelId: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed'
  output?: string
  error?: string
}

export default function VideoPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(['bytedance/seedance-1-pro-fast'])
  const [prompt, setPrompt] = useState('')
  const [videoCount, setVideoCount] = useState(1)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState('720p')
  const [imageUrl, setImageUrl] = useState('')
  const [lastFrameUrl, setLastFrameUrl] = useState('')
  const [imageUploadState, setImageUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [lastFrameUploadState, setLastFrameUploadState] = useState<'idle' | 'uploading' | 'error'>('idle')
  const imageFileRef = useRef<HTMLInputElement>(null)
  const lastFrameFileRef = useRef<HTMLInputElement>(null)
  const [advancedParams, setAdvancedParams] = useState<Record<string, Record<string, unknown>>>({})
  const [parallelMode, setParallelMode] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const loadingRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [currency, setCurrency] = useState<Currency>('USD')

  useEffect(() => {
    const stored = localStorage.getItem('currency') as Currency | null
    if (stored === 'USD' || stored === 'KRW') setCurrency(stored)
  }, [])

  // Auto-scroll to loading when first prediction appears
  useEffect(() => {
    if (generating && predictions.length === 1) {
      loadingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [generating, predictions.length])

  // Auto-scroll to results when done
  useEffect(() => {
    if (videos.length > 0 && endTime) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [videos.length, endTime])

  function toggleCurrency() {
    const next: Currency = currency === 'USD' ? 'KRW' : 'USD'
    setCurrency(next)
    localStorage.setItem('currency', next)
  }

  const handleAuth = useCallback(() => setAuthenticated(true), [])

  // Computed values
  const effectiveModels = mode === 'single' ? selectedModelIds.slice(0, 1) : selectedModelIds
  const selectedModel = mode === 'single' ? getVideoModelById(selectedModelIds[0]) : null
  const estimatedCost = estimateVideoCost(effectiveModels, mode === 'compare' ? 1 : videoCount, duration)
  const completedCount = predictions.filter(p => p.status === 'succeeded' || p.status === 'failed').length

  const showParallelToggle =
    (mode === 'single' && videoCount > 1) ||
    (mode === 'compare' && effectiveModels.length > 1)

  // Filter aspect ratios by selected model (single mode)
  const supportedRatios = mode === 'single' && selectedModel
    ? VIDEO_ASPECT_RATIOS.filter(r => selectedModel.supportedAspectRatios.includes(r.value))
    : VIDEO_ASPECT_RATIOS

  // Filter durations by selected model (single mode)
  const supportedDurations = mode === 'single' && selectedModel
    ? selectedModel.supportedDurations
    : [5, 8, 10]

  // Filter resolutions by selected model (single mode)
  const supportedResolutions = mode === 'single' && selectedModel
    ? selectedModel.supportedResolutions
    : ['480p', '720p', '1080p']

  const showResolution = supportedResolutions.length > 0

  // Whether to show image input (any selected model supports I2V)
  const showImageInput = mode === 'single'
    ? (selectedModel?.supportsImageInput ?? false)
    : effectiveModels.some(id => getVideoModelById(id)?.supportsImageInput)

  // Whether to show last frame input
  const showLastFrame = mode === 'single'
    ? (selectedModel?.supportsLastFrame ?? false)
    : effectiveModels.some(id => getVideoModelById(id)?.supportsLastFrame)

  const generatingModelNames = [...new Set(predictions.map(p =>
    getVideoModelById(p.modelId)?.name || p.modelId
  ))]

  async function uploadImage(file: File, target: 'image' | 'lastFrame') {
    const setState = target === 'image' ? setImageUploadState : setLastFrameUploadState
    const setUrl = target === 'image' ? setImageUrl : setLastFrameUrl
    setState('uploading')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setUrl(data.url)
      setState('idle')
    } catch {
      setState('error')
    }
  }

  async function makeOnePrediction(modelId: string, index: number): Promise<Prediction> {
    const res = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelId,
        prompt: prompt.trim(),
        aspectRatio,
        resolution,
        duration,
        advancedParams: advancedParams[modelId] || {},
        imageUrl: imageUrl.trim() || undefined,
        lastFrameUrl: lastFrameUrl.trim() || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Generation failed')
    return { id: data.predictions[0].id, index, modelId, status: 'starting' }
  }

  async function generate() {
    if (!prompt.trim() || generating || effectiveModels.length === 0) return

    setGenerating(true)
    setError(null)
    setVideos([])
    setPredictions([])
    setStartTime(Date.now())
    setEndTime(null)

    try {
      const allPredictions: Prediction[] = []

      if (mode === 'single') {
        const modelId = effectiveModels[0]
        const count = videoCount

        if (parallelMode) {
          const results = await Promise.all(
            Array.from({ length: count }, (_, i) => makeOnePrediction(modelId, i))
          )
          allPredictions.push(...results)
        } else {
          for (let i = 0; i < count; i++) {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 11000))
            }
            const pred = await makeOnePrediction(modelId, i)
            allPredictions.push(pred)
            setPredictions([...allPredictions])
          }
        }
      } else {
        // Compare mode: one video per model
        if (parallelMode) {
          const results = await Promise.all(
            effectiveModels.map((modelId, i) => makeOnePrediction(modelId, i))
          )
          allPredictions.push(...results)
        } else {
          for (let i = 0; i < effectiveModels.length; i++) {
            if (i > 0) {
              await new Promise(resolve => setTimeout(resolve, 11000))
            }
            const pred = await makeOnePrediction(effectiveModels[i], i)
            allPredictions.push(pred)
            setPredictions([...allPredictions])
          }
        }
      }

      setPredictions(allPredictions)
      startPolling(allPredictions)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(msg)
      setGenerating(false)
    }
  }

  function startPolling(preds: Prediction[]) {
    const poll = async () => {
      let current = [...preds]

      const updated = await Promise.all(
        current.map(async (pred) => {
          if (pred.status === 'succeeded' || pred.status === 'failed') return pred
          try {
            const res = await fetch(`/api/status/${pred.id}`)
            const data = await res.json()
            return { ...pred, status: data.status, output: data.output, error: data.error }
          } catch {
            return pred
          }
        })
      )

      const allDone = updated.every(p => p.status === 'succeeded' || p.status === 'failed')
      setPredictions(updated)

      const newVideos: GeneratedVideo[] = []
      updated.forEach((pred) => {
        if (pred.status === 'succeeded' && pred.output && typeof pred.output === 'string') {
          const model = getVideoModelById(pred.modelId)
          newVideos.push({
            url: pred.output,
            modelId: pred.modelId,
            modelName: model?.name || pred.modelId,
            index: pred.index,
          })
        }
      })
      setVideos(newVideos)
      current = updated

      if (!allDone) {
        pollingRef.current = setTimeout(() => poll(), 3000)
      } else {
        setGenerating(false)
        setEndTime(Date.now())
      }
    }

    poll()
  }

  function cancelGeneration() {
    if (pollingRef.current) clearTimeout(pollingRef.current)
    setGenerating(false)
  }

  if (!authenticated) {
    return <PasswordGate onAuth={handleAuth} />
  }

  return (
    <div className="min-h-screen bg-app">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-app">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl select-none">🎨</span>
            <span className="font-bold text-app tracking-tight">Pixel Palette</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
              <Link
                href="/"
                className="px-3 py-1 rounded-lg text-xs font-medium text-secondary hover:text-app hover:bg-surface-2 transition-colors"
              >
                Images
              </Link>
              <button className="px-3 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white">
                Video
              </button>
            </div>
            <button
              onClick={toggleCurrency}
              title={currency === 'USD' ? '원화로 전환' : '달러로 전환'}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-secondary hover:text-app hover:bg-surface-2 transition-colors duration-150"
            >
              {currency === 'USD' ? '₩' : '$'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* 모바일 전용 이미지/동영상 탭바 */}
      <div className="sm:hidden sticky top-14 z-30 glass border-b border-app">
        <div className="flex items-center gap-1 px-4 py-2">
          <Link href="/" className="flex-1 py-1.5 rounded-lg text-xs font-medium text-secondary hover:text-app hover:bg-surface-2 transition-colors text-center">
            Images
          </Link>
          <button className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-primary-600 text-white text-center">
            Video
          </button>
        </div>
      </div>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Mode selector */}
        <div className="flex items-center gap-3">
          <div className="flex bg-surface rounded-xl p-1 border border-app gap-1">
            <ModeButton
              active={mode === 'single'}
              onClick={() => {
                setMode('single')
                setSelectedModelIds([selectedModelIds[0] || 'bytedance/seedance-1-pro-fast'])
                setVideos([])
              }}
              label="단일 모델"
              sub="여러 영상"
              icon="🎬"
            />
            <ModeButton
              active={mode === 'compare'}
              onClick={() => {
                setMode('compare')
                setVideos([])
              }}
              label="모델 비교"
              sub="같은 프롬프트"
              icon="⚖️"
            />
          </div>
          <p className="hidden sm:block text-xs text-secondary">
            {mode === 'single'
              ? '하나의 모델로 1~4개의 영상을 생성합니다'
              : '여러 모델에 동일한 프롬프트를 보내 비교합니다'
            }
          </p>
        </div>

        {/* Model selector */}
        <VideoModelSelector
          mode={mode}
          selectedIds={selectedModelIds}
          currency={currency}
          currentDuration={duration}
          onChange={ids => {
            setSelectedModelIds(ids)
            setVideos([])
            // Reset duration/resolution to first selected model's defaults
            const first = getVideoModelById(ids[0])
            if (first) {
              setDuration(first.defaultDuration)
              setResolution(first.defaultResolution)
              setAspectRatio(first.defaultAspectRatio)
            }
          }}
        />

        {/* Image input (I2V) */}
        {showImageInput && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
              이미지 입력 <span className="font-normal normal-case opacity-60">(선택사항 — 이미지를 영상으로 변환)</span>
            </label>
            {/* Start frame */}
            <div className="flex gap-2">
              <input type="file" accept="image/*" ref={imageFileRef} className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'image') }} />
              <button
                onClick={() => imageFileRef.current?.click()}
                disabled={imageUploadState === 'uploading'}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-app bg-surface text-secondary text-sm hover:border-primary-400 hover:text-app transition-all duration-150 flex-shrink-0 disabled:opacity-60"
                title="파일 업로드"
              >
                {imageUploadState === 'uploading' ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                )}
                파일
              </button>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="이미지 URL 붙여넣기 (https://...)"
                className="
                  flex-1 px-4 py-2.5 rounded-xl border border-app bg-surface text-app text-sm
                  placeholder:text-secondary
                  focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
                  transition-all duration-200
                "
              />
            </div>
            {imageUploadState === 'error' && (
              <p className="text-xs text-red-500">업로드 실패. 다시 시도하거나 URL을 직접 입력하세요.</p>
            )}
            {/* Last frame */}
            {showLastFrame && (
              <div className="flex gap-2">
                <input type="file" accept="image/*" ref={lastFrameFileRef} className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, 'lastFrame') }} />
                <button
                  onClick={() => lastFrameFileRef.current?.click()}
                  disabled={lastFrameUploadState === 'uploading'}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-app bg-surface text-secondary text-sm hover:border-primary-400 hover:text-app transition-all duration-150 flex-shrink-0 disabled:opacity-60"
                  title="마지막 프레임 파일 업로드"
                >
                  {lastFrameUploadState === 'uploading' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                  )}
                  파일
                </button>
                <input
                  type="url"
                  value={lastFrameUrl}
                  onChange={e => setLastFrameUrl(e.target.value)}
                  placeholder="마지막 프레임 URL (선택사항 — 시작/끝 프레임 보간)"
                  className="
                    flex-1 px-4 py-2.5 rounded-xl border border-app bg-surface text-app text-sm
                    placeholder:text-secondary
                    focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
                    transition-all duration-200
                  "
                />
              </div>
            )}
            {lastFrameUploadState === 'error' && (
              <p className="text-xs text-red-500">마지막 프레임 업로드 실패. 다시 시도하거나 URL을 직접 입력하세요.</p>
            )}
          </div>
        )}

        {/* Prompt area */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="어떤 영상을 만들고 싶으세요? 카메라 앵글, 조명, 움직임을 구체적으로 설명하면 더 좋아요 :)"
              rows={3}
              className="
                w-full px-4 py-3.5 rounded-xl border border-app bg-surface text-app
                placeholder:text-secondary resize-none
                focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20
                transition-all duration-200 text-sm leading-relaxed
              "
            />
            <div className="absolute bottom-3 right-3 text-xs text-secondary opacity-50">
              {prompt.length}/2000
            </div>
          </div>

          {/* Quick settings row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Aspect ratio */}
            <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-app flex-wrap">
              {supportedRatios.map(r => (
                <button
                  key={r.value}
                  onClick={() => setAspectRatio(r.value)}
                  className={`
                    px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150
                    ${aspectRatio === r.value
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-secondary hover:text-app hover:bg-surface-2'
                    }
                  `}
                >
                  {r.value}
                </button>
              ))}
            </div>

            {/* Duration */}
            <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
              {supportedDurations.map(d => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`
                    px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150
                    ${duration === d
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-secondary hover:text-app hover:bg-surface-2'
                    }
                  `}
                >
                  {d}s
                </button>
              ))}
            </div>

            {/* Resolution */}
            {showResolution && supportedResolutions.length > 1 && (
              <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
                {supportedResolutions.map(r => (
                  <button
                    key={r}
                    onClick={() => setResolution(r)}
                    className={`
                      px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-150
                      ${resolution === r
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-secondary hover:text-app hover:bg-surface-2'
                      }
                    `}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}

            {/* Video count (single mode only) */}
            {mode === 'single' && (
              <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setVideoCount(n)}
                    className={`
                      w-8 h-7 rounded-lg text-xs font-medium transition-all duration-150
                      ${videoCount === n
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-secondary hover:text-app hover:bg-surface-2'
                      }
                    `}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-secondary px-1">개</span>
              </div>
            )}

            {/* Parallel/sequential toggle */}
            {showParallelToggle && (
              <button
                onClick={() => setParallelMode(p => !p)}
                title={parallelMode ? '병렬 요청 (rate limit 주의)' : '순차 요청 (안전)'}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all duration-150
                  ${parallelMode
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400'
                    : 'bg-surface border-app text-secondary hover:text-app hover:bg-surface-2'
                  }
                `}
              >
                <span>{parallelMode ? '⚡ 병렬' : '↓ 순차'}</span>
              </button>
            )}

            {/* Cost estimate */}
            <div className="ml-auto flex items-center gap-1 text-xs text-secondary">
              <span className="opacity-70">예상 비용</span>
              <span className="font-mono font-semibold text-primary-500">
                ~{formatPrice(estimatedCost, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Advanced settings */}
        <VideoAdvancedSettings
          modelIds={effectiveModels}
          params={advancedParams}
          onChange={setAdvancedParams}
        />

        {/* Generate button */}
        <button
          onClick={generating ? cancelGeneration : generate}
          disabled={!prompt.trim() || effectiveModels.length === 0}
          className={`
            w-full py-4 rounded-xl font-semibold text-base transition-all duration-200
            active:scale-[0.99] shadow-sm
            ${generating
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : !prompt.trim() || effectiveModels.length === 0
                ? 'bg-surface-2 text-secondary cursor-not-allowed border border-app'
                : 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-600/20 hover:shadow-lg hover:shadow-primary-600/25'
            }
          `}
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              생성 취소
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>🎬</span>
              {mode === 'single'
                ? `${videoCount}개 영상 생성하기`
                : `${effectiveModels.length}개 모델로 비교하기`
              }
            </span>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm animate-fade-in">
            <span className="font-medium">오류 발생: </span>{error}
          </div>
        )}

        {/* Loading state */}
        {generating && predictions.length > 0 && (
          <div ref={loadingRef} className="bg-surface rounded-2xl border border-app animate-fade-in">
            <LoadingMessages
              modelNames={generatingModelNames}
              completed={completedCount}
              total={predictions.length}
            />
            <p className="text-center text-xs text-secondary opacity-50 pb-4">
              영상 생성은 보통 1~3분 정도 소요됩니다
            </p>
          </div>
        )}

        {/* Results */}
        {videos.length > 0 && (
          <div ref={resultsRef}>
            <VideoGrid
              videos={videos}
              totalCost={estimatedCost}
              generationTime={endTime && startTime ? endTime - startTime : undefined}
              currency={currency}
            />
          </div>
        )}

        {/* Empty state */}
        {!generating && videos.length === 0 && !error && (
          <div className="text-center py-16 text-secondary opacity-50">
            <div className="text-4xl mb-3">🎬</div>
            <p className="text-sm">프롬프트를 입력하고 생성 버튼을 눌러주세요</p>
          </div>
        )}
      </main>

      <footer className="border-t border-app mt-8 py-6 text-center px-4">
        <p className="text-xs text-secondary">
          생성된 이미지는 서버에 저장되지 않습니다. 개인정보를 소중히 여기며, 누구나 편하게 이미지를 만들 수 있도록 설계되었습니다.
        </p>
      </footer>
    </div>
  )
}

function ModeButton({
  active, onClick, label, sub, icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  sub: string
  icon: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-150 text-left
        ${active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-secondary hover:text-app hover:bg-surface-2'
        }
      `}
    >
      <span className="text-base">{icon}</span>
      <div>
        <div className="text-xs font-semibold leading-tight">{label}</div>
        <div className={`text-[10px] leading-tight ${active ? 'text-primary-200' : 'opacity-60'}`}>{sub}</div>
      </div>
    </button>
  )
}
