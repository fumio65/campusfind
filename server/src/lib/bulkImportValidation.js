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

const STATUS_TO_ACTION = {
  New: 'create',
  Continuing: 'create',
  'Graduate/Inactive': 'deactivate',
  Graduate: 'deactivate',
  Inactive: 'deactivate',
}

export function validateHeaders(headerRow) {
  const missing = REQUIRED_COLUMNS.filter((col) => !headerRow.includes(col))
  return missing.length === 0 ? null : `Missing required column(s): ${missing.join(', ')}`
}

/**
 * Classifies a single CSV row against the rules above. Does NOT check
 * duplicates against the database -- that requires the full row set and a
 * DB round-trip, done separately in classifyRows() / the route handler.
 *
 * @returns {{ action: 'create'|'deactivate'|'error', error_message: string|null }}
 */
export function classifyRow(row) {
  const studentId = (row['Student ID'] ?? '').trim()
  const enrollmentNumber = (row['Enrollment Number'] ?? '').trim()
  const lastName = (row['Last Name'] ?? '').trim()
  const firstName = (row['First Name'] ?? '').trim()
  const status = (row['Status'] ?? '').trim()

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

/**
 * Classifies every row, handling four distinct "already exists" cases:
 *
 *   1. Student ID exists + status is New/Continuing + data actually changed
 *      → 'update' (returning student with new enrollment number, year level, etc.)
 *   2. Student ID exists + status is New/Continuing + data is identical
 *      → 'skip_duplicate' (nothing to update, re-importing the same file)
 *   3. Student ID exists + status is Graduate/Inactive → 'deactivate'
 *      (already the correct action from classifyRow, no override needed).
 *   4. Only enrollment number matches a different student, or exact
 *      duplicate within the file → 'skip_duplicate'.
 *
 * @param {object[]} rawRows - parsed CSV rows (header-keyed objects)
 * @param {Map<string, object>} existingUsersMap - Map of student_id -> user record from DB
 * @param {Set<string>} existingEnrollmentNumbers - enrollment_number values already in DB
 */
export function classifyRows(rawRows, existingUsersMap, existingEnrollmentNumbers) {
  const seenStudentIds = new Set()
  const seenEnrollmentNumbers = new Set()

  return rawRows.map((row, index) => {
    const studentId = (row['Student ID'] ?? '').trim()
    const enrollmentNumber = (row['Enrollment Number'] ?? '').trim()
    const lastName = (row['Last Name'] ?? '').trim() || null
    const firstName = (row['First Name'] ?? '').trim() || null
    const middleName = (row['Middle Name'] ?? '').trim() || null
    const program = (row['Program/Course'] ?? '').trim() || null
    const yearLevel = (row['Year Level'] ?? '').trim() || null
    const classified = classifyRow(row)

    let action = classified.action
    let errorMessage = classified.error_message

    if (action !== 'error') {
      const isDuplicateInFile =
        seenStudentIds.has(studentId) || seenEnrollmentNumbers.has(enrollmentNumber)

      if (isDuplicateInFile) {
        action = 'skip_duplicate'
        errorMessage = 'duplicate within this file'
      } else if (existingUsersMap.has(studentId)) {
        const existingUser = existingUsersMap.get(studentId)

        if (action === 'create') {
          // Check if anything actually changed vs what's in the DB
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
        // If action is 'deactivate', leave it -- that's correct as-is
      } else if (existingEnrollmentNumbers.has(enrollmentNumber)) {
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
      csv_status: (row['Status'] ?? '').trim() || null,
      action,
      error_message: errorMessage,
    }
  })
}