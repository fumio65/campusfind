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

// FIX: now inserts into trust_score_events with score_after so history is trackable
async function adjustTrustScore(userId: string, delta: number, reason: string) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('trust_score')
    .eq('id', userId)
    .single()
  if (!user) return
  const newScore = Math.max(0, Math.min(200, (user.trust_score ?? 100) + delta))
  await supabaseAdmin.from('users').update({ trust_score: newScore }).eq('id', userId)
  await supabaseAdmin.from('trust_score_events').insert({
    user_id: userId,
    delta,
    reason,
    score_after: newScore,
  })
}

async function checkRepeatedRejections(userId: string): Promise<boolean> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('claimant_id', userId)
    .eq('status', 'rejected')
    .gte('created_at', thirtyDaysAgo)
  return (count ?? 0) >= 3
}

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
  const baseIndex = pathParts.indexOf('claims')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // POST /claims
    if (req.method === 'POST' && !id) {
      const { reportId, claimantId } = await req.json()
      if (!reportId || !claimantId) {
        return new Response(JSON.stringify({ error: 'reportId and claimantId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('title, reporter_id')
        .eq('id', reportId)
        .single()
      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await notifyUser({
        userId: report.reporter_id,
        type: 'claim_submitted',
        title: 'Someone found your item!',
        body: `A claim has been submitted on "${report.title}". Review it and approve or reject.`,
        reportId,
      })
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /claims/:id
    if (req.method === 'PATCH' && id && !action) {
      const { action: claimAction } = await req.json()
      if (!['approve', 'reject'].includes(claimAction)) {
        return new Response(JSON.stringify({ error: 'action must be approve or reject' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: claim } = await supabaseAdmin
        .from('claims')
        .select('id, claimant_id, report_id, reports(title, reporter_id)')
        .eq('id', id)
        .single()
      if (!claim) {
        return new Response(JSON.stringify({ error: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const reportTitle = (claim.reports as any)?.title ?? 'your item'
      const claimantId = claim.claimant_id
      const reportId = claim.report_id

      if (claimAction === 'approve') {
        await supabaseAdmin.from('claims').update({ status: 'approved' }).eq('id', claim.id)
        await supabaseAdmin.from('reports').update({ status: 'approved' }).eq('id', reportId)
        await notifyUser({
          userId: claimantId,
          type: 'claim_approved',
          title: 'Claim approved!',
          body: `Your claim on "${reportTitle}" was approved. Arrange handoff with the reporter.`,
          reportId,
          claimId: claim.id,
        })
      } else {
        await supabaseAdmin.from('claims').update({ status: 'rejected' }).eq('id', claim.id)
        await supabaseAdmin.from('reports').update({
          status: 'open',
          had_rejected_claim: true,
          last_rejected_claimant_id: claimantId,
        }).eq('id', reportId)
        await adjustTrustScore(claimantId, -5, 'claim_rejected')
        const repeated = await checkRepeatedRejections(claimantId)
        if (repeated) await adjustTrustScore(claimantId, -5, 'multiple_rejections')
        await notifyUser({
          userId: claimantId,
          type: 'claim_rejected',
          title: 'Claim not approved',
          body: `Your claim on "${reportTitle}" was declined. The item is open for new claims.`,
          reportId,
          claimId: claim.id,
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /claims/:id/message
    if (req.method === 'POST' && id && action === 'message') {
      const { senderId, senderRole } = await req.json()
      if (!senderId || !senderRole) {
        return new Response(JSON.stringify({ error: 'senderId and senderRole required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: claim } = await supabaseAdmin
        .from('claims')
        .select('id, claimant_id, report_id, reports(title, reporter_id)')
        .eq('id', id)
        .single()
      if (!claim) {
        return new Response(JSON.stringify({ error: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const reportTitle = (claim.reports as any)?.title ?? 'your item'
      const reportId = claim.report_id
      const recipientId = senderRole === 'reporter'
        ? claim.claimant_id
        : (claim.reports as any)?.reporter_id
      if (recipientId) {
        await notifyUser({
          userId: recipientId,
          type: 'new_message',
          title: 'New message',
          body: `${senderRole === 'reporter' ? 'The reporter' : 'The finder'} sent a message about "${reportTitle}".`,
          reportId,
          claimId: claim.id,
        })
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /claims/:id/dropoff
    if (req.method === 'POST' && id && action === 'dropoff') {
      const { data: claim } = await supabaseAdmin
        .from('claims')
        .select('id, claimant_id, report_id, reports(title, reporter_id)')
        .eq('id', id)
        .single()
      if (!claim) {
        return new Response(JSON.stringify({ error: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      await supabaseAdmin.from('reports').update({ drop_off_chosen: true }).eq('id', claim.report_id)
      await notifyUser({
        userId: (claim.reports as any)?.reporter_id,
        type: 'dropoff_chosen',
        title: 'Finder chose ISSC drop-off',
        body: `The finder will drop off "${(claim.reports as any)?.title ?? 'your item'}" at the ISSC office.`,
        reportId: claim.report_id,
        claimId: claim.id,
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