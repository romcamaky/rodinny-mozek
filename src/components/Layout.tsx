import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import CaptureFAB from './CaptureFAB'

const TOP_BAR_HEIGHT = 56
const BOTTOM_NAV_HEIGHT = 80

function Layout() {
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
        <div className="flex h-full items-center">
          <span className="text-sm font-medium no-select" style={{ color: 'var(--color-text-secondary)' }}>
            Mozek 🧠
          </span>
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
