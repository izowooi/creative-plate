'use client'

import { MODELS, ModelConfig, SPEED_LABELS, QUALITY_LABELS, formatPrice, Currency } from '@/lib/models'

const VENDOR_COLORS: Record<string, string> = {
  'BFL': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'ByteDance': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'OpenAI': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'PrunaAI': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Google': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
}

const SPEED_COLORS: Record<string, string> = {
  turbo: 'text-yellow-500',
  fast: 'text-blue-500',
  medium: 'text-purple-500',
}

interface Props {
  mode: 'single' | 'compare'
  selectedIds: string[]
  onChange: (ids: string[]) => void
  currency: Currency
}

export default function ModelSelector({ mode, selectedIds, onChange, currency }: Props) {
  function toggleModel(id: string) {
    if (mode === 'single') {
      onChange([id])
    } else {
      if (selectedIds.includes(id)) {
        if (selectedIds.length > 1) {
          onChange(selectedIds.filter(m => m !== id))
        }
      } else {
        if (selectedIds.length < 4) {
          onChange([...selectedIds, id])
        }
      }
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-secondary uppercase tracking-wider">
          {mode === 'single' ? '모델 선택' : `모델 선택 (${selectedIds.length}/4)`}
        </h2>
        {mode === 'compare' && (
          <span className="text-xs text-secondary">2~4개 모델을 선택하세요</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {MODELS.map(model => (
          <ModelCard
            key={model.id}
            model={model}
            selected={selectedIds.includes(model.id)}
            disabled={
              mode === 'compare' &&
              !selectedIds.includes(model.id) &&
              selectedIds.length >= 4
            }
            onClick={() => toggleModel(model.id)}
            currency={currency}
          />
        ))}
      </div>
    </div>
  )
}

function ModelCard({
  model,
  selected,
  disabled,
  onClick,
  currency,
}: {
  model: ModelConfig
  selected: boolean
  disabled: boolean
  onClick: () => void
  currency: Currency
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        relative text-left p-3 rounded-xl border transition-all duration-150
        group cursor-pointer active:scale-[0.98]
        ${selected
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm shadow-primary-500/10'
          : 'border-app bg-surface hover:border-primary-400 hover:bg-surface-2'
        }
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
    >
      {/* Badge */}
      {model.badge && (
        <span className={`
          absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full
          ${selected
            ? 'bg-primary-500 text-white'
            : 'bg-surface-2 text-secondary'
          }
        `}>
          {model.badge}
        </span>
      )}

      {/* Header */}
      <div className="flex items-start gap-2 pr-8">
        <div className={`
          w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0
          ${VENDOR_COLORS[model.vendorShort] || 'bg-gray-100 text-gray-700'}
        `}>
          {model.vendorShort[0]}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm text-app leading-tight truncate flex items-center gap-1">
            {model.name}
            {model.flags && <span className="text-sm leading-none">{model.flags.join('')}</span>}
          </div>
          <div className="text-xs text-secondary">{model.vendor}</div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 mt-2">
        <span className={`text-xs font-medium ${SPEED_COLORS[model.speed]}`}>
          {SPEED_LABELS[model.speed]}
        </span>
        <span className="text-secondary opacity-30">·</span>
        <span className="text-xs text-secondary">{formatPrice(model.estimatedCostPerImage, currency, true)}/img</span>
      </div>

      {/* Selected indicator */}
      {selected && (
        <div className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse" />
      )}
    </button>
  )
}
