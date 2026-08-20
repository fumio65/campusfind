import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export default function MessageThread({ claim, report, isReporter }) {
  const { session } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [dropOffSent, setDropOffSent] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!claim?.id) return
    fetchMessages()

    const channelName = `messages-${claim.id}`
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'claim_messages',
        },
        (payload) => {
          if (payload.new?.claim_id === claim.id) {
            fetchMessages()
          }
        },
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [claim?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    const { data } = await supabase
      .from('claim_messages')
      .select('id, body, sender_role, created_at, sender_id')
      .eq('claim_id', claim.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])

    const hasDropOff = (data ?? []).some((m) => m.body?.startsWith('📍'))
    if (hasDropOff) setDropOffSent(true)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    const role = isReporter ? 'reporter' : 'claimant'
    console.log('[MessageThread] inserting:', {
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: role,
      body: text.trim(),
    })
    const { error } = await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: role,
      body: text.trim(),
    })
    if (error) {
      console.error('[MessageThread] insert error:', error)
    }
    if (!error) {
      setText('')
      fetchMessages()
      try {
        await fetch(`${SERVER_URL}/claims/${claim.id}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: session.user.id, senderRole: role }),
        })
      } catch { /* ignore */ }
    }
    setSending(false)
  }

  async function handleDropOff(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    const body = '📍 The finder has chosen ISSC drop-off. Please bring the item to the ISSC office at your earliest convenience.'
    const { error } = await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: 'claimant',
      body,
    })
    if (!error) {
      setDropOffSent(true)
      try {
        await fetch(`${SERVER_URL}/claims/${claim.id}/dropoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reportId: report?.id }),
        })
      } catch { /* ignore */ }
      fetchMessages()
    }
    setSending(false)
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 0) return 'just now'
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="bg-surface-card rounded-2xl border border-border p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-text-primary">Message thread</p>

      {/* Messages */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">
            No messages yet. Start the conversation.
          </p>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === session.user.id
          const isSystem = msg.body?.startsWith('📍')
          if (isSystem) {
            return (
              <div key={msg.id} className="bg-status-claimed-bg rounded-xl px-3 py-2.5 text-center">
                <p className="text-[11px] text-status-claimed-text font-medium">{msg.body}</p>
                <p className="text-[10px] text-status-claimed-text/60 mt-0.5">{timeAgo(msg.created_at)}</p>
              </div>
            )
          }
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                  isMine
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-surface-muted text-text-primary rounded-bl-sm'
                }`}
              >
                <p className="text-xs leading-relaxed">{msg.body}</p>
                <p className={`text-[10px] mt-0.5 ${isMine ? 'text-white/60' : 'text-text-muted'}`}>
                  {timeAgo(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Drop-off button — claimant only, once */}
      {!isReporter && !dropOffSent && (
        <button
          onClick={handleDropOff}
          disabled={sending}
          className="w-full h-10 rounded-xl border border-status-claimed-text/30 text-status-claimed-text text-xs font-semibold hover:bg-status-claimed-bg transition-colors disabled:opacity-50"
        >
          📍 Choose ISSC drop-off
        </button>
      )}

      {/* Message input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          className="flex-1 h-10 px-3 text-xs rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="h-10 px-4 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}