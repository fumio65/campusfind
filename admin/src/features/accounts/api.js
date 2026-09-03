import { adminFetch } from '../../shared/lib/apiClient'

export async function fetchAccounts({ limit = 50, offset = 0, search = '' } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (search) params.set('search', search)
  const res = await adminFetch(`/accounts?${params}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not load accounts.')
  return body
}

export async function createSingleAccount({ studentId, enrollmentNumber, lastName, firstName }) {
  const res = await adminFetch('/accounts/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, enrollmentNumber, lastName, firstName }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not create account.')
  return body
}

export async function toggleAccountStatus(id, status) {
  const res = await adminFetch(`/accounts/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not update status.')
  return body
}

export async function resetAccountPassword(id) {
  const res = await adminFetch(`/accounts/${id}/reset-password`, {
    method: 'PATCH',
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not reset password.')
  return body
}
