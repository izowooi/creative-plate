'use client'

import { useState, useEffect } from 'react'

const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD || 'pixel2024'
const STORAGE_KEY = 'pp_auth'

interface Props {
  onAuth: () => void
}

export default function PasswordGate({ onAuth }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    // Check if already authenticated in this session
    if (sessionStorage.getItem(STORAGE_KEY) === 'true') {
      onAuth()
    }
  }, [onAuth])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (value === APP_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, 'true')
      onAuth()
    } else {
      setError(true)
      setShake(true)
      setValue('')
      setTimeout(() => setShake(false), 500)
      setTimeout(() => setError(false), 3000)
    }
  }

  return (
    <div className="fixed inset-0 bg-app flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4 select-none">🎨</div>
          <h1 className="text-2xl font-bold text-app tracking-tight">Pixel Palette</h1>
          <p className="text-secondary text-sm mt-1">AI Image Studio</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={shake ? 'animate-[wiggle_0.4s_ease]' : ''}>
          <div className="bg-surface rounded-2xl p-6 border border-app shadow-lg">
            <label className="block text-sm font-medium text-secondary mb-2">
              Access Password
            </label>
            <input
              type="password"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Enter password..."
              autoFocus
              className={`
                w-full px-4 py-3 rounded-xl border text-app bg-app
                outline-none transition-all duration-200 text-base
                ${error
                  ? 'border-red-500 focus:ring-2 focus:ring-red-500/20'
                  : 'border-app focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'
                }
              `}
            />
            {error && (
              <p className="text-red-500 text-xs mt-2 animate-fade-in">
                Incorrect password. Try again.
              </p>
            )}
            <button
              type="submit"
              disabled={!value}
              className="
                mt-4 w-full py-3 rounded-xl font-semibold text-white
                bg-primary-600 hover:bg-primary-700 disabled:opacity-40
                disabled:cursor-not-allowed transition-all duration-200
                active:scale-[0.98]
              "
            >
              Enter Studio
            </button>
          </div>
        </form>

        <p className="text-center text-xs text-secondary mt-6 opacity-60">
          Private access only
        </p>
      </div>
    </div>
  )
}
