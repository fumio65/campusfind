import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import { sendMessage, chooseDropoff } from '../../shared/lib/operations/messages'
import SyncStateChip from '../../shared/components/SyncStateChip'
import {
  useMessages,
  refreshMessages,
  useDropOffStatus,
  refreshDropOffStatus,
} from '../../shared/lib/repositories/messages'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'
import { timeAgo } from '../../shared/lib/timeAgo'

const EMPTY_MESSAGES = []

export default function MessageThread({ claim, report, isReporter, reporterName, claimantName }) {
  const { session } = useAuth()
  // Read reactively from the local cache (works offline); refreshMessages /
  // refreshDropOffStatus below keep the cache in sync with Supabase whenever
  // we're online. Writes (sendMessage / chooseDropoff) write straight into
  // the same cache, so sent messages appear here immediately.
  const messages = useMessages(claim?.id) ?? EMPTY_MESSAGES
  const dropOffSent = messages.some((m) => m.body?.startsWith('📍'))
  const dropOffStatus = useDropOffStatus(claim?.id) // null | 'pending' | 'received' | 'resolved'
  const [text, setText]                   = useState('')
  const [sending, setSending]             = useState(false)
  const [sendError, setSendError]         = useState('')
  const messagesContainerRef = useRef(null)
  const prevCountRef         = useRef(0)
  const isInitialLoad        = useRef(true)

  useEffect(() => {
    if (!claim?.id) return
    refreshMessages(claim.id)
    refreshDropOffStatus(claim.id)

    const channelName = `messages-${claim.id}`
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'claim_messages' }, (payload) => {
        if (payload.new?.claim_id === claim.id) refreshMessages(claim.id)
      })
      // Realtime: banner updates live when admin marks received or resolved
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'dropoff_requests' }, (payload) => {
        if (payload.new?.claim_id === claim.id) refreshDropOffStatus(claim.id)
      })
      .subscribe()

    const unsubscribeSync = onSyncTrigger(() => {
      refreshMessages(claim.id)
      refreshDropOffStatus(claim.id)
    })

    return () => {
      supabase.removeChannel(channel)
      unsubscribeSync()
    }
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
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }
    prevCountRef.current = messages.length
  }, [messages])

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    if (messages.length >= 10) {
      setSendError('This conversation has reached the 10-message limit.')
      return
    }
    setSending(true)
    setSendError('')
    const role = isReporter ? 'reporter' : 'claimant'
    try {
      await sendMessage({
        claimId: claim.id,
        senderId: session.user.id,
        senderRole: role,
        body: text.trim(),
      })
      setText('')
    } catch {
      setSendError('Message failed to send. Please try again.')
    }
    setSending(false)
  }

  async function handleDropOff(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try {
      // Writes straight into the cache sendMessage/dropOffSent read from, so
      // the drop-off marker and banner ("pending" is the default fallback
      // below until refreshDropOffStatus resolves) appear immediately.
      await chooseDropoff({
        reportId: report?.id,
        claimId: claim.id,
        claimantId: claim.claimant_id,
        reporterId: report?.reporter_id,
        senderId: session.user.id,
      })
    } catch {
      /* local cache write failed unexpectedly; leave UI as-is */
    }
    setSending(false)
  }

  // Banner title and message driven by dropoff_requests.status — updates live via realtime
  function getDropOffBanner() {
    const status = dropOffStatus ?? 'pending'

    if (isReporter) {
      switch (status) {
        case 'pending':
          return {
            title: 'ISSC drop-off in progress',
            message: `${claimantName ?? 'The finder'} has chosen to drop off your item at the ISSC office. You'll be notified once the item is received — no need to go yet.`,
          }
        case 'received':
          return {
            title: 'Your item is at the ISSC office',
            message: 'The item has been received by ISSC and is ready for pickup. Head to the ISSC office to collect it.',
          }
        case 'resolved':
          return {
            title: 'Item collected',
            message: 'You have collected your item from the ISSC office. This report is now resolved.',
          }
        default:
          return {
            title: 'ISSC drop-off chosen',
            message: `${claimantName ?? 'The finder'} has chosen ISSC drop-off.`,
          }
      }
    }

    // Claimant
    switch (status) {
      case 'pending':
        return {
          title: 'Drop-off pending',
          message: 'Please bring the item to the ISSC office. The reporter will be notified once ISSC confirms receipt.',
        }
      case 'received':
        return {
          title: 'Item received by ISSC',
          message: 'ISSC has confirmed receipt of the item. The reporter has been notified and will collect it soon.',
        }
      case 'resolved':
        return {
          title: 'Drop-off complete',
          message: 'The reporter has collected the item. This report is now resolved. Thank you for your honesty!',
        }
      default:
        return {
          title: 'ISSC drop-off chosen',
          message: 'Please bring the item to the ISSC office at your earliest convenience.',
        }
    }
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

  const otherName     = isReporter ? (claimantName ?? 'Finder') : (reporterName ?? 'Reporter')
  const otherInitials = getInitials(otherName)
  const myName        = 'You'

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
          const isMine   = msg.sender_id === session.user.id
          const isSystem = msg.body?.startsWith('📍')
          const senderName = getSenderName(msg)

          if (isSystem) {
            const { title, message } = getDropOffBanner()
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2.5 bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-3 py-2.5"
              >
                <span className="text-status-claimed-text mt-0.5 shrink-0">📍</span>
                <div>
                  <p className="text-[11px] font-semibold text-status-claimed-text">
                    {title}
                  </p>
                  <p className="text-[11px] text-status-claimed-text/80 mt-0.5 leading-relaxed">
                    {message}
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
                {isMine && <SyncStateChip status={msg._syncStatus} />}
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
      {sendError && (
        <p className="px-4 pb-1 text-[11px] text-status-rejected-text">{sendError}</p>
      )}
      <div className="px-4 pb-4 pt-1 flex gap-2">
        <input
          type="text"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (sendError) setSendError('')
          }}
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