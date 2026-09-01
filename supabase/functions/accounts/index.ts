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

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('accounts')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // GET /accounts
    if (req.method === 'GET' && !id) {
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200)
      const offset = parseInt(url.searchParams.get('offset') ?? '0')
      const search = (url.searchParams.get('search') ?? '').trim()

      let query = supabaseAdmin
        .from('users')
        .select(
          'id, student_id, enrollment_number, first_name, last_name, middle_name, program, year_level, role, status, trust_score, created_at',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (search) {
        query = query.or(
          `student_id.ilike.${search}%,last_name.ilike.${search}%,first_name.ilike.${search}%`
        )
      }

      const { data, error, count } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        accounts: (data ?? []).map((u: any) => ({
          id: u.id,
          student_id: u.student_id,
          enrollment_number: u.enrollment_number,
          name: `${u.first_name} ${u.last_name}`,
          first_name: u.first_name,
          last_name: u.last_name,
          middle_name: u.middle_name,
          program: u.program,
          year_level: u.year_level,
          role: u.role,
          status: u.status,
          trust_score: u.trust_score,
          created_at: u.created_at,
        })),
        total: count,
        limit,
        offset,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /accounts/single
    if (req.method === 'POST' && id === 'single') {
      const { studentId, enrollmentNumber, lastName, firstName } = await req.json()
      if (!studentId || !enrollmentNumber || !lastName || !firstName) {
        return new Response(JSON.stringify({ error: 'studentId, enrollmentNumber, lastName, and firstName are all required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const email = `${studentId.replace('-', '')}@nwssu.local`
      const initialPassword = enrollmentNumber

      const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: initialPassword,
        email_confirm: true,
      })

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .insert({
          id: authUser.user.id,
          student_id: studentId,
          enrollment_number: enrollmentNumber,
          last_name: lastName,
          first_name: firstName,
          role: 'student',
          status: 'active',
          force_password_change: true,
        })
        .select()
        .single()

      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /accounts/:id/status
    if (req.method === 'PATCH' && id && action === 'status') {
      const { status } = await req.json()
      if (status !== 'active' && status !== 'deactivated') {
        return new Response(JSON.stringify({ error: 'status must be "active" or "deactivated".' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .update({ status })
        .eq('id', id)
        .select('id, student_id, status')
        .single()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /accounts/:id/reset-password
    if (req.method === 'PATCH' && id && action === 'reset-password') {
      const { data: user, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, student_id, enrollment_number')
        .eq('id', id)
        .single()

      if (fetchError) {
        return new Response(JSON.stringify({ error: 'Account not found.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: user.enrollment_number,
      })

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error } = await supabaseAdmin
        .from('users')
        .update({ force_password_change: true })
        .eq('id', id)

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ id: user.id, student_id: user.student_id }), {
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

