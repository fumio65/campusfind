import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

router.get('/', async (req, res) => {
  const [
    { count: totalReports },
    { data: claims },
    { data: users },
    { data: reports },
    { data: approvedClaims },
  ] = await Promise.all([
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('claims').select('status, created_at'),
    supabaseAdmin.from('users').select('trust_score').eq('role', 'student'),
    supabaseAdmin.from('reports').select('created_at, status').order('created_at', { ascending: true }),
    supabaseAdmin.from('claims').select('created_at, updated_at').eq('status', 'approved'),
  ])

  const totalClaims = claims?.length ?? 0
  const approvedCount = claims?.filter((c) => c.status === 'approved').length ?? 0
  const claimApprovalRate = totalClaims > 0 ? Math.round((approvedCount / totalClaims) * 100) : 0

  let avgTimeToRecoveryDays = null
  if (approvedClaims && approvedClaims.length > 0) {
    const totalDays = approvedClaims.reduce((sum, c) => {
      const diff = new Date(c.updated_at) - new Date(c.created_at)
      return sum + diff / (1000 * 60 * 60 * 24)
    }, 0)
    avgTimeToRecoveryDays = Math.round((totalDays / approvedClaims.length) * 10) / 10
  }

  const avgTrustScore = users && users.length > 0
    ? Math.round(users.reduce((sum, u) => sum + (u.trust_score ?? 100), 0) / users.length)
    : null

  const now = new Date()
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      month: d.toLocaleString('en-PH', { month: 'short' }),
      count: 0,
    })
  }
  if (reports) {
    for (const r of reports) {
      const key = r.created_at.slice(0, 7)
      const bucket = months.find((m) => m.key === key)
      if (bucket) bucket.count++
    }
  }

  const bands = { '90–100': 0, '70–89': 0, 'Below 70': 0 }
  if (users) {
    for (const u of users) {
      const s = u.trust_score ?? 100
      if (s >= 90) bands['90–100']++
      else if (s >= 70) bands['70–89']++
      else bands['Below 70']++
    }
  }
  const trustDistribution = Object.entries(bands).map(([band, value]) => ({ band, value }))

  res.json({
    itemsReported: totalReports ?? 0,
    claimApprovalRate,
    avgTimeToRecoveryDays,
    avgTrustScore,
    totalClaims,
    reportsOverTime: months.map(({ month, count }) => ({ month, count })),
    trustDistribution,
  })
})

export default router