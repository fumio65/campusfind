import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { db } from './db'
import { onSyncTrigger } from './appLifecycle'
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
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
    // explicitly refresh once connectivity (or the app) comes back.
    const unsubscribeSync = onSyncTrigger(() => fetchProfile(session.user.id))

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