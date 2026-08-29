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
  if (data?.length) await db.user_notifications.bulkPut(data)
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
