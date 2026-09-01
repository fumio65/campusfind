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
const REQUIRED_COLUMNS = [
  'Student ID',
  'Enrollment Number',
  'Last Name',
  'First Name',
  'Program/Course',
  'Year Level',
  'Status',
]

const STATUS_TO_ACTION: Record<string, string> = {
  New: 'create',
  Continuing: 'create',
  'Graduate/Inactive': 'deactivate',
  Graduate: 'deactivate',
  Inactive: 'deactivate',
}

function validateHeaders(headerRow: string[]): string | null {
  const missing = REQUIRED_COLUMNS.filter((col) => !headerRow.includes(col))
  return missing.length === 0 ? null : `Missing required column(s): ${missing.join(', ')}`
}

// Classifies a single CSV row against the format rules above. Does NOT check
// duplicates against the database -- that requires the full row set and a
// DB round-trip, done separately in classifyRows() / the route handler.
function classifyRow(row: Record<string, unknown>): { action: string; error_message: string | null } {
  const studentId = String(row['Student ID'] ?? '').trim()
  const enrollmentNumber = String(row['Enrollment Number'] ?? '').trim()
  const lastName = String(row['Last Name'] ?? '').trim()
  const firstName = String(row['First Name'] ?? '').trim()
  const status = String(row['Status'] ?? '').trim()

  if (!studentId || !STUDENT_ID_RE.test(studentId)) {
    return { action: 'error', error_message: 'bad student ID format, expected YY-NNNNN' }
  }
  if (!enrollmentNumber || !ENROLLMENT_RE.test(enrollmentNumber)) {
    return { action: 'error', error_message: 'enrollment number must be 6-10 digits' }
  }
  if (!lastName || !firstName) {
    return { action: 'error', error_message: 'last name and first name are required' }
  }
  const action = STATUS_TO_ACTION[status]
  if (!action) {
    return {
      action: 'error',
      error_message: `unrecognized status "${status}", expected New, Continuing, or Graduate/Inactive`,
    }
  }

  return { action, error_message: null }
}

// Classifies every row, handling four distinct "already exists" cases:
//   1. Student ID exists + status is New/Continuing + data actually changed -> 'update'
//   2. Student ID exists + status is New/Continuing + data is identical -> 'skip_duplicate'
//   3. Student ID exists + status is Graduate/Inactive -> 'deactivate' (unchanged from classifyRow)
//   4. Only enrollment number matches a different student, or exact duplicate within the file -> 'skip_duplicate'
function classifyRows(
  rawRows: Record<string, unknown>[],
  existingUsersMap: Map<string, any>,
  existingEnrollmentNumbers: Set<string>
) {
  const seenStudentIds = new Set<string>()
  const seenEnrollmentNumbers = new Set<string>()

  // Enrollment numbers change every year, so a number freed by one existing
  // student in this same file is fair game for another row to claim -- the
  // DB-wide existingEnrollmentNumbers snapshot doesn't know that yet, so
  // without this it looks like a collision with "a different student" when
  // it's really just this year's reassignment.
  const vacatedEnrollmentNumbers = new Set<string>()
  for (const row of rawRows) {
    const studentId = String(row['Student ID'] ?? '').trim()
    const newEnrollmentNumber = String(row['Enrollment Number'] ?? '').trim()
    const existingUser = existingUsersMap.get(studentId)
    if (existingUser?.enrollment_number && existingUser.enrollment_number !== newEnrollmentNumber) {
      vacatedEnrollmentNumbers.add(existingUser.enrollment_number)
    }
  }

  return rawRows.map((row, index) => {
    const studentId = String(row['Student ID'] ?? '').trim()
    const enrollmentNumber = String(row['Enrollment Number'] ?? '').trim()
    const lastName = String(row['Last Name'] ?? '').trim() || null
    const firstName = String(row['First Name'] ?? '').trim() || null
    const middleName = String(row['Middle Name'] ?? '').trim() || null
    const program = String(row['Program/Course'] ?? '').trim() || null
    const yearLevel = String(row['Year Level'] ?? '').trim() || null
    const classified = classifyRow(row)
    const existingUser = existingUsersMap.get(studentId)

    let action = classified.action
    let errorMessage = classified.error_message

    if (action !== 'error') {
      const isDuplicateInFile =
        seenStudentIds.has(studentId) || seenEnrollmentNumbers.has(enrollmentNumber)

      if (isDuplicateInFile) {
        action = 'skip_duplicate'
        errorMessage = 'duplicate within this file'
      } else if (existingUser) {
        if (action === 'create') {
          // A returning student can bring a new enrollment number, but not one
          // that's still live on a *different* student who isn't also being
          // moved off it in this same file -- that's a real collision, not a
          // self-update, and would otherwise crash the DB write at confirm time.
          const targetTakenByAnotherStudent =
            enrollmentNumber !== existingUser.enrollment_number &&
            existingEnrollmentNumbers.has(enrollmentNumber) &&
            !vacatedEnrollmentNumbers.has(enrollmentNumber)

          if (targetTakenByAnotherStudent) {
            action = 'error'
            errorMessage = 'enrollment number already assigned to a different student'
          } else {
            const hasChanges =
              existingUser.enrollment_number !== enrollmentNumber ||
              existingUser.last_name !== lastName ||
              existingUser.first_name !== firstName ||
              (existingUser.middle_name ?? null) !== middleName ||
              (existingUser.program ?? null) !== program ||
              (existingUser.year_level ?? null) !== yearLevel

            if (hasChanges) {
              action = 'update'
              errorMessage = null
            } else {
              action = 'skip_duplicate'
              errorMessage = 'no changes from current record'
            }
          }
        }
      } else if (existingEnrollmentNumbers.has(enrollmentNumber) && !vacatedEnrollmentNumbers.has(enrollmentNumber)) {
        action = 'skip_duplicate'
        errorMessage = 'enrollment number already assigned to a different student'
      }

      if (action !== 'skip_duplicate') {
        seenStudentIds.add(studentId)
        seenEnrollmentNumbers.add(enrollmentNumber)
      }
    }

    return {
      row_number: index + 1,
      student_id: studentId || null,
      enrollment_number: enrollmentNumber || null,
      last_name: lastName,
      first_name: firstName,
      middle_name: middleName,
      program,
      year_level: yearLevel,
      csv_status: String(row['Status'] ?? '').trim() || null,
      action,
      error_message: errorMessage,
      // Snapshot of the existing record at upload time, so the preview can
      // show a before/after diff on 'update' rows.
      previous_enrollment_number: existingUser?.enrollment_number ?? null,
      previous_last_name: existingUser?.last_name ?? null,
      previous_first_name: existingUser?.first_name ?? null,
      previous_middle_name: existingUser?.middle_name ?? null,
      previous_program: existingUser?.program ?? null,
      previous_year_level: existingUser?.year_level ?? null,
    }
  })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('bulk-import')
  const batchId = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]
  const rowId = pathParts[baseIndex + 3]

  try {
    // GET /bulk-import/:batchId
    if (req.method === 'GET' && batchId) {
      const { data: batch, error: batchError } = await supabaseAdmin
        .from('bulk_import_batches')
        .select('*')
        .eq('id', batchId)
        .single()

      if (batchError) return json({ error: 'Import batch not found.' }, 404)

      const { data: rows, error: rowsError } = await supabaseAdmin
        .from('bulk_import_rows')
        .select('*')
        .eq('batch_id', batchId)
        .order('row_number', { ascending: true })

      if (rowsError) return json({ error: rowsError.message }, 500)

      return json({ batch, rows })
    }

    // POST /bulk-import
    if (req.method === 'POST' && !batchId) {
      const formData = await req.formData()
      const file = formData.get('file') as File
      const uploadedBy = formData.get('uploadedBy') as string

      if (!file) {
        return json({ error: 'No file uploaded. Send a CSV under the "file" field.' }, 400)
      }
      if (!uploadedBy) {
        return json({ error: 'uploadedBy (admin user id) is required.' }, 401)
      }

      const text = await file.text()
      let rawRows: Record<string, unknown>[]
      try {
        rawRows = parse(text, { skipFirstRow: true }) as Record<string, unknown>[]
      } catch (err) {
        return json({ error: `Could not parse CSV: ${(err as Error).message}` }, 400)
      }

      if (rawRows.length === 0) {
        return json({ error: 'CSV has no data rows.' }, 400)
      }

      const headerError = validateHeaders(Object.keys(rawRows[0]))
      if (headerError) {
        return json({ error: headerError }, 400)
      }

      const { data: existingUsers, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('student_id, enrollment_number, last_name, first_name, middle_name, program, year_level')

      if (fetchError) {
        return json({ error: `Could not check existing accounts: ${fetchError.message}` }, 500)
      }

      const existingUsersMap = new Map((existingUsers ?? []).map((u: any) => [u.student_id, u]))
      const existingEnrollmentNumbers = new Set((existingUsers ?? []).map((u: any) => u.enrollment_number))

      const classifiedRows = classifyRows(rawRows, existingUsersMap, existingEnrollmentNumbers)

      const { data: batch, error: batchError } = await supabaseAdmin
        .from('bulk_import_batches')
        .insert({ uploaded_by: uploadedBy, filename: file.name, status: 'pending_review' })
        .select()
        .single()

      if (batchError) {
        return json({ error: `Could not create import batch: ${batchError.message}` }, 500)
      }

      const rowsToInsert = classifiedRows.map((row) => ({ ...row, batch_id: batch.id }))

      const INSERT_CHUNK_SIZE = 1000
      const insertedRows: any[] = []
      for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
        const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE)
        const { data: chunkResult, error: chunkError } = await supabaseAdmin
          .from('bulk_import_rows')
          .insert(chunk)
          .select()

        if (chunkError) {
          await supabaseAdmin.from('bulk_import_rows').delete().eq('batch_id', batch.id)
          await supabaseAdmin.from('bulk_import_batches').delete().eq('id', batch.id)
          return json({
            error: `Could not save import rows (failed at row ${i + 1}-${i + chunk.length}): ${chunkError.message}`,
          }, 500)
        }
        insertedRows.push(...(chunkResult ?? []))
      }

      const counts = classifiedRows.reduce((acc: Record<string, number>, row) => {
        acc[row.action] = (acc[row.action] ?? 0) + 1
        return acc
      }, {})

      return json({ batch, rows: insertedRows, counts }, 201)
    }

    // PATCH /bulk-import/:batchId/rows/:rowId
    if (req.method === 'PATCH' && batchId && action === 'rows' && rowId) {
      const editableFields = [
        'student_id', 'enrollment_number', 'last_name', 'first_name',
        'middle_name', 'program', 'year_level', 'csv_status',
      ]
      const body = await req.json()
      const edits = Object.fromEntries(
        Object.entries(body).filter(([key]) => editableFields.includes(key))
      )

      if (Object.keys(edits).length === 0) {
        return json({ error: 'No editable fields provided.' }, 400)
      }

      const { data: existingRow, error: fetchError } = await supabaseAdmin
        .from('bulk_import_rows')
        .select('*')
        .eq('id', rowId)
        .eq('batch_id', batchId)
        .single()

      if (fetchError) return json({ error: 'Row not found.' }, 404)

      const merged = { ...existingRow, ...edits }
      const reclassified = classifyRow({
        'Student ID': merged.student_id,
        'Enrollment Number': merged.enrollment_number,
        'Last Name': merged.last_name,
        'First Name': merged.first_name,
        'Status': merged.csv_status,
      })

      const updates = {
        ...edits,
        action: reclassified.action,
        error_message: reclassified.error_message,
        edited: true,
      }

      const { data, error } = await supabaseAdmin
        .from('bulk_import_rows')
        .update(updates)
        .eq('id', rowId)
        .eq('batch_id', batchId)
        .select()
        .single()

      if (error) return json({ error: error.message }, 500)
      return json(data)
    }

    // POST /bulk-import/:batchId/confirm
    if (req.method === 'POST' && batchId && action === 'confirm') {
      const { data: batch, error: batchFetchError } = await supabaseAdmin
        .from('bulk_import_batches')
        .select('*')
        .eq('id', batchId)
        .single()

      if (batchFetchError) return json({ error: 'Import batch not found.' }, 404)
      if (batch.status !== 'pending_review') {
        return json({ error: `Batch is already ${batch.status}, cannot confirm again.` }, 409)
      }

      const { data: rows, error: rowsFetchError } = await supabaseAdmin
        .from('bulk_import_rows')
        .select('*')
        .eq('batch_id', batchId)

      if (rowsFetchError) return json({ error: rowsFetchError.message }, 500)

      const errorRows = (rows ?? []).filter((r: any) => r.action === 'error')
      if (errorRows.length > 0) {
        return json({
          error: 'This import has unresolved error rows. Fix or remove them before confirming, imports are all-or-nothing.',
          errorRows,
        }, 422)
      }

      const toCreate = (rows ?? []).filter((r: any) => r.action === 'create')
      const toUpdate = (rows ?? []).filter((r: any) => r.action === 'update')
      const toDeactivate = (rows ?? []).filter((r: any) => r.action === 'deactivate')

      const createdIds: string[] = []
      const createdAuthIds: string[] = []
      const vacatedOriginals: { student_id: string; enrollment_number: string }[] = []
      try {
        // enrollment_number is unique in the DB and checked per-statement, not
        // deferred -- so if row A's new number is row B's current number, writing
        // A's update (or a new account's create) before B vacates it would throw
        // a real unique-constraint violation. Move every updating student's
        // enrollment_number off to a disposable placeholder first so every
        // reassignment in this batch, including cross-student swaps, is safe
        // regardless of write order. Their original values are recorded so a
        // later failure in this batch can restore them.
        if (toUpdate.length > 0) {
          const { data: currentUsers, error: currentFetchError } = await supabaseAdmin
            .from('users')
            .select('student_id, enrollment_number')
            .in('student_id', toUpdate.map((row: any) => row.student_id))

          if (currentFetchError) throw new Error(`Could not read current enrollment numbers: ${currentFetchError.message}`)
          vacatedOriginals.push(...(currentUsers ?? []))

          for (const row of toUpdate) {
            const placeholder = `9${String(9000000000 + row.row_number).slice(-9)}`
            const { error: vacateError } = await supabaseAdmin
              .from('users')
              .update({ enrollment_number: placeholder })
              .eq('student_id', row.student_id)
            if (vacateError) throw new Error(`Row ${row.row_number}: ${vacateError.message}`)
          }
        }

        for (const row of toCreate) {
          // per SRS FR-1: enrollment number is the initial password
          const email = `${row.student_id.replace('-', '')}@nwssu.local`.toLowerCase()
          const initialPassword = row.enrollment_number

          const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: initialPassword,
            email_confirm: true,
          })

          if (authError) throw new Error(`Row ${row.row_number} auth: ${authError.message}`)
          createdAuthIds.push(authUser.user.id)

          const { data: created, error: createError } = await supabaseAdmin
            .from('users')
            .insert({
              id: authUser.user.id,
              student_id: row.student_id,
              enrollment_number: row.enrollment_number,
              last_name: row.last_name,
              first_name: row.first_name,
              middle_name: row.middle_name,
              program: row.program,
              year_level: row.year_level,
              role: 'student',
              status: 'active',
              force_password_change: true,
            })
            .select()
            .single()

          if (createError) throw new Error(`Row ${row.row_number}: ${createError.message}`)
          createdIds.push(created.id)
        }

        for (const row of toUpdate) {
          const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({
              enrollment_number: row.enrollment_number,
              last_name: row.last_name,
              first_name: row.first_name,
              middle_name: row.middle_name,
              program: row.program,
              year_level: row.year_level,
              status: 'active',
            })
            .eq('student_id', row.student_id)

          if (updateError) throw new Error(`Row ${row.row_number}: ${updateError.message}`)
        }

        for (const row of toDeactivate) {
          const { error: deactivateError } = await supabaseAdmin
            .from('users')
            .update({ status: 'deactivated' })
            .eq('student_id', row.student_id)

          if (deactivateError) throw new Error(`Row ${row.row_number}: ${deactivateError.message}`)
        }
      } catch (err) {
        if (createdIds.length > 0) {
          await supabaseAdmin.from('users').delete().in('id', createdIds)
        }
        for (const authId of createdAuthIds) {
          await supabaseAdmin.auth.admin.deleteUser(authId)
        }
        for (const { student_id, enrollment_number } of vacatedOriginals) {
          await supabaseAdmin.from('users').update({ enrollment_number }).eq('student_id', student_id)
        }
        return json({ error: `Import failed and was rolled back: ${(err as Error).message}` }, 500)
      }

      await supabaseAdmin
        .from('bulk_import_batches')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', batchId)

      return json({
        ok: true,
        created: toCreate.length,
        updated: toUpdate.length,
        deactivated: toDeactivate.length,
        skipped: (rows ?? []).filter((r: any) => r.action === 'skip_duplicate').length,
      })
    }

    // POST /bulk-import/:batchId/cancel
    if (req.method === 'POST' && batchId && action === 'cancel') {
      const { error } = await supabaseAdmin
        .from('bulk_import_batches')
        .update({ status: 'discarded' })
        .eq('id', batchId)

      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    return json({ error: 'Not found' }, 404)
  } catch (err) {
    console.error(err)
    return json({ error: 'Unexpected server error' }, 500)
  }
})
