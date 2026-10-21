const STATUS_STYLES = {
  open: 'bg-status-open-bg text-status-open-text',
  claimed: 'bg-status-claimed-bg text-status-claimed-text',
  approved: 'bg-status-approved-bg text-status-approved-text',
  resolved: 'bg-status-resolved-bg text-status-resolved-text',
  rejected: 'bg-status-rejected-bg text-status-rejected-text',
  pending: 'bg-status-claimed-bg text-status-claimed-text',
  active: 'bg-status-open-bg text-status-open-text',
  pending_setup: 'bg-status-claimed-bg text-status-claimed-text',
  deactivated: 'bg-surface-muted text-text-secondary',
  create: 'bg-status-open-bg text-status-open-text',
  update: 'bg-status-approved-bg text-status-approved-text',
  deactivate: 'bg-status-claimed-bg text-status-claimed-text',
  skip_duplicate: 'bg-surface-muted text-text-secondary',
  error: 'bg-status-rejected-bg text-status-rejected-text',
}

const STATUS_LABELS = {
  // Report statuses, worded as in the student app.
  open: 'Missing',
  claimed: 'In review',
  approved: 'Approved',
  resolved: 'Returned',
  rejected: 'Rejected',
  pending: 'Pending',
  active: 'Active',
  pending_setup: 'Pending setup',
  deactivated: 'Deactivated',
  create: 'Create',
  update: 'Update',
  deactivate: 'Deactivate',
  skip_duplicate: 'Skip duplicate',
  error: 'Error',
}

export default function StatusPill({ status, title }) {
  const style = STATUS_STYLES[status] ?? 'bg-surface-muted text-text-secondary'
  const label = STATUS_LABELS[status] ?? status

  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${style}`}>
      {label}
    </span>
  )
}