// Calls the server (Express locally via server/src/routes/bulkImport.js, or
// the deployed supabase/functions/bulk-import edge function in prod), not
// Supabase directly from the browser -- CSV validation and the all-or-nothing
// commit are server-side logic per ARCHITECTURE.md.
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
export const PENDING_BATCH_KEY = 'campusfind:pendingBulkImportBatch'
export const UPLOAD_IN_PROGRESS_KEY = 'campusfind:bulkImportUploadInProgress'

export async function fetchBulkImportBatch(batchId) {
  const res = await fetch(`${SERVER_URL}/bulk-import/${batchId}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not load import batch.')
  return body // { batch, rows }
}

export async function uploadBulkImportCsv(file, uploadedBy, { signal } = {}) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('uploadedBy', uploadedBy)

  sessionStorage.setItem(UPLOAD_IN_PROGRESS_KEY, '1')

  try {
    const res = await fetch(`${SERVER_URL}/bulk-import`, {
      method: 'POST',
      body: formData,
      signal,
    })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error ?? 'Upload failed.')

    sessionStorage.setItem(PENDING_BATCH_KEY, body.batch.id)

    return body // { batch, rows, counts }
  } finally {
    sessionStorage.removeItem(UPLOAD_IN_PROGRESS_KEY)
  }
}

export async function updateBulkImportRow(batchId, rowId, updates) {
  const res = await fetch(`${SERVER_URL}/bulk-import/${batchId}/rows/${rowId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not update row.')
  return body
}

export async function confirmBulkImport(batchId) {
  const res = await fetch(`${SERVER_URL}/bulk-import/${batchId}/confirm`, { method: 'POST' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Confirm failed.')
  return body
}

export async function cancelBulkImport(batchId) {
  const res = await fetch(`${SERVER_URL}/bulk-import/${batchId}/cancel`, { method: 'POST' })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Cancel failed.')
  return body
}