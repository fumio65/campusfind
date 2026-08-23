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

async function notifyUser({ userId, type, title, body, reportId = null, claimId = null }: {
  userId: string
  type: string
  title: string
  body: string
  reportId?: string | null
  claimId?: string | null
}) {
  if (!userId) return
  await supabaseAdmin.from('user_notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    report_id: reportId,
    claim_id: claimId,
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('dropoff')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // POST /dropoff — claimant creates drop-off request
    if (req.method === 'POST' && !id) {
      const { reportId, claimId, claimantId, reporterId } = await req.json()
      if (!reportId || !claimId || !claimantId || !reporterId) {
        return new Response(JSON.stringify({ error: 'reportId, claimId, claimantId and reporterId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('title')
        .eq('id', reportId)
        .single()

      // Check if a pending request already exists
      const { data: existing } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id')
        .eq('report_id', reportId)
        .eq('status', 'pending')
        .maybeSingle()

      if (existing) {
        return new Response(JSON.stringify({ ok: true, id: existing.id, existing: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: request, error } = await supabaseAdmin
        .from('dropoff_requests')
        .insert({
          report_id: reportId,
          claim_id: claimId,
          claimant_id: claimantId,
          reporter_id: reporterId,
          status: 'pending',
        })
        .select()
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Notify all admins
      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('is_admin', true)

      for (const admin of admins ?? []) {
        await notifyUser({
          userId: admin.id,
          type: 'dropoff_request',
          title: 'New drop-off request',
          body: `A finder is dropping off "${report?.title ?? 'an item'}" at the ISSC office.`,
          reportId,
          claimId,
        })
      }

      return new Response(JSON.stringify({ ok: true, id: request.id }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // GET /dropoff — admin lists all drop-off requests
    if (req.method === 'GET' && !id) {
      const status = url.searchParams.get('status')

      let query = supabaseAdmin
        .from('dropoff_requests')
        .select(`
          id, status, drop_off_photo_path, created_at, updated_at,
          report_id, claim_id, claimant_id, reporter_id,
          reports(title, category),
          claimant:users!dropoff_requests_claimant_id_fkey(first_name, last_name, student_id),
          reporter:users!dropoff_requests_reporter_id_fkey(first_name, last_name, student_id)
        `)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data ?? []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /dropoff/:id/receive — admin marks item as received + uploads photo
    if (req.method === 'PATCH' && id && action === 'receive') {
      const { photoPath } = await req.json()
      if (!photoPath) {
        return new Response(JSON.stringify({ error: 'photoPath required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: request } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id, report_id, claim_id, reporter_id, reports(title)')
        .eq('id', id)
        .single()

      if (!request) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin
        .from('dropoff_requests')
        .update({
          status: 'received',
          drop_off_photo_path: photoPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      // Notify reporter — item is at ISSC ready for pickup
      await notifyUser({
        userId: request.reporter_id,
        type: 'dropoff_received',
        title: 'Your item is at the ISSC office',
        body: `"${(request.reports as any)?.title ?? 'Your item'}" has been dropped off at the ISSC office and is ready for pickup.`,
        reportId: request.report_id,
        claimId: request.claim_id,
      })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /dropoff/:id/pickup — admin confirms reporter picked up item, resolve report
    if (req.method === 'PATCH' && id && action === 'pickup') {
      const { data: request } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id, report_id, claim_id, reporter_id, claimant_id, reports(title)')
        .eq('id', id)
        .single()

      if (!request) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Mark dropoff request as resolved
      await supabaseAdmin
        .from('dropoff_requests')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', id)

      // Resolve the report
      await supabaseAdmin
        .from('reports')
        .update({ status: 'resolved', resolved_via: 'issc_dropoff' })
        .eq('id', request.report_id)

      // Resolve the claim
      await supabaseAdmin
        .from('claims')
        .update({ status: 'resolved' })
        .eq('id', request.claim_id)

      // Give claimant +5 trust score for returning item
      const { data: claimant } = await supabaseAdmin
        .from('users')
        .select('trust_score')
        .eq('id', request.claimant_id)
        .single()

      if (claimant) {
        const newScore = Math.max(0, Math.min(200, (claimant.trust_score ?? 100) + 5))
        await supabaseAdmin
          .from('users')
          .update({ trust_score: newScore })
          .eq('id', request.claimant_id)
      }

      // Notify reporter
      await notifyUser({
        userId: request.reporter_id,
        type: 'report_resolved',
        title: 'Item recovered!',
        body: `"${(request.reports as any)?.title ?? 'Your item'}" has been marked as resolved. Thank you for using CampusFind!`,
        reportId: request.report_id,
        claimId: request.claim_id,
      })

      // Notify claimant
      await notifyUser({
        userId: request.claimant_id,
        type: 'dropoff_resolved',
        title: 'Drop-off complete! +5 Trust Score',
        body: `The item has been collected by the reporter. Thank you for your honesty! +5 trust score.`,
        reportId: request.report_id,
        claimId: request.claim_id,
      })

      return new Response(JSON.stringify({ ok: true }), {
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
