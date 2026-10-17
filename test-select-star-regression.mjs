// URGENT regression check: AuthContext.jsx runs `.from('users').select('*')`
// on every login to load the signed-in user's OWN profile. If `select('*')`
// expands to the literal column list (including the now-ungrantable
// enrollment_number) at parse time, this would break login for everyone,
// not just block looking up OTHER users' enrollment_number.
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

const r2 = await fetch(`${URL_BASE}/rest/v1/users?id=eq.${user.id}&select=*`, {
  headers: { apikey: ANON, Authorization: `Bearer ${access_token}` },
})
console.log('select=* on OWN row status:', r2.status)
console.log('body:', (await r2.text()).slice(0, 400))
