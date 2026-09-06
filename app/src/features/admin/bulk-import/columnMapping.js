import { TEMPLATE_HEADERS } from './csvTemplate'

// Fields the server actually requires - mirrors REQUIRED_COLUMNS in
// server/src/lib/bulkImportValidation.js and
// supabase/functions/bulk-import/index.ts. Middle Name is the only
// optional field, so it's the only one missing from that list.
export const REQUIRED_FIELDS = TEMPLATE_HEADERS.filter((field) => field !== 'Middle Name')

function parseCsvLine(line) {
  const fields = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

// Only reads the header row - the mapping step only needs column names,
// not the full parsed file (that stays server-side, same as today). Strips
// a leading BOM (Excel's "CSV UTF-8" export adds one) so header names here
// match what the server's own CSV parser sees - otherwise a mapped column
// could silently fail to rename because the dictionary key still carried
// the BOM.
export function parseCsvHeaderRow(text) {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = withoutBom.split(/\r\n|\r|\n/, 1)[0] ?? ''
  if (!firstLine.trim()) return []
  return parseCsvLine(firstLine)
}

export function headersAlreadyMatch(headers) {
  return REQUIRED_FIELDS.every((field) => headers.includes(field))
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Common real-world header spellings, used only to prefill a best guess -
// every field stays editable regardless of whether a synonym matched.
const SYNONYMS = {
  'Student ID': ['studentid', 'idno', 'idnumber', 'schoolid'],
  'Enrollment Number': ['enrollmentno', 'enrollmentnumber', 'enrollmentid'],
  'Last Name': ['surname', 'lastname', 'familyname'],
  'First Name': ['firstname', 'givenname'],
  'Middle Name': ['middlename', 'mi', 'middleinitial'],
  'Program/Course': ['course', 'program', 'programcourse'],
  'Year Level': ['yearlevel', 'year'],
  Status: ['status', 'enrollmentstatus'],
}

// { [canonicalField]: matchedCsvHeader | '' }
export function guessMapping(headers) {
  const guess = {}
  for (const field of TEMPLATE_HEADERS) {
    const exact = headers.find((h) => h === field)
    if (exact) {
      guess[field] = exact
      continue
    }
    const targets = [normalize(field), ...(SYNONYMS[field] ?? [])]
    guess[field] = headers.find((h) => targets.includes(normalize(h))) ?? ''
  }
  return guess
}
