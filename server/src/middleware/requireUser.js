import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Verifies the caller has a valid Supabase session and sets req.callerUser.
// Unlike requireAdmin, this does NOT require role === 'admin' - use it for
// routes any authenticated student can call, where the real check is
// "is this the right student" (e.g. "are you the reporter on this report")
// rather than "are you staff". The route handler still has to compare
// req.callerUser.id against the record's owning id - this middleware only
// proves *someone* is logged in, not *which* record they're allowed to act on.
export async function requireUser(req, res, next) {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header.' })
  }

  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('status')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return res.status(403).json({ error: 'Account not found.' })
  }

  if (profile.status === 'deactivated') {
    return res.status(403).json({ error: 'Account is deactivated.' })
  }

  req.callerUser = { id: user.id }
  next()
}
