import fs from 'node:fs'
const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: '0000001@nwssu.local', password: 'Admin@1234' }),
})
const { access_token, user } = await res.json()

// Exact column list AuthContext.jsx now sends
const cols = 'id, student_id, last_name, first_name, middle_name, program, year_level, role, status, trust_score, force_password_change, created_at, updated_at, department_code, program_code'
const r2 = await fetch(`${URL_BASE}/rest/v1/users?id=eq.${user.id}&select=${encodeURIComponent(cols)}`, {
  headers: { apikey: ANON, Authorization: `Bearer ${access_token}` },
})
console.log('status:', r2.status)
console.log('body:', (await r2.text()).slice(0, 500))
console.log(r2.status === 200 ? '\nPASS: AuthContext.jsx\'s new query works - login profile fetch restored' : '\nFAIL')
