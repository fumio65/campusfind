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

    // Trust score: -5 for rejected claim
    await adjustTrustScore(claimantId, -5, 'claim rejected')

    // Additional -5 if 3+ rejections in last 30 days
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

export default router