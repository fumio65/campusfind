import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export default function MessageThread({ claim, report, isReporter, reporterName, claimantName }) {
  const { session } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [dropOffSent, setDropOffSent] = useState(false)
  const messagesContainerRef = useRef(null)
  const prevCountRef = useRef(0)
  const isInitialLoad = useRef(true)

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
    if (isInitialLoad.current) {
      isInitialLoad.current = false
      prevCountRef.current = messages.length
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
      return
    }
    if (messages.length > prevCountRef.current) {
      const lastMsg = messages[messages.length - 1]
      if (lastMsg && lastMsg.sender_id !== session?.user?.id) {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }
    }
    prevCountRef.current = messages.length
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
    const { error } = await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: role,
      body: text.trim(),
    })
    if (!error) {
      setText('')
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
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

    console.log('[dropoff] report:', report)
    console.log('[dropoff] claim:', claim)
    console.log('[dropoff] payload:', {
      reportId: report?.id,
      claimId: claim.id,
      claimantId: claim.claimant_id,
      reporterId: report?.reporter_id,
    })

    const body = '📍 ISSC_DROPOFF'
    const { error } = await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: 'claimant',
      body,
    })

    if (!error) {
      setDropOffSent(true)
      try {
        await fetch(`${SERVER_URL}/dropoff`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId: report?.id,
            claimId: claim.id,
            claimantId: claim.claimant_id,
            reporterId: report?.reporter_id,
          }),
        })
      } catch { /* ignore */ }
    }
    setSending(false)
  }

  function getDropOffMessage() {
    if (isReporter) {
      return `${claimantName ?? 'The finder'} has chosen ISSC drop-off. Head to the ISSC office to collect your item.`
    }
    return `You have chosen ISSC drop-off. Please bring the item to the ISSC office at your earliest convenience.`
  }

  function getSenderName(msg) {
    if (msg.sender_id === session.user.id) return 'You'
    return msg.sender_role === 'reporter'
      ? (reporterName ?? 'Reporter')
      : (claimantName ?? 'Finder')
  }

  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0][0].toUpperCase()
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

  const otherName = isReporter ? (claimantName ?? 'Finder') : (reporterName ?? 'Reporter')
  const otherInitials = getInitials(otherName)
  const myName = 'You'

  return (
    <div className="bg-surface-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <MessageSquareIcon />
        <span className="text-xs font-semibold text-text-primary">Message thread</span>
        <span className="ml-auto text-[10px] text-text-muted">
          {isReporter ? `with ${claimantName ?? 'Finder'}` : `with ${reporterName ?? 'Reporter'}`}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex flex-col gap-3 px-4 py-4 max-h-72 overflow-y-auto"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <div className="w-10 h-10 rounded-full bg-surface-muted flex items-center justify-center">
              <MessageSquareIcon size={18} className="text-text-muted" />
            </div>
            <p className="text-xs text-text-muted text-center">
              No messages yet. Start the conversation.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === session.user.id
          const isSystem = msg.body?.startsWith('📍')
          const senderName = getSenderName(msg)

          if (isSystem) {
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2.5 bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-3 py-2.5"
              >
                <span className="text-status-claimed-text mt-0.5 shrink-0">📍</span>
                <div>
                  <p className="text-[11px] font-semibold text-status-claimed-text">
                    ISSC drop-off chosen
                  </p>
                  <p className="text-[11px] text-status-claimed-text/80 mt-0.5 leading-relaxed">
                    {getDropOffMessage()}
                  </p>
                  <p className="text-[10px] text-status-claimed-text/50 mt-1">
                    {timeAgo(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex items-center gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                    isMine
                      ? 'bg-brand-600 text-white'
                      : 'bg-brand-50 text-brand-600 border border-brand-200'
                  }`}
                >
                  {isMine ? getInitials(myName) : otherInitials}
                </div>
                <span className="text-[10px] text-text-muted">
                  {senderName} · {timeAgo(msg.created_at)}
                </span>
              </div>

              <div
                className={`max-w-[78%] rounded-2xl px-3 py-2 ${
                  isMine
                    ? 'bg-brand-600 text-white rounded-br-sm'
                    : 'bg-surface-muted text-text-primary rounded-bl-sm border border-border'
                }`}
              >
                <p className="text-xs leading-relaxed">{msg.body}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Drop-off button — claimant only, once */}
      {!isReporter && !dropOffSent && (
        <div className="px-4 pb-2">
          <button
            onClick={handleDropOff}
            disabled={sending}
            className="w-full h-9 rounded-xl border border-status-claimed-text/30 bg-status-claimed-bg text-status-claimed-text text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            📍 Choose ISSC drop-off
          </button>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-1 flex gap-2">
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend(e)}
          maxLength={300}
          className="flex-1 h-10 px-3 text-xs rounded-xl border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted"
        />
        <button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="h-10 px-4 rounded-xl bg-brand-600 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 hover:bg-brand-700 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
          </svg>
          Send
        </button>
      </div>
    </div>
  )
}

function MessageSquareIcon({ size = 14, className = "text-brand-600" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}