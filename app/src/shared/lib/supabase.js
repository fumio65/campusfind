import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Named explicitly (rather than left to supabase-js's project-ref-derived
// default) so readPersistedSession() below can find it without reverse
// engineering that derivation.
const AUTH_STORAGE_KEY = 'campusfind-auth'

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: AUTH_STORAGE_KEY,
  },
})

// Reads the raw session straight out of storage, bypassing supabase-js's own
// expiry check. Used as an offline fallback: when the access token's real
// expiry has passed and there's no network to refresh it, getSession()
// returns null even though the refresh token (and the account) are still
// good - it just can't prove that without a network call. Offline, there's
// no API call to protect anyway, so trusting the cached session for UI
// purposes is safe; a real revocation still takes effect the moment a
// network request is actually made once back online.
export function readPersistedSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed?.user ? parsed : null
  } catch {
    return null
  }
}