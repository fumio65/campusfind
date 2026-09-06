import { useState } from 'react'
import { Check } from 'lucide-react'
import { updateBulkImportRow } from './api'
import StatusPill from '../../../shared/components/admin/StatusPill'

// Editing breaks out of the table grid into a full-width panel instead of
// cramming inputs into narrow cells -- a table cell is the wrong shape for
// a labeled, two-field edit form.
export default function EditPanel({ row, batchId, onSaved, onClose }) {
  const [studentId, setStudentId] = useState(row.student_id ?? '')
  const [enrollmentNumber, setEnrollmentNumber] = useState(row.enrollment_number ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedResult, setSavedResult] = useState(null)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updateBulkImportRow(batchId, row.id, {
        student_id: studentId.trim(),
        enrollment_number: enrollmentNumber.trim(),
      })
      onSaved(updated)
      setSavedResult(updated)
      setTimeout(() => onClose(), 900)
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (savedResult) {
    return (
      <tr className="border-b border-border last:border-0">
        <td colSpan={6} className="p-0">
          <div className={`px-4 py-3 flex items-center gap-2.5 ${
            savedResult.action === 'error' ? 'bg-status-rejected-bg/40' : 'bg-status-open-bg/50'
          }`}>
            {savedResult.action !== 'error' && (
              <Check size={15} className="text-status-open-text shrink-0" aria-hidden="true" />
            )}
            <span className="text-xs font-medium text-text-primary">
              {savedResult.action === 'error' ? "Still has an issue:" : 'Fixed.'}
            </span>
            <StatusPill status={savedResult.action} />
            {savedResult.action === 'error' && (
              <span className="text-xs text-status-rejected-text">{savedResult.error_message}</span>
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td colSpan={6} className="p-0">
        <div className="bg-status-rejected-bg/40 border-y border-status-rejected-text/15 px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-text-primary">
              Fixing {row.last_name}, {row.first_name}
            </span>
            <StatusPill status={row.action} />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <label className="text-xs text-text-secondary block mb-1">Student ID</label>
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="YY-NNNNN"
                className="w-36 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary block mb-1">Enrollment number</label>
              <input
                value={enrollmentNumber}
                onChange={(e) => setEnrollmentNumber(e.target.value)}
                placeholder="6-10 digits"
                className="w-40 h-9 px-3 text-sm rounded-md border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 h-9 text-sm font-medium rounded-md bg-brand-600 text-white disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={onClose}
                disabled={saving}
                className="px-3.5 h-9 text-sm rounded-md border border-border-strong bg-surface-card hover:bg-surface-muted disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
          {saveError && (
            <p className="text-xs text-status-rejected-text mt-2.5">{saveError}</p>
          )}
        </div>
      </td>
    </tr>
  )
}