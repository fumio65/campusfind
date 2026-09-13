import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { supabase } from './supabase'
import { notifyActivity } from './localNotifications'
import { notificationTargetPath } from './notificationRoute'

const PROMPT_STATES = ['prompt', 'prompt-with-rationale']

let initialized = false

// onNavigate(path) is called when the user taps a delivered notification -
// whether it arrived as a native push (background/killed) or as the local
// notification we show ourselves for the foreground case below - so both
// paths land on the same report the way tapping it in the Activity list does.
export async function registerPushToken(userId, onNavigate) {
  if (!Capacitor.isNativePlatform() || initialized) return
  initialized = true

  try {
    const current = await PushNotifications.checkPermissions()
    let status = current.receive
    if (PROMPT_STATES.includes(status)) {
      const requested = await PushNotifications.requestPermissions()
      status = requested.receive
    }
    if (status !== 'granted') {
      initialized = false
      return
    }

    await PushNotifications.addListener('registration', async (token) => {
      const { error } = await supabase.from('push_tokens').upsert(
        { user_id: userId, token: token.value, platform: 'android' },
        { onConflict: 'user_id, token' }
      )
      if (error) console.error('Failed to save push token:', JSON.stringify(error))
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration error:', JSON.stringify(err))
    })

    // Android only auto-displays a push in the system tray when the app's
    // JS isn't running (backgrounded/killed). While the app is alive, FCM
    // routes the message here instead, so we have to show it ourselves.
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      notifyActivity({ title: notification.title, body: notification.body, data: notification.data })
        .catch((err) => console.error('Failed to display received push:', err))
    })

    // Tapping a push while the app was backgrounded/killed.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const path = notificationTargetPath(action.notification?.data ?? {})
      if (path) onNavigate?.(path)
    })

    // Tapping the local notification we show ourselves for the foreground case.
    await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const path = notificationTargetPath(action.notification?.extra ?? {})
      if (path) onNavigate?.(path)
    })

    await PushNotifications.register()
  } catch (err) {
    initialized = false
    console.error('Failed to register for push notifications:', err instanceof Error ? err.message : JSON.stringify(err))
  }
}
