import { type FormEvent, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/authContext'

function LoginPage() {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (authLoading) {
    return (
      <div
        className="bg-page flex min-h-screen flex-col items-center justify-center gap-3 px-4"
        style={{ color: 'var(--color-text)' }}
      >
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-[color:var(--color-border)] border-t-[color:var(--color-primary)]"
          aria-hidden
        />
        <p className="text-secondary text-sm">Načítám…</p>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (signError) {
        setError('Nesprávný e-mail nebo heslo.')
        return
      }
      navigate('/', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="bg-page flex min-h-screen flex-col justify-center px-4 py-8"
      style={{ color: 'var(--color-text)' }}
    >
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-primary text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Rodinný Mozek
        </h1>
        <p className="text-secondary mt-2 text-center text-sm">Přihlášení</p>

        <form
          className="card-rainbow bg-surface mt-8 space-y-5 rounded-xl border border-[color:var(--color-border)] p-5 shadow-sm"
          style={{
            boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 8%, transparent)',
          }}
          onSubmit={(e) => void handleSubmit(e)}
        >
          <label className="block">
            <span className="text-primary mb-1.5 block text-sm font-medium">E-mail</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="bg-surface text-primary placeholder:text-secondary min-h-11 w-full rounded-xl border border-[color:var(--color-border)] px-3 py-2 text-base focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
              placeholder="vas@email.cz"
              disabled={submitting}
            />
          </label>

          <label className="block">
            <span className="text-primary mb-1.5 block text-sm font-medium">Heslo</span>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                className="bg-surface text-primary placeholder:text-secondary min-h-11 w-full rounded-xl border border-[color:var(--color-border)] py-2 pl-3 pr-14 text-base focus:border-[color:var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-primary)]"
                disabled={submitting}
              />
              <button
                type="button"
                className="text-secondary absolute right-1 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-lg px-2 text-xs font-medium"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
              >
                {showPassword ? 'Skrýt' : 'Ukázat'}
              </button>
            </div>
          </label>

          {error ? (
            <p className="text-center text-sm font-medium text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl text-base font-semibold text-[color:var(--color-btn-text)] disabled:opacity-60"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {submitting ? 'Přihlašuji...' : 'Přihlásit se'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage
