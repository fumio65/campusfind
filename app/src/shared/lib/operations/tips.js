import { supabase } from '../supabase'
import { db } from '../db'
import { enqueue, registerHandler, isPrimaryKeyConflict } from '../syncEngine'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

registerHandler('submitTip', async (tip) => {
  const { error } = await supabase.from('tips').insert({
    id: tip.id,
    report_id: tip.report_id,
    user_id: tip.user_id,
    text: tip.text,
    parent_tip_id: tip.parent_tip_id,
  })
  if (error && !isPrimaryKeyConflict(error)) throw error
  notifyTipServer(tip).catch(() => {})
})

function notifyTipServer(tip) {
  return fetch(`${SERVER_URL}/tips/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: tip.report_id,
      tipAuthorId: tip.user_id,
      parentTipId: tip.parent_tip_id,
      tipId: tip.id,
    }),
  })
}

// Writes optimistically to the local cache and queues the insert. Used for
// both the online-immediate and offline-queued paths - the queued replay
// runs the exact same 'submitTip' handler registered above.
export async function submitTip({ reportId, userId, text, parentTipId }) {
  const tip = {
    id: crypto.randomUUID(),
    report_id: reportId,
    user_id: userId,
    text,
    parent_tip_id: parentTipId ?? null,
    created_at: new Date().toISOString(),
    credited: false,
    converted_to_claim_id: null,
  }
  tip._syncStatus = 'pending'
  await db.tips.put(tip)
  await enqueue({
    id: tip.id,
    opType: 'submitTip',
    entity: 'tips',
    payload: tip,
    rows: [{ table: 'tips', id: tip.id }],
  })
  return tip
}
