import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export async function notifyActivity({ title, body, data }) {
  if (!Capacitor.isNativePlatform()) return
  const { display } = await LocalNotifications.checkPermissions()
  if (display !== 'granted') return

  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Math.random() * 2147483647),
        title,
        body,
        extra: data,
        schedule: { at: new Date(Date.now() + 100) },
      },
    ],
  })
}
