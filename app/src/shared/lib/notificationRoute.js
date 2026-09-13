// Where tapping a notification should land, shared between the in-app
// Activity list and the native push/local notification tap handlers so a
// tap always resolves to the same place regardless of how it was received.
const MESSAGE_TYPES = ['new_message', 'dropoff_chosen', 'claim_approved']
const HASH_BY_TYPE = {
  claim_submitted: '#claim',
  claim_rejected:  '#claim',
  tip_submitted:   '#tips',
  tip_reply:       '#tips',
  tip_credited:    '#tips',
}

export function notificationTargetPath({ type, report_id, tip_id }) {
  if (!report_id) return null
  if (MESSAGE_TYPES.includes(type)) return `/reports/${report_id}/messages`
  const hash = HASH_BY_TYPE[type] ?? ''
  const tipParam = tip_id ? `?tip_id=${tip_id}` : ''
  return `/reports/${report_id}${tipParam}${hash}`
}
