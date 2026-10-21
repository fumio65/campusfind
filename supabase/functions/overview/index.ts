import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/requireAdmin.ts'


const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const adminOrResponse = await requireAdmin(req, supabaseAdmin)
  if (adminOrResponse instanceof Response) return adminOrResponse

  try {
    if (req.method === 'GET') {
      // Student accounts only (the ISSC admin account isn't a student), split
      // the same way as the Accounts page: set up = enabled and the student
      // has logged in and set their own password; pending setup = enabled
      // but not yet; deactivated = switched off.
      const [
        { count: totalAccounts },
        { count: activeAccounts },
        { count: pendingSetupAccounts },
        { count: deactivatedAccounts },
        { count: totalReports },
        { count: openReports },
        { count: resolvedReports },
        { data: claims },
        { data: recentAccounts },
      ] = await Promise.all([
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active').eq('force_password_change', false),
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'active').eq('force_password_change', true),
        supabaseAdmin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'student').eq('status', 'deactivated'),
        supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }),
        supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabaseAdmin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'resolved'),
        supabaseAdmin.from('claims').select('status'),
        supabaseAdmin.from('users')
          .select('id, student_id, first_name, last_name, role, status, force_password_change, created_at')
          .eq('role', 'student')
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      // Same definition as the Analytics page: approved out of claims that
      // have been reviewed (pending claims haven't been decided yet).
      const approvedClaims = claims?.filter((c: any) => c.status === 'approved').length ?? 0
      const rejectedClaims = claims?.filter((c: any) => c.status === 'rejected').length ?? 0
      const totalClaims = claims?.length ?? 0
      const reviewedClaims = approvedClaims + rejectedClaims
      const claimApprovalRate = reviewedClaims > 0 ? Math.round((approvedClaims / reviewedClaims) * 100) : 0

      return new Response(JSON.stringify({
        totalAccounts: totalAccounts ?? 0,
        activeAccounts: activeAccounts ?? 0,
        pendingSetupAccounts: pendingSetupAccounts ?? 0,
        deactivatedAccounts: deactivatedAccounts ?? 0,
        totalReports: totalReports ?? 0,
        openReports: openReports ?? 0,
        resolvedReports: resolvedReports ?? 0,
        claimApprovalRate,
        totalClaims,
        recentAccounts: recentAccounts ?? [],
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

