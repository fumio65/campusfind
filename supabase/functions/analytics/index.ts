import { createClient } from 'jsr:@supabase/supabase-js@2'
import { requireAdmin } from '../_shared/requireAdmin.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const adminOrResponse = await requireAdmin(req, supabaseAdmin)
  if (adminOrResponse instanceof Response) return adminOrResponse

  try {
    if (req.method === 'GET') {
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
      const approvedCount = claims?.filter((c: any) => c.status === 'approved').length ?? 0
      const claimApprovalRate = totalClaims > 0 ? Math.round((approvedCount / totalClaims) * 100) : 0

      let avgTimeToRecoveryDays = null
      if (approvedClaims && approvedClaims.length > 0) {
        const totalDays = approvedClaims.reduce((sum: number, c: any) => {
          const diff = new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()
          return sum + diff / (1000 * 60 * 60 * 24)
        }, 0)
        avgTimeToRecoveryDays = Math.round((totalDays / approvedClaims.length) * 10) / 10
      }

      const avgTrustScore = users && users.length > 0
        ? Math.round(users.reduce((sum: number, u: any) => sum + (u.trust_score ?? 100), 0) / users.length)
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
        for (const r of reports as any[]) {
          const key = r.created_at.slice(0, 7)
          const bucket = months.find((m) => m.key === key)
          if (bucket) bucket.count++
        }
      }

      const bands: Record<string, number> = { '90-100': 0, '70-89': 0, 'Below 70': 0 }
      if (users) {
        for (const u of users as any[]) {
          const s = u.trust_score ?? 100
          if (s >= 90) bands['90-100']++
          else if (s >= 70) bands['70-89']++
          else bands['Below 70']++
        }
      }

      const trustDistribution = Object.entries(bands).map(([band, value]) => ({ band, value }))

      return new Response(JSON.stringify({
        itemsReported: totalReports ?? 0,
        claimApprovalRate,
        avgTimeToRecoveryDays,
        avgTrustScore,
        totalClaims,
        reportsOverTime: months.map(({ month, count }) => ({ month, count })),
        trustDistribution,
      }), {
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

