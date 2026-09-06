import { useState } from 'react'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { TEMPLATE_HEADERS } from './csvTemplate'
import { REQUIRED_FIELDS, guessMapping } from './columnMapping'

export default function ColumnMappingStep({ headers, filename, onConfirm, onCancel }) {
  const [selections, setSelections] = useState(() => guessMapping(headers))

  function handleChange(field, value) {
    setSelections((prev) => ({ ...prev, [field]: value }))
  }

  const usedHeaders = Object.values(selections).filter(Boolean)
  const duplicateHeaders = usedHeaders.filter((h, i) => usedHeaders.indexOf(h) !== i)
  const missingRequired = REQUIRED_FIELDS.filter((field) => !selections[field])
  const canContinue = missingRequired.length === 0 && duplicateHeaders.length === 0

  function handleConfirm() {
    if (!canContinue) return
    // Rename dictionary the server applies right after parsing: csv header
    // -> canonical field name. validateHeaders/classifyRows never see the
    // original header names.
    const mapping = {}
    for (const [field, header] of Object.entries(selections)) {
      if (header) mapping[header] = field
    }
    onConfirm(mapping)
  }

  return (
    <div className="bg-surface-card border border-border rounded-xl p-5">
      <p className="text-sm font-semibold text-text-primary mb-1">Match your columns</p>
      <p className="text-xs text-text-muted mb-4">
        {filename ? `"${filename}" doesn't` : "This file doesn't"} use the exact column names CampusFind
        expects. Match each field below to the column that holds it in your file.
      </p>

      <div className="flex flex-col gap-2.5 mb-4">
        {TEMPLATE_HEADERS.map((field) => {
          const isRequired = REQUIRED_FIELDS.includes(field)
          const value = selections[field] ?? ''
          const isDuplicate = value && duplicateHeaders.includes(value)
          return (
            <div key={field} className="flex items-center gap-3">
              <label className="w-40 shrink-0 text-xs font-medium text-text-secondary">
                {field}
                {isRequired && <span className="text-status-rejected-text"> *</span>}
              </label>
              <select
                value={value}
                onChange={(e) => handleChange(field, e.target.value)}
                className={`flex-1 h-9 px-2.5 text-sm rounded-md border bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 ${
                  isDuplicate ? 'border-status-rejected-text' : 'border-border-strong'
                }`}
              >
                <option value="">{isRequired ? '— Select a column —' : '— Not in file —'}</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {duplicateHeaders.length > 0 && (
        <p className="text-xs text-status-rejected-text flex items-center gap-1.5 mb-3">
          <AlertTriangle size={13} aria-hidden="true" />
          Each column can only be mapped to one field. Fix the duplicate selection
          {duplicateHeaders.length > 1 ? 's' : ''} above.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 h-9 rounded-md border border-border-strong text-sm font-medium text-text-secondary hover:bg-surface-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canContinue}
          className="px-4 h-9 rounded-md bg-brand-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
        >
          Continue <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
