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

async function adjustTrustScore(userId: string, delta: number, reason: string) {
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('trust_score')
    .eq('id', userId)
    .single()
  if (!user) return
  const newScore = Math.max(0, Math.min(200, (user.trust_score ?? 100) + delta))
  await supabaseAdmin.from('users').update({ trust_score: newScore }).eq('id', userId)
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
      const { userId, reportId, resolveReport } = await req.json()
      if (!userId || !reportId) {
        return new Response(JSON.stringify({ error: 'userId and reportId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: tip } = await supabaseAdmin
        .from('tips')
        .select('id, user_id, report_id, reports(title)')
        .eq('id', id)
        .single()

      if (!tip) {
        return new Response(JSON.stringify({ error: 'Tip not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin.from('tips').update({ credited: true }).eq('id', id)
      await adjustTrustScore(userId, 2, 'tip credited with helping recover an item')
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
          .update({ status: 'resolved', resolved_via: 'tip_credited' })
          .eq('id', reportId)
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /tips/notify
    if (req.method === 'POST' && id === 'notify') {
      const { reportId, tipAuthorId, parentTipId, tipId } = await req.json()
      if (!reportId || !tipAuthorId) {
        return new Response(JSON.stringify({ error: 'reportId and tipAuthorId required' }), {
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
