import { supabaseAdmin } from './supabaseAdmin.js'

export async function notifyUser({ userId, type, title, body, reportId = null, claimId = null }) {
  if (!userId) return
  await supabaseAdmin.from('user_notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    report_id: reportId,
    claim_id: claimId,
  })
}