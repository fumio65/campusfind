import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { notifyUser } from '../lib/notifyUser.js'
import { adjustTrustScore, checkRepeatedRejections } from '../lib/trustScore.js'

const router = Router()

// PATCH /claims/:id — approve or reject a claim
router.patch('/:id', async (req, res) => {
  const { action } = req.body
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be approve or reject' })
  }

  const { data: claim, error: claimErr } = await supabaseAdmin
    .from('claims')
    .select('id, claimant_id, report_id, reports(title, reporter_id)')
    .eq('id', req.params.id)
    .single()

  if (claimErr || !claim) return res.status(404).json({ error: 'Claim not found' })

  const reportTitle = claim.reports?.title ?? 'your item'
  const claimantId = claim.claimant_id
  const reportId = claim.report_id

  if (action === 'approve') {
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

    await adjustTrustScore(claimantId, -5, 'claim rejected')

    const repeated = await checkRepeatedRejections(claimantId)
    if (repeated) {
      await adjustTrustScore(claimantId, -5, '3+ rejections in 30 days')
    }

    await notifyUser({
      userId: claimantId,
      type: 'claim_rejected',
      title: 'Claim not approved',
      body: `Your claim on "${reportTitle}" was declined. The item is open for new claims.`,
      reportId,
      claimId: claim.id,
    })
  }

  res.json({ ok: true })
})

// POST /claims — notify reporter when claim is submitted
router.post('/', async (req, res) => {
  const { reportId, claimantId } = req.body
  if (!reportId || !claimantId) return res.status(400).json({ error: 'reportId and claimantId required' })

  const { data: report } = await supabaseAdmin
    .from('reports')
    .select('title, reporter_id, status')
    .eq('id', reportId)
    .single()

  if (!report) return res.status(404).json({ error: 'Report not found' })

  await notifyUser({
    userId: report.reporter_id,
    type: 'claim_submitted',
    title: 'Someone found your item!',
    body: `A claim has been submitted on "${report.title}". Review it and approve or reject.`,
    reportId,
  })

  res.json({ ok: true })
})

// POST /claims/:id/message — notify recipient when a message is sent
router.post('/:id/message', async (req, res) => {
  const { senderId, senderRole } = req.body
  if (!senderId || !senderRole) return res.status(400).json({ error: 'senderId and senderRole required' })

  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('id, claimant_id, report_id, reports(title, reporter_id)')
    .eq('id', req.params.id)
    .single()

  if (!claim) return res.status(404).json({ error: 'Claim not found' })

  const reportTitle = claim.reports?.title ?? 'your item'
  const reportId = claim.report_id

  const recipientId = senderRole === 'reporter'
    ? claim.claimant_id
    : claim.reports?.reporter_id

  if (!recipientId) return res.json({ ok: true })

  await notifyUser({
    userId: recipientId,
    type: 'new_message',
    title: 'New message',
    body: `${senderRole === 'reporter' ? 'The reporter' : 'The finder'} sent a message about "${reportTitle}".`,
    reportId,
    claimId: claim.id,
  })

  res.json({ ok: true })
})

// POST /claims/:id/dropoff — notify reporter when finder chooses drop-off
router.post('/:id/dropoff', async (req, res) => {
  const { reportId } = req.body

  const { data: claim } = await supabaseAdmin
    .from('claims')
    .select('id, claimant_id, report_id, reports(title, reporter_id)')
    .eq('id', req.params.id)
    .single()

  if (!claim) return res.status(404).json({ error: 'Claim not found' })

  await supabaseAdmin
    .from('reports')
    .update({ drop_off_chosen: true })
    .eq('id', claim.report_id)

  await notifyUser({
    userId: claim.reports?.reporter_id,
    type: 'dropoff_chosen',
    title: 'Finder chose ISSC drop-off',
    body: `The finder will drop off "${claim.reports?.title ?? 'your item'}" at the ISSC office.`,
    reportId: claim.report_id,
    claimId: claim.id,
  })

  res.json({ ok: true })
})

export default router