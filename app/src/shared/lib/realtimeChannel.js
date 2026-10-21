// supabase.channel(name) returns the EXISTING channel when one with that name
// is still registered, and adding .on() listeners to an already-subscribed
// channel throws ("cannot add postgres_changes callbacks ... after
// subscribe()"). removeChannel() is asynchronous, so a page that remounts
// quickly (revisiting a tab, React StrictMode, or an effect re-running when a
// filter changes) could hit the old channel and crash the whole dashboard to
// a blank screen. Giving every subscription its own name avoids that.
export function uniqueChannelName(base) {
  const suffix =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return `${base}-${suffix}`
}
