import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export async function registerPush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready

    // Request permission
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    // Subscribe to push
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    const { endpoint, keys } = subscription.toJSON()

    // Save subscription to Supabase
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: 'user_id, endpoint' }
    )
  } catch (err) {
    console.error('Push registration failed:', err)
  }
}

export async function unregisterPush(userId) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js')
    if (!reg) return
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch (err) {
    console.error('Push unregister failed:', err)
  }
}