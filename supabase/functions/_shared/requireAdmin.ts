import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

// Verifies the caller is a logged-in user with role 'admin' before letting
// them reach account-management / dashboard endpoints. Pair with
// `verify_jwt = true` for this function in supabase/config.toml (or the
// project's Edge Function settings) so a request with no/garbage JWT is
// rejected by the platform gateway before it even reaches this check -
// this function-level check is still required on top of that, since a
// valid JWT only proves *some* user is logged in, not that they're an admin.
export async function requireAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admin access required.' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (profile.status === 'deactivated') {
    return new Response(JSON.stringify({ error: 'Account is deactivated.' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return { id: user.id }
}
