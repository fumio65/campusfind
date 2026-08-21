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
  const baseIndex = pathParts.indexOf('reports')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // GET /reports
    if (req.method === 'GET' && !id) {
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200)
      const offset = parseInt(url.searchParams.get('offset') ?? '0')
      const status = url.searchParams.get('status') ?? 'all'
      const search = (url.searchParams.get('search') ?? '').trim()

      let query = supabaseAdmin
        .from('reports')
        .select(`
          id, type, title, description, category, location, status, created_at, resolved_via,
          had_rejected_claim, last_rejected_claimant_id, walkin_finder_ref,
          reporter:users!reports_reporter_id_fkey(id, first_name, last_name, student_id),
          claims(id, status, claimant_id,
            claimant:users!claims_claimant_id_fkey(first_name, last_name, student_id),
            claim_messages(id, body, created_at)
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (status !== 'all') {
        const statuses = status.split(',').map((s: string) => s.trim())
        if (statuses.length === 1) {
          query = query.eq('status', statuses[0])
        } else {
          query = query.in('status', statuses)
        }
      }

      if (search) {
        query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`)
      }

      const { data, error, count } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const reportIds = (data ?? []).map((r: any) => r.id)
      const { data: proxyRequests } = await supabaseAdmin
        .from('proxy_requests')
        .select('*')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false })

      const proxyMap: Record<string, any> = {}
      for (const pr of proxyRequests ?? []) {
        if (!proxyMap[pr.report_id]) proxyMap[pr.report_id] = pr
      }

      const reports = (data ?? []).map((r: any) => {
        const activeClaim = r.claims?.find((c: any) => ['pending', 'approved'].includes(c.status))
        const dropOffChosen = activeClaim?.claim_messages?.some((m: any) => m.body?.startsWith('📍')) ?? false
        return {
          ...r,
          reporter_name: r.reporter ? `${r.reporter.first_name} ${r.reporter.last_name}` : 'ISSC admin',
          active_claim: activeClaim ? { ...activeClaim, drop_off_chosen: dropOffChosen } : null,
          proxy_request: proxyMap[r.id] ?? null,
        }
      })

      return new Response(JSON.stringify({ reports, total: count ?? 0, limit, offset }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /reports/:id/resolve
    if (req.method === 'PATCH' && id && action === 'resolve') {
      const { resolvedVia } = await req.json()

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id, title, reporter_id, claims(id, claimant_id, status)')
        .eq('id', id)
        .single()

      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin
        .from('reports')
        .update({ status: 'resolved', resolved_via: resolvedVia ?? 'handoff' })
        .eq('id', id)

      const approvedClaim = (report.claims as any[])?.find((c: any) => c.status === 'approved')
      if (approvedClaim) {
        await supabaseAdmin.from('claims').update({ status: 'resolved' }).eq('id', approvedClaim.id)
        await adjustTrustScore(approvedClaim.claimant_id, 5, 'claim approved and handoff completed')
        await notifyUser({
          userId: approvedClaim.claimant_id,
          type: 'claim_resolved',
          title: 'Item recovered!',
          body: `"${report.title}" has been marked as recovered. Thank you for your honesty! +5 trust score.`,
          reportId: id,
          claimId: approvedClaim.id,
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /reports/walkin
    if (req.method === 'POST' && id === 'walkin') {
      const body = await req.json()
      const { title, description, location, category, finderStudentId, photoStoragePaths } = body

      if (!title || !finderStudentId) {
        return new Response(JSON.stringify({ error: 'title and finderStudentId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: adminUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('is_admin', true)
        .single()

      if (!adminUser) {
        return new Response(JSON.stringify({ error: 'Admin user not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: report, error: reportError } = await supabaseAdmin
        .from('reports')
        .insert({
          title, description, location, category,
          status: 'open',
          type: 'found_walkin',
          reporter_id: adminUser.id,
          walkin_finder_ref: finderStudentId,
        })
        .select()
        .single()

      if (reportError || !report) {
        return new Response(JSON.stringify({ error: 'Failed to create report' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (photoStoragePaths?.length) {
        const photoRows = photoStoragePaths.map((path: string, i: number) => ({
          report_id: report.id,
          storage_path: path,
          position: i,
        }))
        await supabaseAdmin.from('report_photos').insert(photoRows)
      }

      const { data: finder } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name')
        .eq('student_id', finderStudentId)
        .maybeSingle()

      if (finder) {
        await adjustTrustScore(finder.id, 5, 'item returned via ISSC drop-off')
        await notifyUser({
          userId: finder.id,
          type: 'walkin_registered',
          title: 'Thank you for returning a lost item! +5 Trust Score',
          body: `Your drop-off of "${title}" has been registered. You earned +5 trust score.`,
          reportId: report.id,
        })
      }

      return new Response(JSON.stringify({ ok: true, reportId: report.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /reports/:id/credit-finder
    if (req.method === 'POST' && id && action === 'credit-finder') {
      const { finderStudentId } = await req.json()

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id, title')
        .eq('id', id)
        .single()

      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: finder } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('student_id', finderStudentId)
        .maybeSingle()

      if (finder) {
        await adjustTrustScore(finder.id, 5, 'item returned via ISSC drop-off')
        await notifyUser({
          userId: finder.id,
          type: 'walkin_registered',
          title: 'Thank you for returning a lost item! +5 Trust Score',
          body: `Your drop-off of "${report.title}" has been registered. You earned +5 trust score.`,
          reportId: id,
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /reports/:id/announce
    if (req.method === 'POST' && id && action === 'announce') {
      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id, title, category, location')
        .eq('id', id)
        .single()

      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'student')
        .eq('status', 'active')

      for (const user of users ?? []) {
        await notifyUser({
          userId: (user as any).id,
          type: 'new_report',
          title: `New lost item: ${report.title}`,
          body: `Someone lost a ${(report as any).category ?? 'item'}${(report as any).location ? ` near ${(report as any).location}` : ''}. Can you help?`,
          reportId: id,
        })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /reports/admin-notify
    if (req.method === 'POST' && id === 'admin-notify') {
      const { reportId, reportTitle } = await req.json()

      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('is_admin', true)

      for (const admin of admins ?? []) {
        await notifyUser({
          userId: (admin as any).id,
          type: 'new_report',
          title: 'New lost item report',
          body: `Someone lost a ${reportTitle}. Can you help?`,
          reportId,
        })
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
