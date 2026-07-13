import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

// POST /proxy — reporter submits proxy info
router.post('/', async (req, res) => {
  const { reportId, reporterId, proxyName, proxyStudentId } = req.body

  if (!reportId || !reporterId || !proxyName || !proxyStudentId) {
    return res.status(400).json({ error: 'reportId, reporterId, proxyName, and proxyStudentId are required.' })
  }

  // Validate proxy student ID exists
  const { data: proxyUser } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, student_id')
    .eq('student_id', proxyStudentId.toUpperCase())
    .single()

  if (!proxyUser) {
    return res.status(404).json({ error: 'Proxy student ID not found in the system.' })
  }

  // Upsert proxy request (one per report)
  const { data: existing } = await supabaseAdmin
    .from('proxy_requests')
    .select('id')
    .eq('report_id', reportId)
    .eq('reporter_id', reporterId)
    .maybeSingle()

  let proxyRequest
  if (existing) {
    const { data } = await supabaseAdmin
      .from('proxy_requests')
      .update({ proxy_name: proxyName, proxy_student_id: proxyStudentId.toUpperCase(), status: 'pending' })
      .eq('id', existing.id)
      .select()
      .single()
    proxyRequest = data
  } else {
    const { data } = await supabaseAdmin
      .from('proxy_requests')
      .insert({ report_id: reportId, reporter_id: reporterId, proxy_name: proxyName, proxy_student_id: proxyStudentId.toUpperCase() })
      .select()
      .single()
    proxyRequest = data
  }

  // Notify admin
  await supabaseAdmin.from('notifications').insert({
    type: 'proxy_request',
    title: 'Proxy Pickup Registered',
    body: `${proxyName} (${proxyStudentId.toUpperCase()}) has been authorized to pick up an item on the owner's behalf.`,
    report_id: reportId,
  })

  res.status(201).json(proxyRequest)
})

// GET /proxy/:reportId — get proxy request for a report
router.get('/:reportId', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('proxy_requests')
    .select('*')
    .eq('report_id', req.params.reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

export default router