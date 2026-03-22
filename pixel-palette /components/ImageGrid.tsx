'use client'

import { useState } from 'react'
import { formatPrice, Currency } from '@/lib/models'

export interface GeneratedImage {
  url: string
  modelId: string
  modelName: string
  index: number
}

interface Props {
  images: GeneratedImage[]
  totalCost?: number
  generationTime?: number
  currency: Currency
}

export default function ImageGrid({ images, totalCost, generationTime, currency }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  async function downloadImage(url: string, filename: string) {
    setDownloading(url)
    try {
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}`
      const response = await fetch(proxyUrl)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      // Fallback: direct download
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.target = '_blank'
      a.click()
    } finally {
      setDownloading(null)
    }
  }

  async function downloadAll() {
    setDownloadingAll(true)
    for (let i = 0; i < images.length; i++) {
      const img = images[i]
      const ext = img.url.split('.').pop()?.split('?')[0] || 'webp'
      await downloadImage(
        img.url,
        `pixel-palette-${img.modelName.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.${ext}`
      )
      if (i < images.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setDownloadingAll(false)
  }

  if (images.length === 0) return null

  const gridCols =
    images.length === 1 ? 'grid-cols-1 max-w-lg mx-auto' :
    images.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    images.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
    'grid-cols-2 sm:grid-cols-2 lg:grid-cols-4'

  return (
    <div className="animate-slide-up">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-app text-sm">
            {images.length}장 생성 완료 🎉
          </h3>
          <div className="flex items-center gap-3 mt-0.5">
            {totalCost !== undefined && (
              <span className="text-xs text-secondary">
                예상 비용: <span className="font-mono font-semibold text-primary-500">~{formatPrice(totalCost, currency)}</span>
              </span>
            )}
            {generationTime !== undefined && (
              <span className="text-xs text-secondary">
                {(generationTime / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </div>

        {images.length > 1 && (
          <button
            onClick={downloadAll}
            disabled={downloadingAll}
            className="
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-primary-600 text-white hover:bg-primary-700
              disabled:opacity-60 transition-all duration-150 active:scale-95
            "
          >
            {downloadingAll ? (
              <>
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                다운로드 중...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                전체 다운로드
              </>
            )}
          </button>
        )}
      </div>

      {/* Image grid */}
      <div className={`grid ${gridCols} gap-3`}>
        {images.map((img, i) => (
          <ImageCard
            key={`${img.url}-${i}`}
            img={img}
            isDownloading={downloading === img.url}
            onDownload={() => {
              const ext = img.url.split('.').pop()?.split('?')[0] || 'webp'
              downloadImage(img.url, `pixel-palette-${img.modelName.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.${ext}`)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function ImageCard({
  img,
  isDownloading,
  onDownload,
}: {
  img: GeneratedImage
  isDownloading: boolean
  onDownload: () => void
}) {
  const [loaded, setLoaded] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <div className="image-card relative rounded-xl overflow-hidden bg-surface group border border-app">
        {/* Loading shimmer */}
        {!loaded && <div className="absolute inset-0 shimmer" />}

        {/* Image */}
        <img
          src={img.url}
          alt={`Generated image by ${img.modelName}`}
          className={`w-full h-auto object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onClick={() => setExpanded(true)}
          style={{ cursor: 'zoom-in' }}
        />

        {/* Overlay on hover */}
        <div className="image-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex flex-col justify-end p-3">
          <div className="flex items-center justify-between">
            <span className="text-white text-xs font-medium bg-black/40 px-2 py-0.5 rounded-full">
              {img.modelName}
            </span>
            <div className="flex gap-1.5">
              {/* Expand button */}
              <button
                onClick={e => { e.stopPropagation(); setExpanded(true) }}
                className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center transition-colors"
                title="크게 보기"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
              {/* Download button */}
              <button
                onClick={e => { e.stopPropagation(); onDownload() }}
                disabled={isDownloading}
                className="w-7 h-7 rounded-lg bg-white/20 backdrop-blur-sm hover:bg-white/30 flex items-center justify-center transition-colors disabled:opacity-60"
                title="다운로드"
              >
                {isDownloading ? (
                  <svg className="w-3.5 h-3.5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setExpanded(false)}
        >
          <div className="relative max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <img
              src={img.url}
              alt={img.modelName}
              className="w-full h-auto rounded-xl shadow-2xl max-h-[90vh] object-contain"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={onDownload}
                className="px-3 py-1.5 rounded-lg bg-white/10 backdrop-blur-sm text-white text-xs font-medium hover:bg-white/20 transition-colors"
              >
                다운로드
              </button>
              <button
                onClick={() => setExpanded(false)}
                className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm text-white hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="absolute bottom-3 left-3 text-white text-xs bg-black/50 px-2 py-1 rounded-lg">
              {img.modelName}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
