import { adminFetch } from '../../../shared/lib/apiClient'
import { supabase } from '../../../shared/lib/supabase'

// Full NWSSU department/program list, grouped by department for the Add
// Account form's cascading Department -> Program dropdowns. Read-only
// reference data (see 0011_departments_and_programs.sql /
// 0012_programs_rls.sql) - authenticated users can select it directly.
export async function fetchPrograms() {
  const { data, error } = await supabase
    .from('programs')
    .select('department_code, department_name, program_code, program_name')
    .order('department_name', { ascending: true })
    .order('program_name', { ascending: true })
  if (error) throw error

  const departments = []
  const byDept = new Map()
  for (const row of data) {
    let dept = byDept.get(row.department_code)
    if (!dept) {
      dept = { code: row.department_code, name: row.department_name, programs: [] }
      byDept.set(row.department_code, dept)
      departments.push(dept)
    }
    dept.programs.push({ code: row.program_code, name: row.program_name })
  }
  return departments
}

export async function fetchAccounts({ limit = 50, offset = 0, search = '' } = {}) {
  const params = new URLSearchParams({ limit, offset })
  if (search) params.set('search', search)
  const res = await adminFetch(`/accounts?${params}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? 'Could not load accounts.')
  return body
}

export async function createSingleAccount({ studentId, enrollmentNumber, lastName, firstName, programCode, yearLevel }) {
  const res = await adminFetch('/accounts/single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, enrollmentNumber, lastName, firstName, programCode, yearLevel }),
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
