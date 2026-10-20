import { supabase } from './supabase'

export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// Headers for any Edge Function call made on behalf of the signed-in user
// (student or admin): the public apikey plus the user's access token, so the
// function's requireUser/requireAdmin check knows who is calling. Every
// function except send-push and og-preview now rejects calls without it.
export async function freshSession() {
  const { data: { session } } = await supabase.auth.getSession()
  // getSession() can hand back a token that expired while the app sat in
  // the background (auto-refresh pauses there), which the functions
  // reject with 401. Refresh when it is expired or about to be.
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60_000) {
    const { data } = await supabase.auth.refreshSession()
    return data.session ?? session
  }
  return session
}

// fetch() for Edge Function calls made as the signed-in user: sends a
// fresh token, and on a 401 refreshes the session once and retries.
export async function authFetch(url, options = {}) {
  const send = (session) => {
    const headers = new Headers(options.headers)
    headers.set('apikey', ANON_KEY)
    if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`)
    return fetch(url, { ...options, headers })
  }
  let res = await send(await freshSession())
  if (res.status === 401) {
    const { data } = await supabase.auth.refreshSession()
    if (data.session) res = await send(data.session)
  }
  return res
}

export async function authHeaders(extra = {}) {
  const session = await freshSession()
  return {
    apikey: ANON_KEY,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...extra,
  }
}

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
