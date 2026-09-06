// Column order and names must exactly match REQUIRED_COLUMNS in
// server/src/lib/bulkImportValidation.js. If that list changes, update this
// too -- a mismatched template would just generate more error rows instead
// of helping the admin avoid them.
export const TEMPLATE_HEADERS = [
  'Student ID',
  'Enrollment Number',
  'Last Name',
  'First Name',
  'Middle Name',
  'Program/Course',
  'Year Level',
  'Status',
]

export const TEMPLATE_EXAMPLE_ROWS = [
  ['24-00301', '2024110055', 'Dela Cruz', 'Juan', 'Santos', 'BS Information Technology', '1', 'New'],
  ['22-00150', '2022100789', 'Reyes', 'Maria', '', 'BS Computer Science', '3', 'Continuing'],
  ['18-00045', '2018100456', 'Santos', 'Pedro', 'Garcia', 'BS Civil Engineering', '4', 'Continuing'],
]

function escapeCsvField(value) {
  if (value == null) return ''
  const str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function buildBulkImportTemplateCsv() {
  const lines = [
    TEMPLATE_HEADERS.map(escapeCsvField).join(','),
    ...TEMPLATE_EXAMPLE_ROWS.map((row) => row.map(escapeCsvField).join(',')),
  ]
  return lines.join('\r\n')
}

export function downloadBulkImportTemplate() {
  const csv = buildBulkImportTemplateCsv()
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'campusfind_bulk_import_template.csv'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}