import { supabase } from '../../../shared/lib/supabase'

// Intentionally a set of small aggregate queries rather than one giant view,
// so each chart can fail/load independently. Currently only the summary
// numbers are wired; chart series (reportsOverTime, trustDistribution,
// claimsByCategory) still use mockData.js until those aggregate queries
// are written.
export async function fetchAnalyticsSummary() {
  const [{ count: itemsReported }, { data: claims }] = await Promise.all([
    supabase.from('reports').select('id', { count: 'exact', head: true }),
    supabase.from('claims').select('status'),
  ])

  const approved = claims?.filter((c) => c.status === 'approved').length ?? 0
  const total = claims?.length ?? 0
  const claimApprovalRate = total > 0 ? Math.round((approved / total) * 100) : 0

  return { itemsReported: itemsReported ?? 0, claimApprovalRate }
}
