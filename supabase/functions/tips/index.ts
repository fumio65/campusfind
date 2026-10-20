import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireUser } from '../_shared/requireUser.ts'


const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

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

async function notifyUser({ userId, type, title, body, reportId = null, claimId = null, tipId = null }: {
  userId: string
  type: string
  title: string
  body: string
  reportId?: string | null
  claimId?: string | null
  tipId?: string | null
}) {
  if (!userId) return
  await supabaseAdmin.from('user_notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    report_id: reportId,
    claim_id: claimId,
    tip_id: tipId,
  })
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('tips')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // PATCH /tips/:id/credit
    if (req.method === 'PATCH' && id && action === 'credit') {
      // SECURITY FIX (Strix WEB-02): this route had no auth check and took the
      // user to reward and the report to resolve from the request body, so
      // anyone could grant trust score to any account or close any report.
      // Now only the signed-in reporter of the tip's report can credit it,
      // and the tip author and report are read from the database.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { resolveReport } = await req.json().catch(() => ({}))

      const { data: tip } = await supabaseAdmin
        .from('tips')
        .select('id, user_id, report_id, credited_for_recovery, reports(title, reporter_id)')
        .eq('id', id)
        .single()

      if (!tip) {
        return new Response(JSON.stringify({ error: 'Tip not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if ((tip.reports as any)?.reporter_id !== caller.id) {
        return new Response(JSON.stringify({ error: 'Only the reporter can credit a tip on this report.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (tip.user_id === caller.id) {
        return new Response(JSON.stringify({ error: 'You cannot credit your own tip.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Already credited: don't award the +2 a second time.
      if (tip.credited_for_recovery) {
        return new Response(JSON.stringify({ ok: true, alreadyCredited: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const userId = tip.user_id
      const reportId = tip.report_id

      // FIX: the tips table has no "credited" column - it's
      // "credited_for_recovery" - so this update was silently failing (error
      // not checked) and credited_for_recovery was never actually set.
      const { error: creditError } = await supabaseAdmin
        .from('tips')
        .update({ credited_for_recovery: true })
        .eq('id', id)
      if (creditError) console.error('Failed to mark tip as credited:', creditError.message)

      await adjustTrustScore(userId, 2, 'tip_credited')
      await notifyUser({
        userId,
        type: 'tip_credited',
        title: 'Your tip helped! +2 Trust Score',
        body: `The reporter confirmed your tip helped recover "${(tip.reports as any)?.title ?? 'an item'}". You earned +2 trust score.`,
        reportId,
        tipId: id,
      })

      if (resolveReport === true || resolveReport === 'true') {
        await supabaseAdmin
          .from('reports')
          .update({ status: 'resolved', resolved_via: 'tip_credited', resolved_at: new Date().toISOString() })
          .eq('id', reportId)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /tips/notify
    if (req.method === 'POST' && id === 'notify') {
      // SECURITY FIX (Strix WEB-02): anyone could trigger notification spam to
      // a report's reporter and tippers. Now the caller must be the signed-in
      // author of the tip being announced, the tip details are read from the
      // database, and each tip is announced only once.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { tipId } = await req.json()
      if (!tipId) {
        return new Response(JSON.stringify({ error: 'tipId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: tip } = await supabaseAdmin
        .from('tips')
        .select('id, user_id, report_id, parent_tip_id')
        .eq('id', tipId)
        .single()

      if (!tip) {
        return new Response(JSON.stringify({ error: 'Tip not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (tip.user_id !== caller.id) {
        return new Response(JSON.stringify({ error: 'Only the tip author can send its notifications.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { count: alreadySent } = await supabaseAdmin
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('tip_id', tipId)
      if ((alreadySent ?? 0) > 0) {
        return new Response(JSON.stringify({ ok: true, alreadySent: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const reportId = tip.report_id
      const tipAuthorId = tip.user_id
      const parentTipId = tip.parent_tip_id

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

      const recipients = new Set<string>()

      if (parentTipId) {
        // Reply — notify parent tip author and reporter and all previous tippers
        const { data: parentTip } = await supabaseAdmin
          .from('tips')
          .select('user_id')
          .eq('id', parentTipId)
          .single()
        if (parentTip?.user_id) recipients.add(parentTip.user_id)
        if (report.reporter_id) recipients.add(report.reporter_id)
        const { data: previousTippers } = await supabaseAdmin
          .from('tips')
          .select('user_id')
          .eq('report_id', reportId)
        for (const tipper of previousTippers ?? []) {
          if (tipper.user_id) recipients.add(tipper.user_id)
        }
      } else {
        // Top-level tip — notify reporter and all previous tippers
        if (report.reporter_id) recipients.add(report.reporter_id)
        const { data: previousTippers } = await supabaseAdmin
          .from('tips')
          .select('user_id')
          .eq('report_id', reportId)
        for (const tipper of previousTippers ?? []) {
          if (tipper.user_id) recipients.add(tipper.user_id)
        }
      }

      recipients.delete(tipAuthorId)

      for (const userId of recipients) {
        const isReporter = userId === report.reporter_id
        if (parentTipId) {
          await notifyUser({
            userId,
            type: 'tip_reply',
            title: 'New reply on a tip',
            body: `Someone replied to a tip on "${report.title}".`,
            reportId,
            tipId: tipId ?? null,
          })
        } else {
          await notifyUser({
            userId,
            type: 'tip_submitted',
            title: isReporter ? 'New tip on your report' : 'New tip on a report',
            body: isReporter
              ? `Someone left a tip on "${report.title}".`
              : `A new tip was left on "${report.title}".`,
            reportId,
            tipId: tipId ?? null,
          })
        }
      }

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
