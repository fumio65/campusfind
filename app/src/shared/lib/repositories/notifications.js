import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'
import { enqueue, registerHandler } from '../syncEngine'

// select('*') is safe to cache wholesale here since we're just mirroring
// whatever Supabase returns - unlike the write-path tables, we never
// construct rows for this table ourselves, so unknown columns are harmless.
export async function refreshNotifications(userId) {
  if (!isOnline() || !userId) return
  const { data } = await supabase
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (!data?.length) return

  // A notification whose deleteNotification op is still sitting in the
  // outbox hasn't actually been removed server-side yet (not synced, or
  // offline/retrying) - a row still present in sync_queue for it means
  // that. Without this, a refetch here (triggered by the realtime INSERT
  // listener or a background sync) would see the server's still-existing
  // copy and bulkPut it straight back into the local cache, resurrecting a
  // notification the user just swiped away and deleted.
  const queuedDeletes = await db.sync_queue.where('opType').equals('deleteNotification').toArray()
  const pendingDeleteIds = new Set(queuedDeletes.map((row) => row.payload.id))
  const rows = pendingDeleteIds.size ? data.filter((row) => !pendingDeleteIds.has(row.id)) : data

  if (rows.length) await db.user_notifications.bulkPut(rows)
}

// Reads reactively from the local cache - reflects whatever
// refreshNotifications last wrote, plus any local read-state changes.
export function useNotifications(userId) {
  return useLiveQuery(async () => {
    if (!userId) return []
    const rows = await db.user_notifications.where('user_id').equals(userId).toArray()
    return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [userId])
}

export function useUnreadCount(userId) {
  const notifications = useNotifications(userId)
  return notifications?.filter((n) => !n.read).length ?? 0
}

registerHandler('markNotificationRead', async ({ id }) => {
  const { error } = await supabase.from('user_notifications').update({ read: true }).eq('id', id)
  if (error) throw error
})

export async function markNotificationRead(notificationId) {
  await db.user_notifications.update(notificationId, { read: true })
  await enqueue({
    id: crypto.randomUUID(),
    opType: 'markNotificationRead',
    entity: 'user_notifications',
    payload: { id: notificationId },
  })
}

registerHandler('markAllNotificationsRead', async ({ ids }) => {
  const { error } = await supabase.from('user_notifications').update({ read: true }).in('id', ids)
  if (error) throw error
})

export async function markAllNotificationsRead(userId) {
  const unread = (await db.user_notifications.where('user_id').equals(userId).toArray()).filter((n) => !n.read)
  if (!unread.length) return
  await db.user_notifications.bulkPut(unread.map((n) => ({ ...n, read: true })))
  await enqueue({
    id: crypto.randomUUID(),
    opType: 'markAllNotificationsRead',
    entity: 'user_notifications',
    payload: { ids: unread.map((n) => n.id) },
  })
}

// Permanently removes one notification. The Activity page doesn't call this
// directly off a swipe/tap - it holds the delete in a local "pending" state
// with an Undo toast first, and only commits by calling this once that
// window expires without the user undoing it (see ActivityPage.jsx). A
// notification carries no downstream state of its own (unlike a report or
// claim), so there's nothing else to clean up here.
registerHandler('deleteNotification', async ({ id }) => {
  const { error } = await supabase.from('user_notifications').delete().eq('id', id)
  if (error) throw error
})

export async function deleteNotification(notificationId) {
  await db.user_notifications.delete(notificationId)
  await enqueue({
    id: crypto.randomUUID(),
    opType: 'deleteNotification',
    entity: 'user_notifications',
    payload: { id: notificationId },
  })
}
