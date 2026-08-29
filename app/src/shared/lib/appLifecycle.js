import { App } from '@capacitor/app'
import { onReconnect } from './network'

const listeners = new Set()

App.addListener('resume', () => {
  for (const listener of listeners) listener()
})

onReconnect(() => {
  for (const listener of listeners) listener()
})

// Registers a callback fired on app resume and on offline -> online
// reconnect. Both are moments where queued offline work should be flushed.
export function onSyncTrigger(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}
