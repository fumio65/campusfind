// How report statuses are grouped and worded for students.
//
// The database statuses (open / claimed / approved / resolved) stay as they
// are; this only decides which reports a Home tab shows and the plain-language
// label each card carries, so students can tell at a glance whether an item
// still needs help.

// Home feed tabs. "active" is the default: everything not yet returned, so a
// report doesn't vanish from the feed the moment someone claims it (a claim
// can still be rejected and the item reopened).
export const STATUS_TABS = [
  { value: 'active', label: 'Active', statuses: ['open', 'claimed', 'approved'] },
  { value: 'open', label: 'Open', statuses: ['open'] },
  { value: 'claimed', label: 'Under review', statuses: ['claimed'] },
  { value: 'approved', label: 'Claim approved', statuses: ['approved'] },
  { value: 'resolved', label: 'Returned', statuses: ['resolved'] },
]

export const ALL_VISIBLE_STATUSES = ['open', 'claimed', 'approved', 'resolved']

// Database statuses a tab (or a single status) covers.
export function statusesFor(tab) {
  if (!tab) return ALL_VISIBLE_STATUSES
  return STATUS_TABS.find((t) => t.value === tab)?.statuses ?? [tab]
}

// Label, optional one-line hint, badge colours, and whether the card should
// be visually quieter (someone is already handling it).
export function statusDisplay(report) {
  const walkIn = report?.type === 'found_walkin'
  switch (report?.status) {
    case 'open':
      return walkIn
        ? { label: 'At ISSC office', hint: null, style: 'bg-status-open-bg text-status-open-text', quiet: false }
        : { label: 'Still missing', hint: null, style: 'bg-status-open-bg text-status-open-text', quiet: false }
    case 'claimed':
      return {
        label: 'Under review',
        hint: 'Someone has claimed this. You can still leave a tip.',
        style: 'bg-status-claimed-bg text-status-claimed-text',
        quiet: true,
      }
    case 'approved':
      return {
        label: 'Claim approved',
        hint: 'The reporter approved a claim and is arranging the handoff.',
        style: 'bg-status-approved-bg text-status-approved-text',
        quiet: true,
      }
    case 'resolved':
      return { label: 'Returned', hint: null, style: 'bg-status-resolved-bg text-status-resolved-text', quiet: true }
    default:
      return { label: report?.status ?? '', hint: null, style: 'bg-surface-muted text-text-secondary', quiet: false }
  }
}
