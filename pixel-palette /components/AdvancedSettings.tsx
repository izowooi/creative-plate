'use client'

import { useState } from 'react'
import { MODELS, AdvancedParam, ModelConfig } from '@/lib/models'

interface Props {
  modelIds: string[]
  params: Record<string, Record<string, unknown>>
  onChange: (params: Record<string, Record<string, unknown>>) => void
}

export default function AdvancedSettings({ modelIds, params, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const models = modelIds
    .map(id => MODELS.find(m => m.id === id))
    .filter((m): m is ModelConfig => !!m)

  if (models.length === 0) return null

  function updateParam(modelId: string, key: string, value: unknown) {
    onChange({
      ...params,
      [modelId]: {
        ...(params[modelId] || {}),
        [key]: value,
      },
    })
  }

  function getParam(modelId: string, key: string, defaultVal: unknown): unknown {
    return params[modelId]?.[key] ?? defaultVal
  }

  return (
    <div className="border border-app rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="
          w-full flex items-center justify-between px-4 py-3
          bg-surface hover:bg-surface-2 transition-colors duration-150 text-left
        "
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-app">추가 설정</span>
          <span className="text-xs text-secondary bg-surface-2 px-2 py-0.5 rounded-full">
            선택사항
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-secondary transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-app animate-slide-up">
          {models.map((model, i) => (
            <div key={model.id} className={`p-4 ${i < models.length - 1 ? 'border-b border-app' : ''}`}>
              {models.length > 1 && (
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider mb-3">
                  {model.name}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {model.advancedParams.map(param => (
                  <ParamControl
                    key={param.key}
                    param={param}
                    value={getParam(model.id, param.key, param.default)}
                    onChange={val => updateParam(model.id, param.key, val)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ParamControl({
  param,
  value,
  onChange,
}: {
  param: AdvancedParam
  value: unknown
  onChange: (val: unknown) => void
}) {
  const val = value ?? param.default

  if (param.type === 'slider') {
    const num = Number(val)
    return (
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-xs font-medium text-app">{param.label}</label>
          <span className="text-xs text-secondary font-mono">{num}</span>
        </div>
        {param.description && (
          <p className="text-xs text-secondary mb-1 opacity-70">{param.description}</p>
        )}
        <input
          type="range"
          min={param.min} max={param.max} step={param.step || 1}
          value={num}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full accent-primary-500 cursor-pointer"
        />
      </div>
    )
  }

  if (param.type === 'select') {
    return (
      <div>
        <label className="text-xs font-medium text-app block mb-1">{param.label}</label>
        <select
          value={String(val)}
          onChange={e => onChange(e.target.value)}
          className="
            w-full px-3 py-2 rounded-lg border border-app bg-app text-app text-sm
            focus:outline-none focus:border-primary-500 cursor-pointer
          "
        >
          {param.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    )
  }

  if (param.type === 'boolean') {
    return (
      <div className="flex items-center justify-between">
        <div>
          <label className="text-xs font-medium text-app">{param.label}</label>
          {param.description && (
            <p className="text-xs text-secondary opacity-70 mt-0.5">{param.description}</p>
          )}
        </div>
        <button
          onClick={() => onChange(!val)}
          className={`
            w-10 h-6 rounded-full transition-colors duration-200 relative flex-shrink-0
            ${val ? 'bg-primary-500' : 'bg-surface-2 border border-app'}
          `}
        >
          <span className={`
            absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200
            ${val ? 'translate-x-4' : 'translate-x-0.5'}
          `} />
        </button>
      </div>
    )
  }

  if (param.type === 'number') {
    return (
      <div>
        <label className="text-xs font-medium text-app block mb-1">{param.label}</label>
        {param.description && (
          <p className="text-xs text-secondary mb-1 opacity-70">{param.description}</p>
        )}
        <input
          type="number"
          value={val === null || val === undefined ? '' : String(val)}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder="Random"
          className="
            w-full px-3 py-2 rounded-lg border border-app bg-app text-app text-sm
            focus:outline-none focus:border-primary-500
          "
        />
      </div>
    )
  }

  if (param.type === 'text') {
    return (
      <div className="col-span-full">
        <label className="text-xs font-medium text-app block mb-1">{param.label}</label>
        {param.description && (
          <p className="text-xs text-secondary mb-1 opacity-70">{param.description}</p>
        )}
        <input
          type="text"
          value={String(val || '')}
          onChange={e => onChange(e.target.value)}
          placeholder="Optional..."
          className="
            w-full px-3 py-2 rounded-lg border border-app bg-app text-app text-sm
            focus:outline-none focus:border-primary-500
          "
        />
      </div>
    )
  }

  return null
}
