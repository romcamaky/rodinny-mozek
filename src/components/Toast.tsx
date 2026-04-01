import { useEffect } from 'react'

type ToastProps = {
  message: string
  type: 'success' | 'error'
  onClose: () => void
}

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onClose()
    }, 3000)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-x-4 z-50 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg"
      style={{
        bottom: 'calc(92px + env(safe-area-inset-bottom))',
        backgroundColor: type === 'success' ? '#16a34a' : '#dc2626',
      }}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  )
}

export default Toast
