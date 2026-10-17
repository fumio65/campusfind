import fs from 'node:fs'
const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const signedURL = process.argv[2]
const fullUrl = `${URL_BASE}/storage/v1${signedURL}`
console.log('fetching:', fullUrl)
const res = await fetch(fullUrl)
const text = await res.text()
console.log('status:', res.status)
console.log('body:', text)
