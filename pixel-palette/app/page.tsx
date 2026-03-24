'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import PasswordGate from '@/components/PasswordGate'
import ThemeToggle from '@/components/ThemeToggle'
import ModelSelector from '@/components/ModelSelector'
import AdvancedSettings from '@/components/AdvancedSettings'
import LoadingMessages from '@/components/LoadingMessages'
import ImageGrid, { GeneratedImage } from '@/components/ImageGrid'
import { MODELS, ASPECT_RATIOS, getModelById, estimateCost, formatPrice, Currency } from '@/lib/models'

type Mode = 'single' | 'compare'

interface Prediction {
  id: string
  index: number
  modelId: string
  status: 'starting' | 'processing' | 'succeeded' | 'failed'
  output?: string | string[]
  error?: string
}

const ASPECT_RATIO_ICONS: Record<string, string> = {
  '1:1': '⬛',
  '16:9': '▬',
  '9:16': '▮',
  '4:3': '▭',
  '3:4': '▯',
  '3:2': '▬',
  '2:3': '▯',
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false)
  const [mode, setMode] = useState<Mode>('single')
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(['prunaai/p-image'])
  const [prompt, setPrompt] = useState('')
  const [imageCount, setImageCount] = useState(2)
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [advancedParams, setAdvancedParams] = useState<Record<string, Record<string, unknown>>>({})
  const [parallelMode, setParallelMode] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const [currency, setCurrency] = useState<Currency>('USD')

  useEffect(() => {
    const stored = localStorage.getItem('currency') as Currency | null
    if (stored === 'USD' || stored === 'KRW') setCurrency(stored)
  }, [])

  function toggleCurrency() {
    const next: Currency = currency === 'USD' ? 'KRW' : 'USD'
    setCurrency(next)
    localStorage.setItem('currency', next)
  }

  const handleAuth = useCallback(() => setAuthenticated(true), [])

  // Computed values
  const effectiveModels = mode === 'single' ? selectedModelIds.slice(0, 1) : selectedModelIds
  const selectedModel = mode === 'single' ? getModelById(selectedModelIds[0]) : null
  const nativeMultiModels = ['bytedance/seedream-4', 'bytedance/seedream-5-lite', 'openai/gpt-image-1.5']
  const effectiveCount = mode === 'compare'
    ? effectiveModels.length
    : imageCount
  const estimatedCost = estimateCost(
    effectiveModels,
    mode === 'compare' ? 1 : imageCount
  )
  const completedCount = predictions.filter(p => p.status === 'succeeded' || p.status === 'failed').length

  // Get supported aspect ratios for current model selection
  const supportedRatios = mode === 'single' && selectedModel
    ? ASPECT_RATIOS.filter(r => selectedModel.supportedAspectRatios.includes(r.value))
    : ASPECT_RATIOS

  // Determine if mode should show image count selector
  const showImageCount = mode === 'single' && (
    !selectedModel || selectedModel.supportsMultipleImages || true
  )

  async function generate() {
    if (!prompt.trim() || generating || effectiveModels.length === 0) return

    setGenerating(true)
    setError(null)
    setImages([])
    setPredictions([])
    setStartTime(Date.now())
    setEndTime(null)

    try {
      // Create all predictions
      const allPredictions: Prediction[] = []

      if (mode === 'single') {
        const modelId = effectiveModels[0]
        const model = getModelById(modelId)!
        const count = model.supportsMultipleImages ? imageCount : Math.min(imageCount, 4)
        const isNativeMulti = nativeMultiModels.includes(modelId)

        if (isNativeMulti) {
          // Single API call
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId,
              prompt: prompt.trim(),
              aspectRatio,
              imageCount: count,
              advancedParams: advancedParams[modelId] || {},
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Generation failed')
          data.predictions.forEach((p: { id: string; index: number }) => {
            allPredictions.push({ id: p.id, index: p.index, modelId, status: 'starting' })
          })
        } else {
          const makeOnePrediction = async (i: number) => {
            const baseSeed = advancedParams[modelId]?.seed
            const seed = baseSeed ? Number(baseSeed) + i : undefined
            const params = seed !== undefined
              ? { ...(advancedParams[modelId] || {}), seed }
              : (advancedParams[modelId] || {})
            const res = await fetch('/api/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ modelId, prompt: prompt.trim(), aspectRatio, imageCount: 1, advancedParams: params }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Generation failed')
            return { id: data.predictions[0].id, index: i, modelId, status: 'starting' as const }
          }

          if (parallelMode) {
            // Fire all simultaneously
            const results = await Promise.all(
              Array.from({ length: count }, (_, i) => makeOnePrediction(i))
            )
            allPredictions.push(...results)
          } else {
            // Sequential with 11s gap (burst=1 rate limit)
            for (let i = 0; i < count; i++) {
              if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 11000))
              }
              const pred = await makeOnePrediction(i)
              allPredictions.push(pred)
              // Update UI immediately so loading screen shows after first prediction
              setPredictions([...allPredictions])
            }
          }
        }
      } else {
        // Compare mode: one image per model
        for (const modelId of effectiveModels) {
          const res = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              modelId,
              prompt: prompt.trim(),
              aspectRatio,
              imageCount: 1,
              advancedParams: advancedParams[modelId] || {},
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Generation failed')
          data.predictions.forEach((p: { id: string; index: number }) => {
            allPredictions.push({ id: p.id, index: p.index, modelId, status: 'starting' })
          })
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
      const current = [...preds]
      let allDone = true

      const updated = await Promise.all(
        current.map(async (pred) => {
          if (pred.status === 'succeeded' || pred.status === 'failed') {
            return pred
          }

          try {
            const res = await fetch(`/api/status/${pred.id}`)
            const data = await res.json()
            return { ...pred, status: data.status, output: data.output, error: data.error }
          } catch {
            return pred
          }
        })
      )

      // Check if all done
      allDone = updated.every(p => p.status === 'succeeded' || p.status === 'failed')

      setPredictions(updated)

      // Extract completed images
      const newImages: GeneratedImage[] = []
      updated.forEach((pred) => {
        if (pred.status === 'succeeded' && pred.output) {
          const model = getModelById(pred.modelId)
          const modelName = model?.name || pred.modelId

          if (Array.isArray(pred.output)) {
            pred.output.forEach((url, i) => {
              if (url) {
                newImages.push({ url, modelId: pred.modelId, modelName, index: pred.index * 10 + i })
              }
            })
          } else if (typeof pred.output === 'string') {
            newImages.push({ url: pred.output, modelId: pred.modelId, modelName, index: pred.index })
          }
        }
      })

      setImages(newImages)
      preds = updated

      if (!allDone) {
        pollingRef.current = setTimeout(() => poll(), 2000)
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

  const generatingModelNames = [...new Set(predictions.map(p => {
    return getModelById(p.modelId)?.name || p.modelId
  }))]

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
            <span className="hidden sm:inline text-xs text-secondary bg-surface px-2 py-0.5 rounded-full border border-app">
              AI Studio
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* Future: Video tab placeholder */}
            <div className="hidden sm:flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
              <button className="px-3 py-1 rounded-lg text-xs font-medium bg-primary-600 text-white">
                Images
              </button>
              <button className="px-3 py-1 rounded-lg text-xs font-medium text-secondary cursor-not-allowed opacity-50" title="Coming soon">
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

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Mode selector */}
        <div className="flex items-center gap-3">
          <div className="flex bg-surface rounded-xl p-1 border border-app gap-1">
            <ModeButton
              active={mode === 'single'}
              onClick={() => {
                setMode('single')
                setSelectedModelIds([selectedModelIds[0] || 'prunaai/p-image'])
                setImages([])
              }}
              label="단일 모델"
              sub="여러 이미지"
              icon="🖼️"
            />
            <ModeButton
              active={mode === 'compare'}
              onClick={() => {
                setMode('compare')
                setImages([])
              }}
              label="모델 비교"
              sub="같은 프롬프트"
              icon="⚖️"
            />
          </div>
          <p className="hidden sm:block text-xs text-secondary">
            {mode === 'single'
              ? '하나의 모델로 1~4장을 생성합니다'
              : '여러 모델에 동일한 프롬프트를 보내 비교합니다'
            }
          </p>
        </div>

        {/* Model selector */}
        <ModelSelector
          mode={mode}
          selectedIds={selectedModelIds}
          currency={currency}
          onChange={ids => {
            setSelectedModelIds(ids)
            setImages([])
          }}
        />

        {/* Prompt area */}
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="무엇을 만들고 싶으세요? 영어로 입력하면 더 좋은 결과가 나와요 :)"
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

            {/* Image count (single mode only) */}
            {mode === 'single' && (
              <div className="flex items-center gap-1 bg-surface rounded-xl p-1 border border-app">
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setImageCount(n)}
                    className={`
                      w-8 h-7 rounded-lg text-xs font-medium transition-all duration-150
                      ${imageCount === n
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-secondary hover:text-app hover:bg-surface-2'
                      }
                    `}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-secondary px-1">장</span>
              </div>
            )}

            {/* Parallel/sequential toggle (single mode, non-native multi only) */}
            {mode === 'single' && selectedModel && !nativeMultiModels.includes(selectedModel.id) && imageCount > 1 && (
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
        <AdvancedSettings
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
              <span>✨</span>
              {mode === 'single'
                ? `${imageCount}장 생성하기`
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
          <div className="bg-surface rounded-2xl border border-app animate-fade-in">
            <LoadingMessages
              modelNames={generatingModelNames}
              completed={completedCount}
              total={predictions.length}
            />
          </div>
        )}

        {/* Results */}
        {images.length > 0 && (
          <ImageGrid
            images={images}
            totalCost={estimatedCost}
            generationTime={endTime && startTime ? endTime - startTime : undefined}
            currency={currency}
          />
        )}

        {/* Empty state */}
        {!generating && images.length === 0 && !error && (
          <div className="text-center py-16 text-secondary opacity-50">
            <div className="text-4xl mb-3">🖼️</div>
            <p className="text-sm">프롬프트를 입력하고 생성 버튼을 눌러주세요</p>
          </div>
        )}
      </main>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  label,
  sub,
  icon,
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
