// Shared CORS allow-list for every Edge Function.
//
// CORS is enforced by the *caller's* HTTP client, not this server - it only
// matters for requests made by JS running in a browser-like engine (a
// website's own JS, or this app's Capacitor WebView), where the engine
// decides whether to let that JS read the response based on whether the
// response's Access-Control-Allow-Origin matches the page's own origin.
// Non-browser callers (our own test/admin scripts, pg_net DB triggers,
// server-to-server calls, social-link crawlers) never apply this check, so
// tightening it here can't break those - it was never protecting them.
//
// Previously every function hardcoded 'Access-Control-Allow-Origin': '*',
// which tells every browser-like engine "any website's JS may read this
// response as the signed-in user who called it" - meaning a malicious
// website, if it ever got hold of a visitor's access token (e.g. via an
// unrelated XSS bug, or a visitor pasting it in), could read full API
// responses cross-origin instead of just blindly firing requests. Fixed by
// only ever reflecting an Origin that's actually ours: the Capacitor app
// shell, the local dev servers, and whatever production web origins get
// configured below - everything else gets no Access-Control-Allow-Origin
// header at all, so the browser/WebView refuses to expose the response.
//
// Production web origins (the admin dashboard, and the app if it's ever
// served as a website rather than just packaged via Capacitor) aren't
// hardcoded here because they weren't settled yet when this was written.
// Set them with:
//   supabase secrets set ALLOWED_ORIGINS=https://your-admin-domain,https://your-app-domain --project-ref muigquisnrhdbvnexyzu
// (comma-separated, no spaces, exact scheme+host+port). Until that's set,
// only the origins below are allowed - fail closed, not fail open.

const ALWAYS_ALLOWED = [
  // Capacitor's default WebView origins (no custom server.hostname/scheme
  // is set in app/capacitor.config.json, so these are what the app's own
  // WebView actually sends as Origin on every request).
  'https://localhost',       // Capacitor Android default (androidScheme: 'https')
  'capacitor://localhost',   // Capacitor iOS default (iosScheme: 'capacitor')
  // Local dev servers (see CONTEXT.md).
  'http://localhost:5173',   // admin
  'http://localhost:5174',   // app
]

function allowedOrigins(): string[] {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
  const extra = configured
    ? configured.split(',').map((o) => o.trim()).filter(Boolean)
    : []
  return [...ALWAYS_ALLOWED, ...extra]
}

/**
 * Build CORS response headers for one request. Pass the incoming request's
 * Origin header (`req.headers.get('origin')`); if it's not on the allow
 * list, Access-Control-Allow-Origin is simply omitted rather than reflecting
 * it back, which makes the browser/WebView discard the response instead of
 * handing it to that origin's JS.
 */
export function getCorsHeaders(
  origin: string | null,
  methods: string = 'GET, POST, PATCH, DELETE, OPTIONS'
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': methods,
    'Vary': 'Origin',
  }
  if (origin && allowedOrigins().includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}
