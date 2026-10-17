// One-off test for the wildcard-CORS fix across the edge functions.
// Run from the campusfind repo root: node test-cors-fix.mjs
//
// Checks, against a real OPTIONS preflight to /functions/v1/reports:
//   A) Origin: https://evil-attacker.example (unknown)    -> no ACAO header
//   B) Origin: https://localhost (Capacitor Android)      -> ACAO reflects it
//   C) Origin: http://localhost:5174 (app dev server)     -> ACAO reflects it
//   D) No Origin header at all (e.g. a plain server call) -> no ACAO header
//      (harmless - CORS only matters to browser-like clients, which always
//      send Origin on a cross-origin request)

import fs from 'node:fs'

const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

async function preflight(label, origin) {
  const headers = {
    apikey: ANON,
    'Access-Control-Request-Method': 'GET',
    'Access-Control-Request-Headers': 'authorization,content-type',
  }
  if (origin) headers.Origin = origin
  const res = await fetch(`${URL_BASE}/functions/v1/reports`, { method: 'OPTIONS', headers })
  const acao = res.headers.get('access-control-allow-origin')
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status, '| Access-Control-Allow-Origin:', acao ?? '(absent)')
  return acao
}

async function main() {
  const resultA = await preflight('TEST A: unknown attacker origin', 'https://evil-attacker.example')
  const resultB = await preflight('TEST B: Capacitor Android default origin', 'https://localhost')
  const resultC = await preflight('TEST C: app dev server origin', 'http://localhost:5174')
  const resultD = await preflight('TEST D: no Origin header', null)

  console.log('\n==================== RESULT ====================')
  console.log(resultA === null ? 'PASS: unknown origin gets no ACAO header' : `FAIL: unknown origin got reflected: ${resultA}`)
  console.log(resultB === 'https://localhost' ? 'PASS: Capacitor app origin allowed' : `FAIL: expected https://localhost, got ${resultB}`)
  console.log(resultC === 'http://localhost:5174' ? 'PASS: dev server origin allowed' : `FAIL: expected http://localhost:5174, got ${resultC}`)
  console.log(resultD === null ? 'PASS: no Origin header -> no ACAO header' : `FAIL: got ACAO with no Origin sent: ${resultD}`)
  console.log('=================================================')
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
