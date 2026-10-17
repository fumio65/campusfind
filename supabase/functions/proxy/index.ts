import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireUser } from '../_shared/requireUser.ts'


const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('proxy')
  const reportId = pathParts[baseIndex + 1]

  try {
    // POST /proxy
    if (req.method === 'POST' && !reportId) {
      // SECURITY FIX: this handler previously had no auth check at all and
      // blindly trusted a client-supplied reporterId - anyone could
      // register themselves (or anyone) as the reporter authorizing a
      // proxy pickup on someone else's report. Now the caller must be
      // logged in, and the reporter identity is taken from the report
      // itself, never from the request body.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { reportId: rId, proxyName, proxyStudentId } = await req.json()
      if (!rId || !proxyName || !proxyStudentId) {
        return new Response(JSON.stringify({ error: 'reportId, proxyName, and proxyStudentId are required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('reporter_id')
        .eq('id', rId)
        .single()
      if (!report) {
        return new Response(JSON.stringify({ error: 'Report not found.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      if (report.reporter_id !== caller.id) {
        return new Response(JSON.stringify({ error: 'Only the report\'s reporter may register a proxy pickup.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const reporterId = caller.id

      const { data: proxyUser } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, student_id')
        .eq('student_id', proxyStudentId.toUpperCase())
        .single()

      if (!proxyUser) {
        return new Response(JSON.stringify({ error: 'Proxy student ID not found in the system.' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: existing } = await supabaseAdmin
        .from('proxy_requests')
        .select('id')
        .eq('report_id', rId)
        .eq('reporter_id', reporterId)
        .maybeSingle()

      let proxyRequest
      if (existing) {
        const { data } = await supabaseAdmin
          .from('proxy_requests')
          .update({ proxy_name: proxyName, proxy_student_id: proxyStudentId.toUpperCase(), status: 'pending' })
          .eq('id', existing.id)
          .select()
          .single()
        proxyRequest = data
      } else {
        const { data } = await supabaseAdmin
          .from('proxy_requests')
          .insert({ report_id: rId, reporter_id: reporterId, proxy_name: proxyName, proxy_student_id: proxyStudentId.toUpperCase() })
          .select()
          .single()
        proxyRequest = data
      }

      await supabaseAdmin.from('notifications').insert({
        type: 'proxy_request',
        title: 'Proxy Pickup Registered',
        body: `${proxyName} (${proxyStudentId.toUpperCase()}) has been authorized to pick up an item on the owner's behalf.`,
        report_id: rId,
      })

      return new Response(JSON.stringify(proxyRequest), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // GET /proxy/:reportId
    if (req.method === 'GET' && reportId) {
      // SECURITY FIX: this handler previously had no auth check at all and
      // returned the registered proxy's full name + student ID for ANY
      // report ID, to anyone. Now it requires a valid session and only
      // returns data when the caller is that report's actual reporter.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { data, error } = await supabaseAdmin
        .from('proxy_requests')
        .select('*')
        .eq('report_id', reportId)
        .eq('reporter_id', caller.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data), {
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

