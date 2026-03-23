'use client'

import { useState, useEffect } from 'react'

const MESSAGES = [
  "AI가 붓을 들고 영감을 찾고 있어요... 🎨",
  "픽셀들이 자기 자리를 찾아가는 중이에요 ✨",
  "디지털 뮤즈에게 영감을 구하는 중... 🌟",
  "신경망이 꿈을 꾸고 있어요 💭",
  "수백만 개의 색상 중에서 딱 맞는 걸 골라내는 중 🎯",
  "마스터피스가 완성되기 까지 조금만 기다려 주세요 🖼️",
  "AI 화가가 진지하게 고민 중이에요... 🤔",
  "빛과 그림자를 계산하는 중이에요 ⚡",
  "상상력을 픽셀로 변환하는 마법 진행 중 ✨",
  "클라우드에서 창의력을 소환하는 중... ☁️",
  "AI가 모든 픽셀에 사랑을 담고 있어요 💖",
  "예술의 신이 도착할 때까지 잠시만 기다려 주세요 🏛️",
  "10,000시간의 훈련이 지금 빛을 발하는 중... 🌈",
  "디지털 물감을 섞는 중이에요 🎨",
  "완벽한 구도를 계산하는 중... 📐",
]

interface Props {
  modelNames: string[]
  completed: number
  total: number
}

export default function LoadingMessages({ modelNames, completed, total }: Props) {
  const [msgIndex, setMsgIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setMsgIndex(i => (i + 1) % MESSAGES.length)
        setVisible(true)
      }, 300)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const progress = total > 0 ? (completed / total) * 100 : 0

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
      {/* Spinning orb */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full bg-primary-500/20 animate-ping" />
        <div className="absolute inset-2 rounded-full bg-primary-500/40 animate-pulse" />
        <div className="absolute inset-4 rounded-full bg-primary-500 flex items-center justify-center">
          <span className="text-2xl animate-spin-slow">🎨</span>
        </div>
      </div>

      {/* Witty message */}
      <div className={`transition-all duration-300 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
        <p className="text-base font-medium text-app max-w-xs leading-relaxed">
          {MESSAGES[msgIndex]}
        </p>
      </div>

      {/* Models generating */}
      <div className="flex flex-wrap gap-2 justify-center mt-4 mb-6">
        {modelNames.map(name => (
          <span key={name} className="text-xs bg-surface px-3 py-1 rounded-full border border-app text-secondary">
            {name}
          </span>
        ))}
      </div>

      {/* Progress */}
      {total > 1 && (
        <div className="w-full max-w-xs">
          <div className="flex justify-between text-xs text-secondary mb-2">
            <span>진행 중</span>
            <span>{completed} / {total}</span>
          </div>
          <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <p className="text-xs text-secondary mt-6 opacity-60">
        모델에 따라 5초~2분 정도 걸릴 수 있어요
      </p>
    </div>
  )
}
