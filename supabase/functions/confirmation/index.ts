import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function notifyUser({ userId, type, title, body, reportId = null }: {
  userId: string
  type: string
  title: string
  body: string
  reportId?: string | null
}) {
  if (!userId) return
  await supabaseAdmin.from('user_notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    report_id: reportId,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('confirmation')
  const id = pathParts[baseIndex + 1]

  try {
    // POST /confirmation
    if (req.method === 'POST' && !id) {
      const { reportId, reporterId, proxyName, proxyStudentId } = await req.json()
      if (!reportId || !reporterId || !proxyName || !proxyStudentId) {
        return new Response(JSON.stringify({ error: 'reportId, reporterId, proxyName, and proxyStudentId are required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin
        .from('confirmation_requests')
        .update({ status: 'denied', responded_at: new Date().toISOString() })
        .eq('report_id', reportId)
        .eq('status', 'pending')

      const { data, error } = await supabaseAdmin
        .from('confirmation_requests')
        .insert({ report_id: reportId, reporter_id: reporterId, proxy_name: proxyName, proxy_student_id: proxyStudentId })
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin.from('notifications').insert({
        type: 'pickup_confirmation_request',
        title: 'Confirm Proxy Pickup',
        body: `Someone is at the ISSC office to pick up your item. Please confirm that ${proxyName} (${proxyStudentId}) is authorized.`,
        report_id: reportId,
      })

      await notifyUser({
        userId: reporterId,
        type: 'pickup_confirmation_request',
        title: 'Action required — Proxy pickup',
        body: `Someone is at the ISSC office claiming to pick up your item. Confirm if ${proxyName} (${proxyStudentId}) is authorized.`,
        reportId,
      })

      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // GET /confirmation/:reportId
    if (req.method === 'GET' && id) {
      const { data, error } = await supabaseAdmin
        .from('confirmation_requests')
        .select('*')
        .eq('report_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /confirmation/:id
    if (req.method === 'PATCH' && id) {
      const { status } = await req.json()
      if (!['approved', 'denied'].includes(status)) {
        return new Response(JSON.stringify({ error: 'status must be approved or denied.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await supabaseAdmin
        .from('confirmation_requests')
        .update({ status, responded_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin.from('notifications').insert({
        type: status === 'approved' ? 'pickup_confirmation_approved' : 'pickup_confirmation_denied',
        title: status === 'approved' ? 'Proxy Pickup Approved' : 'Proxy Pickup Denied',
        body: status === 'approved'
          ? 'The owner has confirmed the proxy pickup. You may release the item.'
          : 'The owner has denied the proxy pickup. Do not release the item.',
        report_id: data.report_id,
      })

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

