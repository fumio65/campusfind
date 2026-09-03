import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, readPersistedSession } from '../lib/supabase'
import { db } from './db'
import { onSyncTrigger } from './appLifecycle'
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Offline with an access token that's actually past its real expiry:
      // getSession() can't refresh it and returns null, even though the
      // refresh token (and account) are still valid - it just can't prove
      // that without a network call. There's no API call to protect while
      // offline anyway, so fall back to the raw cached session rather than
      // bouncing to /login; a real revocation still applies as soon as a
      // network request is actually made once back online.
      const effectiveSession = session ?? (!navigator.onLine ? readPersistedSession() : null)
      setSession(effectiveSession)
      if (effectiveSession) fetchProfile(effectiveSession.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // onAuthStateChange also fires its own INITIAL_SESSION event (same
      // offline-null result as the getSession() call above) - apply the same
      // offline fallback there so it doesn't immediately clobber it with null.
      const effectiveSession =
        session ?? (event === 'INITIAL_SESSION' && !navigator.onLine ? readPersistedSession() : null)
      setSession(effectiveSession)
      if (effectiveSession) fetchProfile(effectiveSession.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Realtime: refresh profile when trust score or any user field changes
  useEffect(() => {
    if (!session?.user?.id) return

    const channelName = 'profile-updates'
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'users',
        filter: `id=eq.${session.user.id}`
      }, () => fetchProfile(session.user.id))
      .subscribe()

    // Realtime events missed while offline aren't replayed on reconnect, so
    // explicitly refresh once connectivity (or the app) comes back. Also
    // re-checks the session itself: if we were running on the offline
    // fallback session (real expiry passed, no network to renew it), this
    // lets the auto-refresh logic validate/renew it right away instead of
    // waiting for the next 30s tick.
    const unsubscribeSync = onSyncTrigger(() => {
      supabase.auth.getSession()
      fetchProfile(session.user.id)
    })

    return () => {
      supabase.removeChannel(channel)
      unsubscribeSync()
    }
  }, [session?.user?.id])

  async function fetchProfile(userId) {
    const cached = await db.profile.get(userId).catch(() => undefined)
    if (cached) setProfile(cached)

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) throw error
      setProfile(data)
      db.profile.put(data).catch(() => {})
    } catch {
      // Offline or request failed - keep the cached profile (if any) rather
      // than clobbering it with null.
    }
  }

  const value = {
    session,
    profile,
    loading: session === undefined,
    isAdmin: profile?.role === 'admin',
    needsPasswordChange: profile?.force_password_change === true,
    refreshProfile: () => session && fetchProfile(session.user.id),
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}