import { createClient } from 'jsr:@supabase/supabase-js@2'
import { SignJWT, importPKCS8 } from 'npm:jose@5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const serviceAccount = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!)

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
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const { user_id, title, body, report_id } = await req.json()
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
              data: report_id ? { report_id: String(report_id) } : {},
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
