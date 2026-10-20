// In-memory, per-session cache of the last data each admin page loaded.
//
// Every admin tab used to start from nothing on each visit: clear its state,
// show the loading skeleton, and refetch - so switching back to a tab you were
// just on waited on the network again. Pages now render the last result from
// here immediately and refresh in the background (stale-while-revalidate).
// Lives only in memory: it is cleared on reload/sign-out, and never shared
// between admins.
const cache = new Map()

export function getAdminCache(key) {
  return cache.get(key)
}

export function setAdminCache(key, value) {
  cache.set(key, value)
}

export function clearAdminCache() {
  cache.clear()
}

// Admin data comes from several Edge Functions, each of which takes ~2-3s to
// boot the first time it's called after sitting idle (warm calls are
// ~0.3-0.5s). Visiting tabs one by one used to pay that boot cost once per
// tab. Sending each function a CORS preflight as soon as the dashboard opens
// boots them all in parallel while the admin is still on the first page; the
// functions answer OPTIONS with an empty 204 and no auth, so this reads and
// changes nothing.
const ADMIN_FUNCTIONS = ['overview', 'analytics', 'reports', 'accounts', 'bulk-import', 'dropoff', 'notifications', 'claims']

export function warmAdminFunctions() {
  const base = import.meta.env.VITE_SUPABASE_URL
  if (!base) return
  for (const fn of ADMIN_FUNCTIONS) {
    fetch(`${base}/functions/v1/${fn}`, { method: 'OPTIONS' }).catch(() => {})
  }
}
