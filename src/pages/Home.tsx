import { useEffect, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

function Home() {
  const [isConnected, setIsConnected] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function checkSupabaseConnection() {
      if (!isSupabaseConfigured) {
        if (isMounted) {
          setIsConnected(false)
          setIsChecking(false)
        }
        return
      }

      try {
        const { error } = await supabase.auth.getSession()
        if (isMounted) {
          setIsConnected(!error)
        }
      } catch {
        if (isMounted) {
          setIsConnected(false)
        }
      } finally {
        if (isMounted) {
          setIsChecking(false)
        }
      }
    }

    void checkSupabaseConnection()

    return () => {
      isMounted = false
    }
  }, [])

  const indicatorClass = isChecking
    ? 'bg-amber-400'
    : isConnected
      ? 'bg-emerald-500'
      : 'bg-rose-500'

  const statusText = isChecking
    ? 'Kontroluji pripojeni...'
    : isConnected
      ? 'Supabase pripojeno'
      : 'Supabase odpojeno'

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <section className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-4xl font-bold text-slate-800">Rodinny Mozek ??</h1>
        <p className="mt-3 text-base text-slate-500">Rodinny AI asistent</p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">
          <span className={`h-2.5 w-2.5 rounded-full ${indicatorClass}`} />
          <span>{statusText}</span>
        </div>
      </section>
    </main>
  )
}

export default Home
