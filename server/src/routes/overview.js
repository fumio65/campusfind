import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const router = Router()

// GET /overview — real-time dashboard summary for the Overview page
router.get('/', async (req, res) => {
  const [
    { count: totalAccounts },
    { count: activeAccounts },
    { count: totalReports },
    { count: openReports },
    { count: resolvedReports },
    { data: claims },
    { data: recentAccounts },
  ] = await Promise.all([
    supabaseAdmin.from('users').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }),
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
    supabaseAdmin.from('claims').select('status'),
    supabaseAdmin.from('users')
      .select('id, student_id, first_name, last_name, role, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const approvedClaims = claims?.filter((c) => c.status === 'approved').length ?? 0
  const totalClaims = claims?.length ?? 0
  const claimApprovalRate = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : 0

  res.json({
    totalAccounts: totalAccounts ?? 0,
    activeAccounts: activeAccounts ?? 0,
    totalReports: totalReports ?? 0,
    openReports: openReports ?? 0,
    resolvedReports: resolvedReports ?? 0,
    claimApprovalRate,
    totalClaims,
    recentAccounts: recentAccounts ?? [],
  })
})

export default router