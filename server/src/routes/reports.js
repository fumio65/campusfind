import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { adjustTrustScore } from '../lib/trustScore.js'

const router = Router()

// GET /reports?status=all&limit=50&offset=0&search=
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200)
  const offset = parseInt(req.query.offset) || 0
  const status = req.query.status || 'all'
  const search = (req.query.search ?? '').trim()

  let query = supabaseAdmin
    .from('reports')
    .select(`
      id, type, title, location, status, created_at, resolved_via,
      had_rejected_claim, last_rejected_claimant_id,
      reporter:users!reports_reporter_id_fkey(id, first_name, last_name, student_id),
      claims(id, status, claimant_id,
        claimant:users!claims_claimant_id_fkey(first_name, last_name, student_id),
        claim_messages(id, body, created_at)
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status !== 'all') {
    query = query.eq('status', status)
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,location.ilike.%${search}%`)
  }

  const { data, error, count } = await query
  if (error) return res.status(500).json({ error: error.message })

  // Fetch proxy requests separately
  const reportIds = data.map((r) => r.id)
  const { data: proxyRequests } = await supabaseAdmin
    .from('proxy_requests')
    .select('*')
    .in('report_id', reportIds)
    .order('created_at', { ascending: false })

  // Build proxy map: report_id -> latest proxy request
  const proxyMap = {}
  for (const pr of proxyRequests ?? []) {
    if (!proxyMap[pr.report_id]) proxyMap[pr.report_id] = pr
  }

  // Flag reports where drop-off was chosen (message starts with 📍)
  const reports = data.map((r) => {
    const activeClaim = r.claims?.find((c) => ['pending', 'approved'].includes(c.status))
    const dropOffChosen = activeClaim?.claim_messages?.some((m) => m.body?.startsWith('📍')) ?? false
    return {
      ...r,
      reporter_name: r.reporter ? `${r.reporter.first_name} ${r.reporter.last_name}` : 'ISSC admin',
      reporter_student_id: r.reporter?.student_id,
      active_claim: activeClaim ? {
        id: activeClaim.id,
        status: activeClaim.status,
        claimant_name: activeClaim.claimant
          ? `${activeClaim.claimant.first_name} ${activeClaim.claimant.last_name}`
          : null,
        claimant_student_id: activeClaim.claimant?.student_id,
        drop_off_chosen: dropOffChosen,
      } : null,
      proxy_request: proxyMap[r.id] ?? null,
    }
  })

  res.json({ reports, total: count, limit, offset })
})

// PATCH /reports/:id/resolve — admin force-resolves a report
router.patch('/:id/resolve', async (req, res) => {
  const { id } = req.params
  const { resolvedVia = 'issc_walkin_pickup', verifiedStudentId, notes } = req.body

  const updateData = {
    status: 'resolved',
    resolved_via: resolvedVia,
  }

  if (verifiedStudentId) {
    updateData.handoff_record = {
      verified_student_id: verifiedStudentId,
      notes: notes ?? '',
      resolved_at: new Date().toISOString(),
    }
  }

  const { data, error } = await supabaseAdmin
    .from('reports')
    .update(updateData)
    .eq('id', id)
    .select('id, status, resolved_via')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Trust score: +5 for handoff completed
  // Find the claimant of the approved claim
  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('claimant_id')
    .eq('report_id', id)
    .eq('status', 'approved')
    .maybeSingle()

  if (claim?.claimant_id) {
    const reason = resolvedVia === 'issc_dropoff'
      ? 'item returned via ISSC drop-off'
      : 'claim approved and handoff completed'
    await adjustTrustScore(claim.claimant_id, 5, reason)
  }

  res.json(data)
})

// POST /reports/:id/announce — notify all users about a new report
router.post('/:id/announce', async (req, res) => {
  const { reporterId, title, location, category } = req.body

  // Get all users except the reporter
  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id')
    .neq('id', reporterId)
    .eq('role', 'student')

  if (!users?.length) return res.json({ ok: true })

  // Batch insert notifications
  const notifications = users.map((u) => ({
    user_id: u.id,
    type: 'new_report',
    title: `New lost item: ${title}`,
    body: `Someone lost ${category ? `a ${category.toLowerCase()}` : 'an item'}${location ? ` near ${location}` : ''}. Can you help?`,
    report_id: req.params.id,
  }))

  // Insert in batches of 100 to avoid payload limits
  for (let i = 0; i < notifications.length; i += 100) {
    await supabaseAdmin.from('user_notifications').insert(notifications.slice(i, i + 100))
  }

  res.json({ ok: true })
})

export default router