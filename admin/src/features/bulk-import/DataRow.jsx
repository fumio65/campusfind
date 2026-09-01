import { motion } from 'framer-motion'
import { Pencil, PenLine } from 'lucide-react'
import StatusPill from '../../shared/components/StatusPill'

function Diff({ from, to }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-text-muted line-through">{from ?? '—'}</span>
      <span className="text-text-muted">→</span>
      <span className="font-medium text-text-primary">{to ?? '—'}</span>
    </span>
  )
}

export default function DataRow({ row, canEdit, isEditing, onStartEdit, justFixed = false }) {
  const message = row.error_message ?? ''
  const studentIdBad = row.action === 'error' && /student id/i.test(message)
  const enrollmentBad = row.action === 'error' && /enrollment/i.test(message)

  const isUpdate = row.action === 'update'
  const enrollmentChanged = isUpdate && row.previous_enrollment_number !== row.enrollment_number
  const programChanged = isUpdate && (row.previous_program ?? null) !== (row.program ?? null)
  const yearLevelChanged = isUpdate && (row.previous_year_level ?? null) !== (row.year_level ?? null)
  const nameChanged =
    isUpdate &&
    ((row.previous_last_name ?? null) !== (row.last_name ?? null) ||
      (row.previous_first_name ?? null) !== (row.first_name ?? null) ||
      (row.previous_middle_name ?? null) !== (row.middle_name ?? null))

  const changeNotes = []
  if (yearLevelChanged) {
    changeNotes.push(<Diff key="year" from={row.previous_year_level} to={row.year_level} />)
  }
  if (programChanged) {
    changeNotes.push(<Diff key="program" from={row.previous_program} to={row.program} />)
  }
  if (nameChanged) {
    changeNotes.push(<span key="name" className="text-text-secondary">Name updated</span>)
  }

  return (
    <motion.tr
      className="border-b border-border last:border-0"
      animate={justFixed ? { backgroundColor: ['rgba(15,110,86,0.12)', 'rgba(15,110,86,0)'] } : {}}
      transition={{ duration: 2.2, ease: 'easeOut' }}
    >
      <td className={`py-2 px-3 ${studentIdBad ? 'text-status-rejected-text font-medium' : ''}`}>
        {row.student_id}
      </td>
      <td className={`py-2 px-3 ${enrollmentBad ? 'text-status-rejected-text font-medium' : ''}`}>
        {enrollmentChanged ? (
          <Diff from={row.previous_enrollment_number} to={row.enrollment_number} />
        ) : (
          row.enrollment_number
        )}
      </td>
      <td className="py-2 px-3">{row.last_name}, {row.first_name}</td>
      <td className="py-2 px-3 text-text-secondary">{row.csv_status}</td>
      <td className="py-2 px-3">
        <div className="flex items-center gap-1.5">
          <StatusPill status={row.action} />
          {row.edited && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted border border-border-strong rounded-full px-1.5 py-0.5"
              title="This row's values were corrected from the original file"
            >
              <PenLine size={9} aria-hidden="true" /> Corrected
            </span>
          )}
        </div>
      </td>
      <td className="py-2 px-3">
        <div className="flex items-center justify-between gap-3">
          {changeNotes.length > 0 ? (
            <span className="text-xs flex items-center gap-2.5 flex-wrap">{changeNotes}</span>
          ) : (
            <span className="text-status-rejected-text text-xs">{row.error_message ?? ''}</span>
          )}
          {row.action === 'error' && canEdit && !isEditing && (
            <button
              onClick={onStartEdit}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-status-rejected-text/30 text-status-rejected-text hover:bg-status-rejected-bg transition-colors"
            >
              <Pencil size={12} /> Fix
            </button>
          )}
        </div>
      </td>
    </motion.tr>
  )
}