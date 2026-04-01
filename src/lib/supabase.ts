import { createClient } from '@supabase/supabase-js'

// Vite exposes variables prefixed with VITE_ through import.meta.env at build and runtime.
const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function isValidHttpUrl(value: string | undefined): value is string {
  if (!value) {
    return false
  }

  try {
    const parsedUrl = new URL(value)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

const supabaseUrl = isValidHttpUrl(rawSupabaseUrl)
  ? rawSupabaseUrl
  : 'https://example.supabase.co'
const supabaseAnonKey = rawSupabaseAnonKey || 'placeholder-anon-key'

// This flag is useful for UI checks so the app can show setup state before real credentials exist.
export const isSupabaseConfigured =
  isValidHttpUrl(rawSupabaseUrl) && Boolean(rawSupabaseAnonKey)

// Shared Supabase client used by the app for database, auth, and edge function calls.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
