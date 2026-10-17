import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { SignJWT, importPKCS8 } from 'npm:jose@5'


const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!)
const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET')

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

async function getAccessToken(): Promise<string> {
  const privateKey = await importPKCS8(serviceAccount.private_key, 'RS256')
  const jwt = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Failed to get FCM access token: ${JSON.stringify(data)}`)
  return data.access_token
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'), 'POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // SECURITY FIX: this function had no auth check at all - its only
  // legitimate caller is a database trigger (no user JWT available to it),
  // but that also meant anyone could call it directly and have an
  // arbitrary push notification sent to any user_id. Require a shared
  // secret that only our own trigger knows (see migration
  // 0015_secure_send_push_webhook.sql), checked with a constant-time
  // comparison so response timing can't leak how much of a guess matched.
  const providedSecret = req.headers.get('x-webhook-secret')
  if (!webhookSecret || !providedSecret || !timingSafeEqual(providedSecret, webhookSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { user_id, title, body, report_id, type, tip_id } = await req.json()
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: 'user_id and title are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: tokens, error } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('user_id', user_id)

    if (error) throw error
    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await getAccessToken()

    const results = await Promise.allSettled(
      tokens.map(({ token }) =>
        fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title, body },
              data: {
                ...(report_id ? { report_id: String(report_id) } : {}),
                ...(type ? { type: String(type) } : {}),
                ...(tip_id ? { tip_id: String(tip_id) } : {}),
              },
              android: { priority: 'high' },
            },
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const errBody = await res.text()
            // Token is stale (app uninstalled / registration expired) — stop using it.
            if (res.status === 404 || res.status === 400) {
              await supabaseAdmin.from('push_tokens').delete().eq('token', token)
            }
            throw new Error(`FCM send failed (${res.status}): ${errBody}`)
          }
        })
      )
    )

    const sent = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length) {
      console.error(
        'Some push sends failed:',
        failed.map((f) => (f as PromiseRejectedResult).reason?.message)
      )
    }

    return new Response(JSON.stringify({ ok: true, sent, failed: failed.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-push error:', err)
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
