import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/requireAdmin.ts'
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

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from('users').select('role').eq('id', userId).single()
  return data?.role === 'admin'
}

const forbidden = (corsHeaders: Record<string, string>, error: string, status = 403) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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
  const baseIndex = pathParts.indexOf('reports')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // GET /reports
    if (req.method === 'GET' && !id) {
      // FIX: this listing exposes reporter/claimant names, student IDs, and
      // private claim message bodies - admin-only, so require an admin JWT.
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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
        // FIX: search was interpolated raw into a PostgREST `.or()` filter
        // string, letting a crafted value (commas/parentheses) inject extra
        // filter clauses. PostgREST treats a double-quoted value as a single
        // opaque literal, so quoting it (after escaping embedded backslashes
        // and quotes) closes that off while keeping the ilike wildcard match.
        const escaped = search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        const safe = `"%${escaped}%"`
        query = query.or(`title.ilike.${safe},location.ilike.${safe}`)
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
      // SECURITY FIX: this route had no auth check, so anyone could close any
      // report and award +5 trust score. Only the report's reporter or an
      // admin may resolve it, and only once.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { resolvedVia, verifiedStudentId, notes, isProxy, proxyStudentId } = await req.json()

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id, title, status, type, reporter_id, walkin_finder_ref, claims(id, claimant_id, status)')
        .eq('id', id)
        .single()

      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const callerIsAdmin = await isAdmin(caller.id)
      if (report.reporter_id !== caller.id && !callerIsAdmin) {
        return forbidden(corsHeaders, 'Only the reporter or an admin can resolve this report.')
      }

      if (report.status === 'resolved') {
        return forbidden(corsHeaders, 'Report is already resolved.', 409)
      }

      // Walk-in items are claimed in person at the ISSC office: the admin
      // checks the owner's school ID and releases the item. Previously the
      // admin dashboard only offered this once a walk-in was 'approved',
      // which never happens (nobody files an app claim on a walk-in), so
      // walk-ins could never be closed. The ID the admin verified must be a
      // real student account, and who collected it is now recorded.
      const isWalkIn = report.type === 'found_walkin'
      const now = new Date().toISOString()
      const sid = String(verifiedStudentId ?? '').trim()
      let collector: { id: string, first_name: string, last_name: string, student_id: string } | null = null
      if (isWalkIn) {
        if (!callerIsAdmin) {
          return forbidden(corsHeaders, 'Only the ISSC office can release a walk-in item.')
        }
        if (!sid) {
          return forbidden(corsHeaders, "Verify the owner's student ID before releasing the item.", 400)
        }
      }
      if (sid && callerIsAdmin) {
        const { data } = await supabaseAdmin
          .from('users')
          .select('id, first_name, last_name, student_id')
          .eq('student_id', sid)
          .eq('role', 'student')
          .maybeSingle()
        collector = data as any
        if (isWalkIn && !collector) {
          return forbidden(corsHeaders, `No student account matches ${sid}.`, 400)
        }
      }

      const update: Record<string, unknown> = {
        status: 'resolved',
        resolved_via: isWalkIn ? 'issc_walkin_pickup' : (resolvedVia ?? 'handoff'),
        resolved_at: now,
      }
      if (callerIsAdmin && sid) {
        update.handoff_record = {
          collected_by_student_id: sid,
          collected_by_user_id: collector?.id ?? null,
          collected_by_name: collector ? `${collector.first_name} ${collector.last_name}` : null,
          is_proxy: !!isProxy,
          proxy_student_id: isProxy ? (proxyStudentId ?? null) : null,
          notes: typeof notes === 'string' && notes.trim() ? notes.trim().slice(0, 500) : null,
          recorded_by: caller.id,
          recorded_at: now,
        }
      }
      if (isWalkIn) {
        update.walkin_pickup_verified_by = caller.id
        update.walkin_pickup_verified_at = now
      }

      await supabaseAdmin.from('reports').update(update).eq('id', id)

      if (isWalkIn && collector) {
        await notifyUser({
          userId: collector.id,
          type: 'walkin_collected',
          title: 'Item collected from ISSC',
          body: `You collected "${report.title}" from the ISSC office. Thank you for using CampusFind!`,
          reportId: id,
        })
        if (report.walkin_finder_ref) {
          const { data: finder } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('student_id', report.walkin_finder_ref)
            .maybeSingle()
          if (finder && finder.id !== collector.id) {
            await notifyUser({
              userId: finder.id,
              type: 'walkin_returned',
              title: 'The item you turned in was returned',
              body: `"${report.title}" has been collected by its owner. Thank you for your honesty!`,
              reportId: id,
            })
          }
        }
      }

      const approvedClaim = (report.claims as any[])?.find((c: any) => c.status === 'approved')
      if (approvedClaim) {
        await supabaseAdmin.from('claims').update({ status: 'resolved' }).eq('id', approvedClaim.id)
        await adjustTrustScore(approvedClaim.claimant_id, 5, 'claim_approved_handoff_completed')
        await notifyUser({
          userId: approvedClaim.claimant_id,
          type: 'claim_resolved',
          title: 'Item returned! +5 Trust Score',
          body: `The reporter confirmed they got "${report.title}" back. Thank you for your honesty! You earned +5 trust score.`,
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
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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
        .eq('role', 'admin')
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
        await adjustTrustScore(finder.id, 5, 'issc_dropoff_returned')
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
      // SECURITY FIX: admin-only - anyone could award +5 trust score to any
      // student ID.
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

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
        await adjustTrustScore(finder.id, 5, 'issc_dropoff_returned')
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
      // SECURITY FIX: anyone could send a notification about any report to
      // every student. Only the report's reporter or an admin may announce
      // it, and each report is announced only once.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('id, title, category, location, reporter_id')
        .eq('id', id)
        .single()

      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (report.reporter_id !== caller.id && !(await isAdmin(caller.id))) {
        return forbidden(corsHeaders, 'Only the reporter or an admin can announce this report.')
      }

      const { count: alreadyAnnounced } = await supabaseAdmin
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', id)
        .eq('type', 'new_report')
      if ((alreadyAnnounced ?? 0) > 0) {
        return new Response(JSON.stringify({ ok: true, alreadyAnnounced: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'student')
        .eq('status', 'active')

      for (const user of users ?? []) {
        if ((user as any).id === (report as any).reporter_id) continue
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

    // POST /reports/admin-notify - called by the reporting student right
    // after a new report is created, so it needs requireUser (any signed-in
    // student), not requireAdmin.
    //
    // FIX: this route previously called requireAdmin (which a reporting
    // student fails, so the call 403'd and was never retried) and wrote
    // through notifyUser() into user_notifications - a per-user, student-
    // facing table the admin bell never reads. The admin dashboard's bell
    // (NotificationBell.jsx) reads the shared `notifications` table, the
    // same one dropoff/claim events already write to, so new reports now go
    // there too - one row admins all see, not one row per admin.
    if (req.method === 'POST' && id === 'admin-notify') {
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { reportId, reportTitle } = await req.json()
      if (!reportId) {
        return new Response(JSON.stringify({ error: 'reportId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: notifyError } = await supabaseAdmin.from('notifications').insert({
        type: 'new_report',
        title: 'New lost item report',
        body: `Someone lost a ${reportTitle ?? 'item'}. Can you help match it to a claim?`,
        report_id: reportId,
        read: false,
      })
      if (notifyError) console.error('[reports] admin-notify insert failed:', notifyError)

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