import { Outlet } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import BottomNav from './BottomNav'
import CaptureFAB from './CaptureFAB'
import ThemeToggle from './ThemeToggle'

const TOP_BAR_HEIGHT = 56
const BOTTOM_NAV_HEIGHT = 80

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 12H9" strokeLinecap="round" />
    </svg>
  )
}

function Layout() {
  const { logout } = useAuth()

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}
    >
      {/* Sticky top zone keeps app identity visible while content scrolls underneath. */}
      <header
        className="sticky top-0 z-20 border-b px-4"
        style={{
          height: TOP_BAR_HEIGHT,
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          backgroundColor: 'var(--color-surface)',
          borderColor: 'color-mix(in srgb, var(--color-text-secondary) 20%, transparent)',
        }}
      >
        <div className="flex h-full w-full items-center justify-between gap-2">
          <span className="text-sm font-medium no-select" style={{ color: 'var(--color-text-secondary)' }}>
            Mozek 🧠
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="no-select flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-[color:var(--color-border)]"
              style={{ color: 'var(--color-text-secondary)' }}
              onClick={() => void logout()}
              aria-label="Odhlásit se"
              title="Odhlásit se"
            >
              <LogoutIcon />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Scrollable content zone leaves room for fixed bottom nav + iPhone safe area. */}
      <main
        className="scroll-area px-4 py-5"
        style={{
          minHeight: `calc(100vh - ${TOP_BAR_HEIGHT}px)`,
          paddingBottom: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 12px)`,
        }}
      >
        <Outlet />
      </main>

      {/* Fixed navigation zone anchored to bottom; safe area prevents clipping in iOS PWAs. */}
      <BottomNav navHeight={BOTTOM_NAV_HEIGHT} />

      {/* Floating capture entry point available on every screen. */}
      <CaptureFAB />
    </div>
  )
}

export default Layout
