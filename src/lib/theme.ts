/**
 * Color theme: `data-theme` on <html> ("light" | "dark").
 * If nothing is stored in localStorage, follows prefers-color-scheme until the user toggles.
 */

export const THEME_STORAGE_KEY = 'rodinny-mozek-theme'

export type ThemeMode = 'light' | 'dark'

export function getStoredTheme(): ThemeMode | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* private mode */
  }
  return null
}

/** Resolved appearance (stored preference or system). */
export function getEffectiveTheme(): ThemeMode {
  const stored = getStoredTheme()
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** Run once on app load: set attribute and watch system preference when user has not chosen a fixed theme. */
export function initTheme(): void {
  applyTheme(getEffectiveTheme())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === null) {
      applyTheme(getEffectiveTheme())
    }
  })
}

/** Toggle light ↔ dark and persist so the app no longer follows system until changed again. */
export function toggleStoredTheme(): ThemeMode {
  const next: ThemeMode = getEffectiveTheme() === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  applyTheme(next)
  return next
}
