import { supabaseAdmin } from '../lib/supabaseAdmin.js'

// Verifies the caller is a logged-in user with role 'admin' before letting
// them reach account-management endpoints (list/create/deactivate accounts,
// reset passwords, bulk import, dashboard stats). Without this, those routes
// were reachable by anyone who could send an HTTP request to this server -
// no browser or CORS check stops a direct curl/Postman call.
export async function requireAdmin(req, res, next) {
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
    .select('role, status')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' })
  }

  if (profile.status === 'deactivated') {
    return res.status(403).json({ error: 'Account is deactivated.' })
  }

  req.adminUser = { id: user.id }
  next()
}
