import { supabase } from './supabaseClient'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

// Attaches the logged-in admin's Supabase access token so the server can
// verify (via requireAdmin) that the caller is actually an admin, instead of
// trusting any request that reaches it. Use for every account-management /
// dashboard endpoint (accounts, bulk-import, overview, analytics).
export async function adminFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }
  return fetch(`${SERVER_URL}${path}`, { ...options, headers })
}
