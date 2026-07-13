import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { notifyUser } from '../lib/notifyUser.js'

const router = Router()

// POST /confirmation — admin requests owner confirmation
router.post('/', async (req, res) => {
  const { reportId, reporterId, proxyName, proxyStudentId } = req.body

  if (!reportId || !reporterId || !proxyName || !proxyStudentId) {
    return res.status(400).json({ error: 'reportId, reporterId, proxyName, and proxyStudentId are required.' })
  }

  // Cancel any existing pending confirmation for this report
  await supabaseAdmin
    .from('confirmation_requests')
    .update({ status: 'denied', responded_at: new Date().toISOString() })
    .eq('report_id', reportId)
    .eq('status', 'pending')

  // Create new confirmation request
  const { data, error } = await supabaseAdmin
    .from('confirmation_requests')
    .insert({
      report_id: reportId,
      reporter_id: reporterId,
      proxy_name: proxyName,
      proxy_student_id: proxyStudentId,
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Notify admin notification bell
  await supabaseAdmin.from('notifications').insert({
    type: 'pickup_confirmation_request',
    title: 'Confirm Proxy Pickup',
    body: `Someone is at the ISSC office to pick up your item. Please confirm that ${proxyName} (${proxyStudentId}) is authorized to collect it on your behalf.`,
    report_id: reportId,
  })

  // Notify reporter via in-app user notifications
  await notifyUser({
    userId: reporterId,
    type: 'pickup_confirmation_request',
    title: 'Action required — Proxy pickup',
    body: `Someone is at the ISSC office claiming to pick up your item. Confirm if ${proxyName} (${proxyStudentId}) is authorized.`,
    reportId,
  })

  res.status(201).json(data)
})

// GET /confirmation/:reportId — get latest confirmation request for a report
router.get('/:reportId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('confirmation_requests')
    .select('*')
    .eq('report_id', req.params.reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// PATCH /confirmation/:id — reporter responds (approve or deny)
router.patch('/:id', async (req, res) => {
  const { status } = req.body // 'approved' | 'denied'

  if (!['approved', 'denied'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or denied.' })
  }

  const { data, error } = await supabaseAdmin
    .from('confirmation_requests')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Notify admin notification bell of the response
  await supabaseAdmin.from('notifications').insert({
    type: status === 'approved' ? 'pickup_confirmation_approved' : 'pickup_confirmation_denied',
    title: status === 'approved' ? 'Proxy Pickup Approved' : 'Proxy Pickup Denied',
    body: status === 'approved'
      ? 'The owner has confirmed the proxy pickup. You may release the item.'
      : 'The owner has denied the proxy pickup. Do not release the item.',
    report_id: data.report_id,
  })

  res.json(data)
})

export default router