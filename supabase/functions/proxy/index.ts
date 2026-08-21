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
  const baseIndex = pathParts.indexOf('proxy')
  const reportId = pathParts[baseIndex + 1]

  try {
    // POST /proxy
    if (req.method === 'POST' && !reportId) {
      const { reportId: rId, reporterId, proxyName, proxyStudentId } = await req.json()
      if (!rId || !reporterId || !proxyName || !proxyStudentId) {
        return new Response(JSON.stringify({ error: 'reportId, reporterId, proxyName, and proxyStudentId are required.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

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
      const { data, error } = await supabaseAdmin
        .from('proxy_requests')
        .select('*')
        .eq('report_id', reportId)
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

