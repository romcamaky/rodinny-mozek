import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

console.log('[SUPABASE INIT] URL:', supabaseUrl)
console.log('[SUPABASE INIT] Key exists:', !!supabaseAnonKey)
console.log('[SUPABASE INIT] Key length:', supabaseAnonKey?.length)

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env.local')
}

// Create the Supabase client with realtime DISABLED to prevent WebSocket crash loop.
// We don't use realtime subscriptions yet — just REST API calls.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 0,
    },
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
})

// Immediately disconnect realtime to prevent any WebSocket attempts
supabase.removeAllChannels()
