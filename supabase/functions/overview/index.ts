import { createClient } from 'jsr:@supabase/supabase-js@2'

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

  try {
    if (req.method === 'GET') {
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

      const approvedClaims = claims?.filter((c: any) => c.status === 'approved').length ?? 0
      const totalClaims = claims?.length ?? 0
      const claimApprovalRate = totalClaims > 0 ? Math.round((approvedClaims / totalClaims) * 100) : 0

      return new Response(JSON.stringify({
        totalAccounts: totalAccounts ?? 0,
        activeAccounts: activeAccounts ?? 0,
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

