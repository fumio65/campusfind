import { App } from '@capacitor/app'
import { onReconnect } from './network'

const listeners = new Set()

App.addListener('resume', () => {
  for (const listener of listeners) listener()
})

onReconnect(() => {
  for (const listener of listeners) listener()
})

// Registers a callback fired on app resume, on offline -> online reconnect,
// and on a manual pull-to-refresh (see triggerSync below). All three are
// moments where queued offline work should be flushed and on-screen data
// should be refetched.
export function onSyncTrigger(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

// Fires every onSyncTrigger listener on demand - the pull-to-refresh gesture
// (PullToRefresh.jsx) calls this instead of duplicating each page's own
// refresh logic, since every page that has any already subscribes here.
export function triggerSync() {
  for (const listener of listeners) listener()
}
