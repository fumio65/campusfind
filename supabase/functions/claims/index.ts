import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireUser } from '../_shared/requireUser.ts'


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
  // users.trust_score is mutated solely by the trg_apply_trust_score_event
  // trigger on trust_score_events (it clamps to [0, 200] itself) - this is
  // only computed to record an accurate score_after on the event row, not
  // applied directly, or the delta would double-apply.
  const newScore = Math.max(0, Math.min(200, (user.trust_score ?? 100) + delta))
  const { error } = await supabaseAdmin.from('trust_score_events').insert({
    user_id: userId,
    delta,
    reason,
    score_after: newScore,
  })
  if (error) console.error('Failed to log trust_score_events:', JSON.stringify(error))
}

// Marker bodies the app sends for ISSC drop-off actions
// (app/src/shared/lib/operations/messages.js).
const DROPOFF_CHOSEN_BODY = '📍 ISSC_DROPOFF'
const DROPOFF_REQUESTED_BODY = '🔔 ISSC_DROPOFF_REQUESTED'
const DROPOFF_DECLINED_BODY = '🚫 ISSC_DROPOFF_DECLINED'

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
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
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
      // SECURITY FIX: anyone could send a "Someone found your item!"
      // notification to any reporter. The caller must be signed in and must
      // actually have a pending claim on the report.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { reportId } = await req.json()
      if (!reportId) {
        return new Response(JSON.stringify({ error: 'reportId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const { data: ownClaim } = await supabaseAdmin
        .from('claims')
        .select('id')
        .eq('report_id', reportId)
        .eq('claimant_id', caller.id)
        .eq('status', 'pending')
        .maybeSingle()
      if (!ownClaim) {
        return new Response(JSON.stringify({ error: 'No pending claim by you on this report.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
      // SECURITY FIX: this handler previously approved/rejected claims for
      // ANY caller, unauthenticated - verify_jwt was false and there was no
      // ownership check, so anyone could self-approve their own claim on
      // any report. Only the reporter who owns the underlying report may
      // approve or reject a claim against it.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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

      const reporterId = (claim.reports as any)?.reporter_id
      if (caller.id !== reporterId) {
        return new Response(JSON.stringify({ error: 'Only the reporter may approve or reject this claim.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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

        // A rejected claim's photos aren't shown anywhere afterward (the
        // active-claim lookup used everywhere excludes rejected claims), so
        // there's nothing left that reads them - clean them up now instead
        // of leaving them in storage indefinitely.
        const { data: rejectedPhotos } = await supabaseAdmin
          .from('claim_photos')
          .select('storage_path')
          .eq('claim_id', claim.id)
        if (rejectedPhotos?.length) {
          // Claim photos live in the private claim-photos bucket.
          await supabaseAdmin.storage.from('claim-photos').remove(rejectedPhotos.map((p) => p.storage_path))
        }
        await supabaseAdmin.from('claim_photos').delete().eq('claim_id', claim.id)

        await adjustTrustScore(claimantId, -5, 'claim_rejected')
        const repeated = await checkRepeatedRejections(claimantId)
        if (repeated) await adjustTrustScore(claimantId, -5, 'repeat_rejections_30d')
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
      // SECURITY FIX: the sender and their role came from the request body,
      // so anyone could send message notifications on any claim. The sender
      // is now the signed-in caller, who must be the claimant or reporter.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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
      const isClaimant = caller.id === claim.claimant_id
      const isReporter = caller.id === (claim.reports as any)?.reporter_id
      if (!isClaimant && !isReporter) {
        return new Response(JSON.stringify({ error: 'Only the claimant or reporter can message on this claim.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const senderRole = isReporter ? 'reporter' : 'claimant'
      const reportTitle = (claim.reports as any)?.title ?? 'your item'
      const reportId = claim.report_id
      const recipientId = senderRole === 'reporter'
        ? claim.claimant_id
        : (claim.reports as any)?.reporter_id
      // The ISSC drop-off suggest/decline actions are sent as marker chat
      // messages; notifying them as a plain "New message" was misleading.
      // Read the caller's message from the database (never trust the body
      // sent in the request) and word the notification to match it.
      const { messageId } = await req.json().catch(() => ({}))
      let latest: { body: string } | null = null
      {
        let q = supabaseAdmin
          .from('claim_messages')
          .select('body')
          .eq('claim_id', claim.id)
          .eq('sender_id', caller.id)
        if (messageId) q = q.eq('id', messageId)
        const { data } = await q.order('created_at', { ascending: false }).limit(1)
        latest = data?.[0] ?? null
      }
      const who = senderRole === 'reporter' ? 'The reporter' : 'The finder'
      let note = {
        type: 'new_message',
        title: 'New message',
        body: `${who} sent a message about "${reportTitle}".`,
      }
      if (latest?.body === DROPOFF_REQUESTED_BODY) {
        note = {
          type: 'dropoff_suggested',
          title: 'ISSC drop-off suggested',
          body: `${who} suggested returning "${reportTitle}" through the ISSC office. Open the chat to accept or decline.`,
        }
      } else if (latest?.body === DROPOFF_DECLINED_BODY) {
        note = {
          type: 'dropoff_declined',
          title: 'ISSC drop-off declined',
          body: `${who} declined the ISSC drop-off for "${reportTitle}". Arrange the handoff in the chat.`,
        }
      } else if (latest?.body === DROPOFF_CHOSEN_BODY) {
        // The accepted drop-off is notified by the dropoff function.
        note = null as any
      }
      if (recipientId && note) {
        await notifyUser({
          userId: recipientId,
          ...note,
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
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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
      if (caller.id !== claim.claimant_id && caller.id !== (claim.reports as any)?.reporter_id) {
        return new Response(JSON.stringify({ error: 'Only the claimant or reporter can choose a drop-off.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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