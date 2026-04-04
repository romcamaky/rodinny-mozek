// Supabase client initialization
// Realtime is fully disabled — we don't use subscriptions, and the WebSocket
// connection crashes the app in local dev when the realtime server isn't available.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'rodinny-mozek-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: -1, // Disable realtime completely
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'rodinny-mozek',
      // Explicit apikey so PostgREST always receives it (avoids “No API key found in request”
      // if any code path omits the default). Same value as the createClient second argument.
      apikey: supabaseAnonKey,
    },
  },
})

// Aggressively remove any realtime channels the client might auto-create
supabase.removeAllChannels()

// Monkey-patch the realtime client to prevent WebSocket connections entirely.
// The Supabase JS client v2 ignores config options and tries to connect anyway.
// This prevents the TypeError crash that causes a blank page.
try {
  if (supabase.realtime) {
    supabase.realtime.disconnect()
    // Override connect to be a no-op so it never reconnects
    supabase.realtime.connect = () => {
      return Promise.resolve()
    }
  }
} catch (e) {
  // Silently ignore — realtime is not critical for this app
  console.warn('Failed to disable Supabase realtime:', e)
}
