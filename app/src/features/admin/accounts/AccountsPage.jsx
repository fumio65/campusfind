import { useEffect, useState, useRef } from 'react'
import { Plus, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { fetchAccounts, fetchPrograms, createSingleAccount, toggleAccountStatus, resetAccountPassword } from './api'
import StatusPill from '../../../shared/components/admin/StatusPill'
import Dialog from '../../../shared/components/admin/Dialog'

const PAGE_SIZE = 50

export default function AccountsPage() {
  const [showAdd, setShowAdd] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState({
    studentId: '',
    enrollmentNumber: '',
    lastName: '',
    firstName: '',
    departmentCode: '',
    programCode: '',
    yearLevel: '',
  })
  const [departments, setDepartments] = useState([])
  const [departmentsError, setDepartmentsError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  const [successMsg, setSuccessMsg] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [confirmToggle, setConfirmToggle] = useState(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resettingId, setResettingId] = useState(null)
  const [confirmReset, setConfirmReset] = useState(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setOffset(0)
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [search])

  useEffect(() => {
    load(offset, debouncedSearch)
  }, [offset, debouncedSearch])

  // Loaded once, up front - the Add Account dialog's Department/Program
  // dropdowns need this before the dialog ever opens, and it's a small,
  // rarely-changing reference list (not worth refetching per dialog open).
  useEffect(() => {
    fetchPrograms()
      .then(setDepartments)
      .catch((err) => setDepartmentsError(err.message))
  }, [])

  async function load(currentOffset, currentSearch) {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAccounts({ limit: PAGE_SIZE, offset: currentOffset, search: currentSearch })
      setAccounts(result.accounts)
      setTotal(result.total)
    } catch (err) {
      setError(err.message)
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }

  function handleToggleStatus(account) {
    const newStatus = account.status === 'active' ? 'deactivated' : 'active'
    setConfirmToggle({ account, newStatus })
    setConfirmOpen(true)
  }

  function handleCloseConfirm() {
    setConfirmOpen(false)
  }

  function handleOpenAdd() {
    setForm({
      studentId: '',
      enrollmentNumber: '',
      lastName: '',
      firstName: '',
      departmentCode: '',
      programCode: '',
      yearLevel: '',
    })
    setFormError(null)
    setShowAdd(true)
  }

  function handleCloseAdd() {
    setShowAdd(false)
  }

  async function handleConfirmToggle() {
    if (!confirmToggle) return
    const { account, newStatus } = confirmToggle
    setConfirmOpen(false)
    setTogglingId(account.id)
    try {
      const updated = await toggleAccountStatus(account.id, newStatus)
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, status: updated.status } : a)))
    } catch (err) {
      setError(err.message)
    } finally {
      setTogglingId(null)
    }
  }

  function handleResetPassword(account) {
    setConfirmReset(account)
    setConfirmResetOpen(true)
  }

  function handleCloseConfirmReset() {
    setConfirmResetOpen(false)
  }

  async function handleConfirmResetPassword() {
    if (!confirmReset) return
    const account = confirmReset
    setConfirmResetOpen(false)
    setResettingId(account.id)
    try {
      await resetAccountPassword(account.id)
      setSuccessMsg(
        `Password for ${account.first_name} ${account.last_name} (${account.student_id}) has been reset to their enrollment number. They'll be asked to change it on next login.`
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setResettingId(null)
    }
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const studentIdValid = /^\d{2}-\d{5}$/.test(form.studentId)
  const enrollmentValid = /^\d{6,10}$/.test(form.enrollmentNumber)
  const canSubmit = studentIdValid && enrollmentValid && form.lastName.trim() && form.firstName.trim()

  async function handleCreate() {
    setFormError(null)
    setSubmitting(true)
    try {
      await createSingleAccount({
        studentId: form.studentId,
        enrollmentNumber: form.enrollmentNumber,
        lastName: form.lastName,
        firstName: form.firstName,
        programCode: form.programCode,
        yearLevel: form.yearLevel,
      })
      setShowAdd(false)
      setSuccessMsg(`Account ${form.studentId} created.`)
      setOffset(0)
      load(0, debouncedSearch)
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="sticky top-0 z-10 bg-surface-page pb-3 -mx-8 px-8 pt-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-text-primary">Accounts</h2>
          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-2 text-sm font-medium rounded-md bg-brand-600 text-white flex items-center gap-1.5 hover:bg-brand-700 transition-colors"
          >
            <Plus size={14} aria-hidden="true" /> Add account
          </button>
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name or student ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-9 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <Dialog open={!!error} onClose={() => setError(null)} tone="error" title="Error">
        {error}
      </Dialog>

      <Dialog open={!!successMsg} onClose={() => setSuccessMsg(null)} tone="success" title="Success">
        {successMsg}
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={handleCloseConfirm}
        tone={confirmToggle?.newStatus === 'deactivated' ? 'error' : 'info'}
        title={confirmToggle?.newStatus === 'deactivated' ? 'Deactivate account?' : 'Reactivate account?'}
        primaryAction={{
          label: confirmToggle?.newStatus === 'deactivated' ? 'Yes, deactivate' : 'Yes, reactivate',
          onClick: handleConfirmToggle,
          destructive: confirmToggle?.newStatus === 'deactivated',
        }}
        secondaryAction={{ label: 'Cancel', onClick: handleCloseConfirm }}
      >
        {confirmToggle && (
          confirmToggle.newStatus === 'deactivated' ? (
            <>
              <span className="font-medium text-text-primary">
                {confirmToggle.account.first_name} {confirmToggle.account.last_name}
              </span>{' '}
              ({confirmToggle.account.student_id}) will no longer be able to log in or use the app.
              Their records and trust score history are preserved and can be restored at any time.
            </>
          ) : (
            <>
              <span className="font-medium text-text-primary">
                {confirmToggle.account.first_name} {confirmToggle.account.last_name}
              </span>{' '}
              ({confirmToggle.account.student_id}) will regain access to the app with their existing
              records and trust score intact.
            </>
          )
        )}
      </Dialog>

      <Dialog
        open={confirmResetOpen}
        onClose={handleCloseConfirmReset}
        tone="info"
        title="Reset password?"
        primaryAction={{ label: 'Yes, reset', onClick: handleConfirmResetPassword }}
        secondaryAction={{ label: 'Cancel', onClick: handleCloseConfirmReset }}
      >
        {confirmReset && (
          <>
            <span className="font-medium text-text-primary">
              {confirmReset.first_name} {confirmReset.last_name}
            </span>{' '}
            ({confirmReset.student_id})'s password will be reset to their enrollment number,{' '}
            <span className="font-medium text-text-primary">{confirmReset.enrollment_number}</span>.
            They'll be required to set a new password on next login.
          </>
        )}
      </Dialog>

      <Dialog
        open={showAdd}
        onClose={handleCloseAdd}
        tone="info"
        title="Add a single account"
        primaryAction={{
          label: submitting ? 'Creating...' : 'Create account',
          onClick: handleCreate,
          disabled: !canSubmit || submitting,
        }}
        secondaryAction={{ label: 'Cancel', onClick: handleCloseAdd }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-secondary block mb-1">Student ID</label>
            <input
              placeholder="YY-NNNNN"
              value={form.studentId}
              onChange={(e) => setForm({ ...form, studentId: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {form.studentId && !studentIdValid && (
              <p className="text-[11px] text-status-rejected-text mt-1">Format must be YY-NNNNN</p>
            )}
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Enrollment number</label>
            <input
              placeholder="6-10 digits"
              value={form.enrollmentNumber}
              onChange={(e) => setForm({ ...form, enrollmentNumber: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            {form.enrollmentNumber && !enrollmentValid && (
              <p className="text-[11px] text-status-rejected-text mt-1">Must be 6-10 digits</p>
            )}
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Last name</label>
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">First name</label>
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Department</label>
            <select
              value={form.departmentCode}
              onChange={(e) =>
                setForm({ ...form, departmentCode: e.target.value, programCode: '' })
              }
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            >
              <option value="">Select department…</option>
              {departments.map((dept) => (
                <option key={dept.code} value={dept.code}>
                  {dept.code} — {dept.name}
                </option>
              ))}
            </select>
            {departmentsError && (
              <p className="text-[11px] text-status-rejected-text mt-1">
                Couldn't load departments: {departmentsError}
              </p>
            )}
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Program/Course</label>
            <select
              value={form.programCode}
              onChange={(e) => setForm({ ...form, programCode: e.target.value })}
              disabled={!form.departmentCode}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 disabled:opacity-50"
            >
              <option value="">
                {form.departmentCode ? 'Select program…' : 'Select a department first'}
              </option>
              {(departments.find((d) => d.code === form.departmentCode)?.programs ?? []).map(
                (program) => (
                  <option key={program.code} value={program.code}>
                    {program.code} — {program.name}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label className="text-xs text-text-secondary block mb-1">Year level</label>
            <input
              placeholder="1-4"
              value={form.yearLevel}
              onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}
              className="w-full h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
        {formError && <p className="text-xs text-status-rejected-text mt-2.5">{formError}</p>}
        <p className="text-xs text-text-muted mt-3">
          For late enrollees or one-off corrections. For onboarding a full term, use bulk import.
        </p>
      </Dialog>

      {loading ? (
        <div className="text-sm text-text-muted py-8 text-center">Loading...</div>
      ) : accounts.length === 0 ? (
        <div className="bg-surface-card border border-border rounded-xl overflow-hidden py-14 text-center">
          <p className="text-sm font-semibold text-text-primary mb-1">
            {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No accounts yet'}
          </p>
          <p className="text-xs text-text-muted max-w-xs mx-auto">
            {debouncedSearch
              ? 'Try a different name or student ID.'
              : 'Run a bulk import from the Registrar CSV, or add a single account above.'}
          </p>
        </div>
      ) : (
        <>
          <div className="bg-surface-card border border-border rounded-xl">
            <table className="w-full text-sm">
              <thead className="sticky top-[100px] z-10 bg-surface-muted border-b border-border">
                <tr className="text-left text-xs text-text-secondary font-semibold">
                  <th className="py-2.5 px-3">Student ID</th>
                  <th className="py-2.5 px-3">Enrollment no.</th>
                  <th className="py-2.5 px-3">Name</th>
                  <th className="py-2.5 px-3">Program</th>
                  <th className="py-2.5 px-3">Year</th>
                  <th className="py-2.5 px-3">Trust</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="py-2 px-3 font-medium">{a.student_id}</td>
                    <td className="py-2 px-3 text-text-secondary">{a.enrollment_number}</td>
                    <td className="py-2 px-3">{a.name}</td>
                    <td className="py-2 px-3 text-text-secondary">{a.program ?? a.program_code ?? '—'}</td>
                    <td className="py-2 px-3 text-text-secondary">{a.year_level ?? '—'}</td>
                    <td className="py-2 px-3">{a.trust_score}</td>
                    <td className="py-2 px-3"><StatusPill status={a.status} /></td>
                    <td className="py-2 px-3">
                      {a.role !== 'admin' && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleResetPassword(a)}
                            disabled={resettingId === a.id}
                            className="px-2.5 py-1 text-xs font-medium rounded-md border border-border-strong text-text-secondary hover:bg-surface-muted transition-colors disabled:opacity-40"
                          >
                            {resettingId === a.id ? '...' : 'Reset password'}
                          </button>
                          <button
                            onClick={() => handleToggleStatus(a)}
                            disabled={togglingId === a.id}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-40 ${
                              a.status === 'active'
                                ? 'border-status-rejected-text/30 text-status-rejected-text hover:bg-status-rejected-bg'
                                : 'border-status-open-text/30 text-status-open-text hover:bg-status-open-bg'
                            }`}
                          >
                            {togglingId === a.id
                              ? '...'
                              : a.status === 'active'
                                ? 'Deactivate'
                                : 'Reactivate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-text-muted">
              {debouncedSearch
                ? `${total} result${total === 1 ? '' : 's'} for "${debouncedSearch}"`
                : `${total} account${total === 1 ? '' : 's'} total`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs text-text-secondary px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-1.5 rounded-md border border-border-strong hover:bg-surface-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
