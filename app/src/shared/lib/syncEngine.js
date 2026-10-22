import { db } from './db'
import { onSyncTrigger } from './appLifecycle'

const handlers = new Map()

// Screens that want to know when a queued change has actually reached the
// server. Without this, a screen opened right after saving (e.g. the report
// page after "Save changes") read the server before the background upload
// finished and had no way to learn it should refresh - so a new photo only
// appeared after reloading.
const syncedListeners = new Set()
export function onOpSynced(listener) {
  syncedListeners.add(listener)
  return () => syncedListeners.delete(listener)
}

// Registers the function that replays a queued operation of this type.
// The same function should be called directly for the immediate-online path
// so online and offline behavior can never drift apart.
export function registerHandler(opType, handler) {
  handlers.set(opType, handler)
}

// A 23505 (unique_violation) whose `details` names the given id column means
// a previous attempt at this exact operation already landed - treat as done,
// not as a conflict. A 23505 on any other constraint is a real conflict and
// must NOT be swallowed here.
export function isPrimaryKeyConflict(error, idColumn = 'id') {
  return (
    error?.code === '23505' &&
    typeof error?.details === 'string' &&
    error.details.startsWith(`Key (${idColumn})=`)
  )
}

function isTransient(error) {
  if (!error) return false
  if (error.name === 'TypeError' || error.name === 'AbortError') return true
  if (typeof error.code === 'string' && error.code.startsWith('08')) return true
  const status = error.status ?? error.statusCode
  if (status === 401 || (status >= 500 && status < 600)) return true
  if (!error.code && !status) return true
  return false
}

let flushing = false

// Processes the queue in FIFO order. Stops (preserving order) on the first
// transient failure so it can be retried later; terminal failures are
// marked 'failed' and the queue advances past them.
//
// FIX: used to also bail out whenever isOnline() reported false. That flag
// comes from the Capacitor Network plugin and can go stale or misreport
// (observed: "Try again" on a failed change doing nothing even with a
// working connection) - with no feedback, since flush() just silently
// returned. Now the actual request is the source of truth: if the device is
// genuinely offline, the fetch itself throws and isTransient() below
// already schedules a backoff retry, so nothing is lost - it's just no
// longer possible for a stale flag to block a sync that would have worked.
export async function flush() {
  if (flushing) return
  flushing = true
  try {
    for (;;) {
      const now = Date.now()
      const next = await db.sync_queue
        .where('status')
        .equals('pending')
        .filter((row) => !row.nextRetryAt || row.nextRetryAt <= now)
        .first()
      if (!next) return

      const handler = handlers.get(next.opType)
      if (!handler) {
        await db.sync_queue.delete(next.seq)
        continue
      }

      try {
        await handler(next.payload)
        await db.sync_queue.delete(next.seq)
        await markRowsSyncStatus(next.rows, 'synced')
        for (const listener of syncedListeners) {
          try { listener(next) } catch { /* a screen's listener must not stall the queue */ }
        }
      } catch (error) {
        const message = error?.message ?? String(error)
        if (isTransient(error)) {
          const retryCount = (next.retryCount ?? 0) + 1
          await db.sync_queue.update(next.seq, {
            retryCount,
            lastError: message,
            nextRetryAt: Date.now() + Math.min(1000 * 2 ** retryCount, 60_000),
          })
          return
        }
        // 23503 (foreign_key_violation): the report/claim this change
        // belongs to no longer exists (e.g. it was deleted), so the change
        // can never succeed. Drop it and its unsent local copy instead of
        // leaving a permanent "couldn't sync" behind.
        if (error?.code === '23503') {
          await db.sync_queue.delete(next.seq)
          await removeLocalRows(next.rows)
          continue
        }
        await db.sync_queue.update(next.seq, { status: 'failed', lastError: message })
        await markRowsSyncStatus(next.rows, 'failed')
      }
    }
  } finally {
    flushing = false
  }
}

// Updates the `_syncStatus` flag on the cached row(s) a queued operation
// touches, so UI reading them from the cache can show a pending/syncing/
// failed indicator - purely a local cache annotation, never sent to Supabase.
async function markRowsSyncStatus(rows, status) {
  for (const row of rows ?? []) {
    await db[row.table].update(row.id, { _syncStatus: status }).catch(() => {})
  }
}

async function removeLocalRows(rows) {
  for (const row of rows ?? []) {
    await db[row.table]?.delete(row.id).catch(() => {})
  }
}

// Puts every failed change back in the queue and tries again (from the
// "couldn't sync" badge).
export async function retryFailed() {
  const failed = await db.sync_queue.where('status').equals('failed').toArray()
  for (const row of failed) {
    await db.sync_queue.update(row.seq, { status: 'pending', retryCount: 0, nextRetryAt: null })
    await markRowsSyncStatus(row.rows, 'pending')
  }
  await flush()
}

// Gives up on failed changes: removes them from the queue and removes their
// unsent local copies, which never reached the server.
export async function discardFailed() {
  const failed = await db.sync_queue.where('status').equals('failed').toArray()
  for (const row of failed) {
    await db.sync_queue.delete(row.seq)
    await removeLocalRows(row.rows)
  }
}

export async function enqueue({ id, opType, entity, payload, rows }) {
  await db.sync_queue.add({
    id,
    opType,
    entity,
    payload,
    rows: rows ?? [],
    status: 'pending',
    createdAt: Date.now(),
    retryCount: 0,
    lastError: null,
    nextRetryAt: null,
  })
  flush()
}

onSyncTrigger(flush)
