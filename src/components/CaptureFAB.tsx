import { useEffect, useState } from 'react'
import CaptureOverlay from './CaptureOverlay'

function MicFabIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </svg>
  )
}

function CaptureFAB() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onOpenCapture() {
      setOpen(true)
    }

    window.addEventListener('open-capture', onOpenCapture)
    return () => {
      window.removeEventListener('open-capture', onOpenCapture)
    }
  }, [])

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 z-50 flex h-[56px] w-[56px] items-center justify-center rounded-full bg-blue-600 text-white shadow-lg animate-pulse"
          aria-label="Zachytit"
          style={{
            boxShadow:
              '0 10px 20px -10px rgba(37, 99, 235, 0.45), 0 5px 15px -5px rgba(37, 99, 235, 0.35)',
          }}
        >
          <MicFabIcon />
        </button>
      ) : null}

      {open ? <CaptureOverlay onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export default CaptureFAB

