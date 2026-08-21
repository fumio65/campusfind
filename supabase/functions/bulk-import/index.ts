import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parse } from 'jsr:@std/csv@1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
}

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const STUDENT_ID_RE = /^\d{2}-\d{5}$/
const ENROLLMENT_RE = /^\d{6,10}$/

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s/()_-]+/g, '_')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('bulk-import')
  const action = pathParts[baseIndex + 1]

  try {
    // POST /bulk-import/validate
    if (req.method === 'POST' && action === 'validate') {
      const formData = await req.formData()
      const file = formData.get('file') as File
      if (!file) {
        return new Response(JSON.stringify({ error: 'No file uploaded.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const text = await file.text()
      const rows = parse(text, { skipFirstRow: false })
      if (rows.length < 2) {
        return new Response(JSON.stringify({ error: 'CSV file is empty or has no data rows.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const rawHeaders = rows[0] as string[]
      const headers = rawHeaders.map(normalizeHeader)

      const required = ['student_id', 'enrollment_number', 'last_name', 'first_name', 'status']
      const missing = required.filter(r => !headers.includes(r))
      if (missing.length > 0) {
        return new Response(JSON.stringify({ error: `Missing required columns: ${missing.join(', ')}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const dataRows = rows.slice(1) as string[][]
      const preview: any[] = []
      const errors: string[] = []
      const seenIds = new Set<string>()
      const seenEnrollments = new Set<string>()

      const { data: existingUsers } = await supabaseAdmin
        .from('users')
        .select('student_id, enrollment_number')

      const existingStudentIds = new Set((existingUsers ?? []).map((u: any) => u.student_id))
      const existingEnrollments = new Set((existingUsers ?? []).map((u: any) => u.enrollment_number))

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNum = i + 2
        const get = (col: string) => {
          const idx = headers.indexOf(col)
          return idx >= 0 ? (row[idx] ?? '').trim() : ''
        }

        const studentId = get('student_id').toUpperCase()
        const enrollmentNumber = get('enrollment_number')
        const lastName = get('last_name')
        const firstName = get('first_name')
        const middleName = get('middle_name')
        const program = get('program') || get('program_course')
        const yearLevel = get('year_level')
        const status = get('status').toLowerCase()

        if (!studentId || !enrollmentNumber || !lastName || !firstName || !status) {
          errors.push(`Row ${rowNum}: Missing required field(s).`)
          continue
        }
        if (!STUDENT_ID_RE.test(studentId)) {
          errors.push(`Row ${rowNum}: Invalid Student ID format "${studentId}". Expected YY-NNNNN.`)
          continue
        }
        if (!ENROLLMENT_RE.test(enrollmentNumber)) {
          errors.push(`Row ${rowNum}: Invalid Enrollment Number "${enrollmentNumber}". Expected 6-10 digits.`)
          continue
        }
        if (!['new', 'continuing', 'graduate', 'inactive'].includes(status)) {
          errors.push(`Row ${rowNum}: Invalid status "${status}". Must be New, Continuing, Graduate, or Inactive.`)
          continue
        }

        let rowAction: string
        if (seenIds.has(studentId) || seenEnrollments.has(enrollmentNumber)) {
          rowAction = 'skip-duplicate'
        } else if (existingStudentIds.has(studentId)) {
          rowAction = ['graduate', 'inactive'].includes(status) ? 'deactivate' : 'skip-duplicate'
        } else {
          rowAction = ['new', 'continuing'].includes(status) ? 'create' : 'skip'
        }

        seenIds.add(studentId)
        seenEnrollments.add(enrollmentNumber)

        preview.push({
          rowNum,
          studentId,
          enrollmentNumber,
          lastName,
          firstName,
          middleName,
          program,
          yearLevel,
          status,
          action: rowAction,
        })
      }

      if (errors.length > 0) {
        return new Response(JSON.stringify({ error: 'Validation failed. Fix errors and re-upload.', errors }), {
          status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ preview }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // POST /bulk-import/confirm
    if (req.method === 'POST' && action === 'confirm') {
      const { rows } = await req.json()
      if (!Array.isArray(rows) || rows.length === 0) {
        return new Response(JSON.stringify({ error: 'No rows to process.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const results = { created: 0, deactivated: 0, skipped: 0 }

      for (const row of rows) {
        if (row.action === 'create') {
          const email = `${row.studentId.replace('-', '').toLowerCase()}@nwssu.local`
          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: row.enrollmentNumber,
            email_confirm: true,
          })
          if (authError) { results.skipped++; continue }
          const { error } = await supabaseAdmin.from('users').insert({
            id: authUser.user.id,
            student_id: row.studentId,
            enrollment_number: row.enrollmentNumber,
            last_name: row.lastName,
            first_name: row.firstName,
            middle_name: row.middleName || null,
            program: row.program || null,
            year_level: row.yearLevel || null,
            role: 'student',
            status: 'active',
            force_password_change: true,
          })
          if (error) {
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
            results.skipped++
          } else {
            results.created++
          }
        } else if (row.action === 'deactivate') {
          await supabaseAdmin.from('users').update({ status: 'deactivated' }).eq('student_id', row.studentId)
          results.deactivated++
        } else {
          results.skipped++
        }
      }

      return new Response(JSON.stringify({ ok: true, results }), {
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

