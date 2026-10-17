import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireUser } from '../_shared/requireUser.ts'


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
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
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
      // SECURITY FIX: this handler previously had no auth check at all and
      // blindly trusted a client-supplied reporterId - anyone could create
      // a confirmation request "on behalf of" any reporter they chose,
      // including one not their own. Now the caller must be logged in, and
      // the reporter identity is taken from the report itself.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { reportId, proxyName, proxyStudentId } = await req.json()
      if (!reportId || !proxyName || !proxyStudentId) {
        return new Response(JSON.stringify({ error: 'reportId, proxyName, and proxyStudentId are required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('reporter_id')
        .eq('id', reportId)
        .single()
      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (report.reporter_id !== caller.id) {
        return new Response(JSON.stringify({ error: 'Only the report\'s reporter may create a confirmation request for it.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const reporterId = caller.id

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
      // SECURITY FIX: this handler previously had no ownership check -
      // verify_jwt=true only proves someone is logged in, not that they're
      // this report's reporter, so any authenticated user could read
      // another reporter's pending proxy-pickup request (proxy's name +
      // student ID). Require a valid session and scope the query to rows
      // this caller actually owns.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { data, error } = await supabaseAdmin
        .from('confirmation_requests')
        .select('*')
        .eq('report_id', id)
        .eq('reporter_id', caller.id)
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
      // SECURITY FIX: this handler previously let ANY caller approve a
      // proxy pickup - unauthenticated, no check that the caller was the
      // reporter who actually owns this confirmation request. That meant
      // an attacker could self-authorize releasing a physical item to a
      // proxy of their own choosing. Only the reporter the request was
      // created for may respond to it.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('confirmation_requests')
        .select('reporter_id')
        .eq('id', id)
        .single()
      if (fetchError || !existing) {
        return new Response(JSON.stringify({ error: 'Confirmation request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (caller.id !== existing.reporter_id) {
        return new Response(JSON.stringify({ error: 'Only the reporter may respond to this confirmation request.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

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

