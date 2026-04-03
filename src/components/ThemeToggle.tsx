import { useCallback, useEffect, useState } from 'react'
import {
  getEffectiveTheme,
  getStoredTheme,
  type ThemeMode,
  toggleStoredTheme,
} from '../lib/theme'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getEffectiveTheme())

  const syncFromDom = useCallback(() => {
    setMode(getEffectiveTheme())
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (getStoredTheme() === null) syncFromDom()
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [syncFromDom])

  function handleClick() {
    const next = toggleStoredTheme()
    setMode(next)
  }

  const isDark = mode === 'dark'

  return (
    <button
      type="button"
      onClick={handleClick}
      className="no-select flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border transition-opacity active:opacity-80"
      style={{
        borderColor: 'color-mix(in srgb, var(--color-text-secondary) 25%, transparent)',
        color: 'var(--color-text-secondary)',
      }}
      aria-label={isDark ? 'Přepnout na světlý režim' : 'Přepnout na tmavý režim'}
      title={isDark ? 'Světlý režim' : 'Tmavý režim'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}

export default ThemeToggle
