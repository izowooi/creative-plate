'use client'

import { useState } from 'react'
import { formatPrice, Currency } from '@/lib/models'

export interface GeneratedVideo {
  url: string
  modelId: string
  modelName: string
  index: number
}

interface Props {
  videos: GeneratedVideo[]
  totalCost?: number
  generationTime?: number
  currency: Currency
}

export default function VideoGrid({ videos, totalCost, generationTime, currency }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = useState(false)

  async function downloadVideo(url: string, filename: string) {
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
    for (let i = 0; i < videos.length; i++) {
      const vid = videos[i]
      await downloadVideo(
        vid.url,
        `pixel-palette-${vid.modelName.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.mp4`
      )
      if (i < videos.length - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setDownloadingAll(false)
  }

  if (videos.length === 0) return null

  const gridCols =
    videos.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' :
    videos.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
    videos.length === 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' :
    'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2'

  return (
    <div className="animate-slide-up">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-app text-sm">
            {videos.length}개 영상 생성 완료 🎬
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

        {videos.length > 1 && (
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

      {/* Video grid */}
      <div className={`grid ${gridCols} gap-4`}>
        {videos.map((vid, i) => (
          <VideoCard
            key={`${vid.url}-${i}`}
            vid={vid}
            isDownloading={downloading === vid.url}
            onDownload={() => downloadVideo(
              vid.url,
              `pixel-palette-${vid.modelName.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.mp4`
            )}
          />
        ))}
      </div>
    </div>
  )
}

function VideoCard({
  vid,
  isDownloading,
  onDownload,
}: {
  vid: GeneratedVideo
  isDownloading: boolean
  onDownload: () => void
}) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-surface border border-app group">
      <video
        src={vid.url}
        controls
        loop
        className="w-full h-auto"
        preload="metadata"
      />

      {/* Overlay footer */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border-t border-app">
        <span className="text-xs font-medium text-secondary">{vid.modelName}</span>
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="
            flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium
            bg-surface-2 hover:bg-primary-600 hover:text-white text-secondary
            disabled:opacity-60 transition-all duration-150 active:scale-95 border border-app
          "
          title="다운로드"
        >
          {isDownloading ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          )}
          MP4
        </button>
      </div>
    </div>
  )
}
