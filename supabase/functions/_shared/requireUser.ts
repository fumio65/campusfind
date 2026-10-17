import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from './cors.ts'

// Verifies the caller has a valid Supabase session and returns their user
// id. Unlike requireAdmin, this does NOT require role === 'admin' - use it
// for endpoints any authenticated student can call, where the real check
// is "is this the right student" (e.g. "are you the reporter on this
// report") rather than "are you staff". Pair with `verify_jwt = true` for
// this function in supabase/config.toml so a request with no/garbage JWT
// is rejected by the platform gateway before it even reaches this check -
// this function-level check is still required on top of that, since a
// valid JWT only proves *some* user is logged in, not *which* one is
// allowed to act on this particular record.
export async function requireUser(
  req: Request,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  const corsHeaders = getCorsHeaders(req.headers.get('origin'))

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
    .select('status')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: 'Account not found.' }), {
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
