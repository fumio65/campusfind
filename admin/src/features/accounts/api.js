const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export async function fetchAccounts({ limit = 50, offset = 0, search = '' } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (search) params.set('search', search)
  const res = await fetch(`${SERVER_URL}/accounts?${params}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not load accounts.')
  return body
}

export async function createSingleAccount({ studentId, enrollmentNumber, lastName, firstName }) {
  const res = await fetch(`${SERVER_URL}/accounts/single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, enrollmentNumber, lastName, firstName }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not create account.')
  return body
}

export async function toggleAccountStatus(id, status) {
  const res = await fetch(`${SERVER_URL}/accounts/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not update status.')
  return body
}