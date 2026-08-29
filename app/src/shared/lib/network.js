import { Network } from '@capacitor/network'
import { useEffect, useState } from 'react'

const listeners = new Set()
let online = true

Network.getStatus().then((status) => {
  online = status.connected
})

Network.addListener('networkStatusChange', (status) => {
  const wasOnline = online
  online = status.connected
  if (!wasOnline && online) {
    for (const listener of listeners) listener()
  }
})

export function isOnline() {
  return online
}

// Fires only on offline -> online transitions (e.g. to trigger a sync flush).
export function onReconnect(callback) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function useOnlineStatus() {
  const [status, setStatus] = useState(online)

  useEffect(() => {
    let mounted = true
    Network.getStatus().then((s) => mounted && setStatus(s.connected))
    const handlePromise = Network.addListener('networkStatusChange', (s) => {
      if (mounted) setStatus(s.connected)
    })
    return () => {
      mounted = false
      handlePromise.then((handle) => handle.remove())
    }
  }, [])

  return status
}
