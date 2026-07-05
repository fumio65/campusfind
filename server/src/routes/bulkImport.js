import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'
import { validateHeaders, classifyRows, classifyRow } from '../lib/bulkImportValidation.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

// GET /accounts/bulk-import/:batchId
router.get('/bulk-import/:batchId', async (req, res) => {
  const { batchId } = req.params

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('bulk_import_batches')
    .select('*')
    .eq('id', batchId)
    .single()

  if (batchError) return res.status(404).json({ error: 'Import batch not found.' })

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from('bulk_import_rows')
    .select('*')
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true })

  if (rowsError) return res.status(500).json({ error: rowsError.message })

  res.json({ batch, rows })
})

// POST /accounts/bulk-import
router.post('/bulk-import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Send a CSV under the "file" field.' })
  }

  const uploadedBy = req.body.uploadedBy
  if (!uploadedBy) {
    return res.status(401).json({ error: 'uploadedBy (admin user id) is required.' })
  }

  let rawRows
  try {
    rawRows = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true })
  } catch (err) {
    return res.status(400).json({ error: `Could not parse CSV: ${err.message}` })
  }

  if (rawRows.length === 0) {
    return res.status(400).json({ error: 'CSV has no data rows.' })
  }

  const headerError = validateHeaders(Object.keys(rawRows[0]))
  if (headerError) {
    return res.status(400).json({ error: headerError })
  }

  const { data: existingUsers, error: fetchError } = await supabaseAdmin
    .from('users')
    .select('student_id, enrollment_number, last_name, first_name, middle_name, program, year_level')

  if (fetchError) {
    return res.status(500).json({ error: `Could not check existing accounts: ${fetchError.message}` })
  }

  const existingUsersMap = new Map(existingUsers.map((u) => [u.student_id, u]))
  const existingEnrollmentNumbers = new Set(existingUsers.map((u) => u.enrollment_number))

  const classifiedRows = classifyRows(rawRows, existingUsersMap, existingEnrollmentNumbers)

  const { data: batch, error: batchError } = await supabaseAdmin
    .from('bulk_import_batches')
    .insert({ uploaded_by: uploadedBy, filename: req.file.originalname, status: 'pending_review' })
    .select()
    .single()

  if (batchError) {
    return res.status(500).json({ error: `Could not create import batch: ${batchError.message}` })
  }

  const rowsToInsert = classifiedRows.map((row) => ({ ...row, batch_id: batch.id }))

  const INSERT_CHUNK_SIZE = 1000
  const insertedRows = []
  for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE)
    const { data: chunkResult, error: chunkError } = await supabaseAdmin
      .from('bulk_import_rows')
      .insert(chunk)
      .select()

    if (chunkError) {
      await supabaseAdmin.from('bulk_import_rows').delete().eq('batch_id', batch.id)
      await supabaseAdmin.from('bulk_import_batches').delete().eq('id', batch.id)
      return res.status(500).json({
        error: `Could not save import rows (failed at row ${i + 1}-${i + chunk.length}): ${chunkError.message}`,
      })
    }
    insertedRows.push(...chunkResult)
  }

  const counts = classifiedRows.reduce(
    (acc, row) => ({ ...acc, [row.action]: (acc[row.action] ?? 0) + 1 }),
    {}
  )

  res.status(201).json({ batch, rows: insertedRows, counts })
})

// PATCH /accounts/bulk-import/:batchId/rows/:rowId
router.patch('/bulk-import/:batchId/rows/:rowId', async (req, res) => {
  const { batchId, rowId } = req.params
  const editableFields = [
    'student_id', 'enrollment_number', 'last_name', 'first_name',
    'middle_name', 'program', 'year_level', 'csv_status',
  ]
  const edits = Object.fromEntries(
    Object.entries(req.body).filter(([key]) => editableFields.includes(key))
  )

  if (Object.keys(edits).length === 0) {
    return res.status(400).json({ error: 'No editable fields provided.' })
  }

  const { data: existingRow, error: fetchError } = await supabaseAdmin
    .from('bulk_import_rows')
    .select('*')
    .eq('id', rowId)
    .eq('batch_id', batchId)
    .single()

  if (fetchError) return res.status(404).json({ error: 'Row not found.' })

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

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /accounts/bulk-import/:batchId/confirm
router.post('/bulk-import/:batchId/confirm', async (req, res) => {
  const { batchId } = req.params

  const { data: batch, error: batchFetchError } = await supabaseAdmin
    .from('bulk_import_batches')
    .select('*')
    .eq('id', batchId)
    .single()

  if (batchFetchError) return res.status(404).json({ error: 'Import batch not found.' })
  if (batch.status !== 'pending_review') {
    return res.status(409).json({ error: `Batch is already ${batch.status}, cannot confirm again.` })
  }

  const { data: rows, error: rowsFetchError } = await supabaseAdmin
    .from('bulk_import_rows')
    .select('*')
    .eq('batch_id', batchId)

  if (rowsFetchError) return res.status(500).json({ error: rowsFetchError.message })

  const errorRows = rows.filter((r) => r.action === 'error')
  if (errorRows.length > 0) {
    return res.status(422).json({
      error: 'This import has unresolved error rows. Fix or remove them before confirming, imports are all-or-nothing.',
      errorRows,
    })
  }

  const toCreate = rows.filter((r) => r.action === 'create')
  const toUpdate = rows.filter((r) => r.action === 'update')
  const toDeactivate = rows.filter((r) => r.action === 'deactivate')

  const createdIds = []
  const createdAuthIds = []
  try {
    for (const row of toCreate) {
      // per SRS FR-1: enrollment number is the initial password
      const email = `${row.student_id.replace('-', '')}@nwssu.local`
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
    return res.status(500).json({
      error: `Import failed and was rolled back: ${err.message}`,
    })
  }

  await supabaseAdmin
    .from('bulk_import_batches')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', batchId)

  res.json({
    ok: true,
    created: toCreate.length,
    updated: toUpdate.length,
    deactivated: toDeactivate.length,
    skipped: rows.filter((r) => r.action === 'skip_duplicate').length,
  })
})

// POST /accounts/bulk-import/:batchId/cancel
router.post('/bulk-import/:batchId/cancel', async (req, res) => {
  const { batchId } = req.params
  const { error } = await supabaseAdmin
    .from('bulk_import_batches')
    .update({ status: 'discarded' })
    .eq('id', batchId)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

export default router