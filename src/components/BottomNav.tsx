import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

type TabItem = {
  label: string
  path: string
  icon: ReactNode
  isPrimary?: boolean
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M9 6h11" />
      <path d="M9 12h11" />
      <path d="M9 18h11" />
      <path d="m3.5 6.5 1.5 1.5 2.5-3" />
      <path d="m3.5 12.5 1.5 1.5 2.5-3" />
      <path d="m3.5 18.5 1.5 1.5 2.5-3" />
    </svg>
  )
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  )
}

function PlacesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M12 21s7-5.9 7-11a7 7 0 1 0-14 0c0 5.1 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

type BottomNavProps = {
  navHeight: number
}

function BottomNav({ navHeight }: BottomNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Capture is visually emphasized because voice-first input is the app's primary action.
  const tabs: TabItem[] = [
    { label: 'Úkoly', path: '/tasks', icon: <TasksIcon /> },
    { label: 'Poznámky', path: '/notes', icon: <NotesIcon /> },
    { label: 'Zachytit', path: '/capture', icon: <MicIcon />, isPrimary: true },
    { label: 'Místa', path: '/places', icon: <PlacesIcon /> },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-white no-select"
      style={{
        height: `calc(${navHeight}px + env(safe-area-inset-bottom))`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        borderColor: 'color-mix(in srgb, var(--color-text-secondary) 20%, transparent)',
      }}
      aria-label="Spodní navigace"
    >
      <div className="mx-auto grid h-[80px] max-w-md grid-cols-4 px-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path
          const isPrimary = Boolean(tab.isPrimary)
          const baseColor = isActive
            ? 'var(--color-primary)'
            : 'var(--color-text-secondary)'

          return (
            <button
              key={tab.path}
              type="button"
              className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-xl"
              style={{ color: baseColor }}
              onClick={() => navigate(tab.path)}
              aria-current={isActive ? 'page' : undefined}
            >
              {isPrimary ? (
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-white"
                  style={{
                    backgroundColor: isActive
                      ? 'var(--color-primary-dark)'
                      : 'var(--color-primary)',
                    transform: 'translateY(-2px)',
                  }}
                >
                  {tab.icon}
                </span>
              ) : (
                tab.icon
              )}
              <span className="text-[11px] font-medium leading-none">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export default BottomNav
