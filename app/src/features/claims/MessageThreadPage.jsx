import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'
import {
  sendMessage,
  chooseDropoff,
  requestDropoff,
  declineDropoffRequest,
  DROPOFF_CHOSEN_BODY,
  DROPOFF_REQUESTED_BODY,
  DROPOFF_DECLINED_BODY,
} from '../../shared/lib/operations/messages'
import SyncStateChip from '../../shared/components/SyncStateChip'
import {
  useMessages,
  refreshMessages,
  useDropOffStatus,
  refreshDropOffStatus,
} from '../../shared/lib/repositories/messages'
import { getCachedReportDetail } from '../../shared/lib/repositories/reportDetail'
import { onSyncTrigger } from '../../shared/lib/appLifecycle'
import { timeAgo } from '../../shared/lib/timeAgo'
import ValidationDialog from '../../shared/components/ValidationDialog'

const MESSAGE_LIMIT = 10
// Matches Tips' 20/25 (80%) warning threshold, scaled to this limit.
const MESSAGE_WARNING_THRESHOLD = 8

const EMPTY_MESSAGES = []

// Full-screen conversation view, not a card embedded in the report detail
// page - a chat interface needs the input pinned to the bottom of its own
// flex layout so it's never something the browser's keyboard has to guess
// how to scroll into view. Fetches its own {report, claim, names} context
// so it works from a direct link (a push notification, a reopened tab) as
// well as navigating in from the report detail page.
export default function MessageThreadPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()

  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetchThreadContext(id, session.user.id).then((ctx) => {
      if (!cancelled) {
        setContext(ctx)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [id, session.user.id])

  const claim = context?.claim
  const report = context?.report
  const isReporter = context?.isReporter ?? false
  const reporterName = context?.reporterName
  const claimantName = context?.claimantName

  // Read reactively from the local cache (works offline); refreshMessages /
  // refreshDropOffStatus below keep the cache in sync with Supabase whenever
  // we're online. Writes (sendMessage / chooseDropoff) write straight into
  // the same cache, so sent messages appear here immediately.
  const messages = useMessages(claim?.id) ?? EMPTY_MESSAGES
  const dropOffSent = messages.some((m) => m.body === DROPOFF_CHOSEN_BODY)
  // Suggest/accept/decline is negotiated as plain messages, not a DB status -
  // only look at these once there's no confirmed drop-off yet. The most
  // recent 🔔/🚫 marker (if any) is the only one still "live"; anything
  // before it is inert history (a prior declined suggestion, say).
  const openRequest = !dropOffSent
    ? [...messages].reverse().find((m) => m.body === DROPOFF_REQUESTED_BODY || m.body === DROPOFF_DECLINED_BODY)
    : null
  const hasOpenRequest = openRequest?.body === DROPOFF_REQUESTED_BODY
  const requestedByMe = hasOpenRequest && openRequest.sender_id === session.user.id
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
    if (messages.length >= MESSAGE_LIMIT) {
      setSendError(`This conversation has reached the ${MESSAGE_LIMIT}-message limit.`)
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

  const myRole = isReporter ? 'reporter' : 'claimant'

  async function handleSuggestDropoff(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try {
      await requestDropoff({ claimId: claim.id, senderId: session.user.id, senderRole: myRole })
    } catch {
      /* local cache write failed unexpectedly; leave UI as-is */
    }
    setSending(false)
  }

  async function handleAcceptDropoff(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try {
      // Writes straight into the cache sendMessage/dropOffSent read from, so
      // the drop-off marker and banner ("pending" is the default fallback
      // below until refreshDropOffStatus resolves) appear immediately. Always
      // attributes claimant/reporter by their fixed claim roles, regardless
      // of which side clicked Accept - the claimant is the one who will
      // physically bring the item to ISSC either way.
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

  async function handleDeclineDropoff(e) {
    e.preventDefault()
    if (sending) return
    setSending(true)
    try {
      await declineDropoffRequest({ claimId: claim.id, senderId: session.user.id, senderRole: myRole })
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-page">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!claim) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-surface-page px-6 text-center">
        <p className="text-sm text-text-secondary">This conversation isn't available.</p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm font-semibold text-brand-600"
        >
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-surface-page safe-top safe-bottom">
      {/* Header */}
      <div className="bg-brand-600 px-4 pt-12 pb-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
          {otherInitials}
        </div>
        <span className="text-sm font-semibold text-white truncate">{otherName}</span>
        <span
          className={`ml-auto text-[10px] font-medium shrink-0 ${messages.length >= MESSAGE_WARNING_THRESHOLD ? 'text-status-rejected-bg' : 'text-brand-200'}`}
        >
          {messages.length}/{MESSAGE_LIMIT}
        </span>
      </div>

      {/* Messages - fills all remaining space, the only scrollable region */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto flex flex-col gap-3 px-4 py-4"
      >
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
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
          const senderName = getSenderName(msg)

          if (msg.body === DROPOFF_CHOSEN_BODY) {
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

          if (msg.body === DROPOFF_REQUESTED_BODY) {
            // Only the current open request (the most recent 🔔 with no 🚫/📍
            // after it) is actionable - anything older is inert history, e.g.
            // a suggestion that was already declined.
            const isCurrent = hasOpenRequest && openRequest.id === msg.id
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2.5 bg-status-claimed-bg border border-status-claimed-text/20 rounded-xl px-3 py-2.5"
              >
                <span className="text-status-claimed-text mt-0.5 shrink-0">🔔</span>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold text-status-claimed-text">
                    {isMine ? 'You' : senderName} suggested ISSC drop-off
                  </p>
                  <p className="text-[11px] text-status-claimed-text/80 mt-0.5 leading-relaxed">
                    Bring the item to the ISSC office as a safe, verified handoff point.
                  </p>
                  <p className="text-[10px] text-status-claimed-text/50 mt-1">
                    {timeAgo(msg.created_at)}
                  </p>
                  {isCurrent && !isMine && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleAcceptDropoff}
                        disabled={sending}
                        className="h-7 px-3 rounded-lg bg-status-claimed-text text-white text-[11px] font-semibold disabled:opacity-50 hover:opacity-90 transition-opacity"
                      >
                        Accept
                      </button>
                      <button
                        onClick={handleDeclineDropoff}
                        disabled={sending}
                        className="h-7 px-3 rounded-lg border border-status-claimed-text/30 text-status-claimed-text text-[11px] font-semibold disabled:opacity-50 hover:bg-status-claimed-bg transition-colors"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          if (msg.body === DROPOFF_DECLINED_BODY) {
            return (
              <div
                key={msg.id}
                className="flex items-start gap-2.5 bg-surface-muted border border-border rounded-xl px-3 py-2.5"
              >
                <span className="text-text-muted mt-0.5 shrink-0">🚫</span>
                <div>
                  <p className="text-[11px] font-semibold text-text-secondary">
                    {isMine ? 'You' : senderName} declined the ISSC drop-off suggestion
                  </p>
                  <p className="text-[10px] text-text-muted mt-1">
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

      {/* Suggest ISSC drop-off — either party, once, until accepted/declined */}
      {!dropOffSent && !hasOpenRequest && messages.length < MESSAGE_LIMIT && (
        <div className="px-4 pb-2 shrink-0">
          <button
            onClick={handleSuggestDropoff}
            disabled={sending}
            className="w-full h-9 rounded-xl border border-status-claimed-text/30 bg-status-claimed-bg text-status-claimed-text text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            🔔 Suggest ISSC drop-off
          </button>
        </div>
      )}

      {/* Waiting on the other party to accept/decline my own suggestion */}
      {!dropOffSent && hasOpenRequest && requestedByMe && (
        <div className="px-4 pb-2 shrink-0">
          <div className="w-full h-9 rounded-xl border border-border bg-surface-muted text-text-muted text-xs font-medium flex items-center justify-center gap-1.5">
            Waiting for {otherName} to respond…
          </div>
        </div>
      )}

      {/* Input - pinned to the bottom of the flex column, not scrolled to */}
      <ValidationDialog message={sendError} onDismiss={() => setSendError('')} />
      <div className="px-4 py-3 border-t border-border bg-surface-card shrink-0">
        {messages.length >= MESSAGE_LIMIT ? (
          <div className="bg-surface-muted rounded-xl px-3 py-2.5 text-xs text-text-secondary text-center">
            This conversation has reached the maximum of {MESSAGE_LIMIT} messages.
          </div>
        ) : (
          <div className="flex gap-2">
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
              // Tapping a button moves focus to it, which blurs the input
              // and closes the keyboard - keep focus on the input so the
              // keyboard stays put through a send.
              onMouseDown={(e) => e.preventDefault()}
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
        )}
      </div>
    </div>
  )
}

async function fetchThreadContext(reportId, sessionUserId) {
  const { data: reportData, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error || !reportData) {
    // Offline (or otherwise unreachable) - fall back to whatever was cached
    // from a previous visit to the report detail page.
    const cached = await getCachedReportDetail(reportId)
    if (!cached?.claim) return null
    return {
      report: cached.report,
      claim: cached.claim,
      isReporter: cached.report.reporter_id === sessionUserId,
      reporterName: cached.reporter ? `${cached.reporter.first_name} ${cached.reporter.last_name}` : 'Reporter',
      claimantName: cached.claimant ? `${cached.claimant.first_name} ${cached.claimant.last_name}` : 'Finder',
    }
  }

  const { data: claimsData } = await supabase
    .from('claims')
    .select('*')
    .eq('report_id', reportId)
  const activeClaim = claimsData?.find((c) => ['pending', 'approved'].includes(c.status)) ?? null
  if (!activeClaim) return { report: reportData, claim: null }

  const isReporter = reportData.reporter_id === sessionUserId
  const [{ data: reporterUser }, { data: claimantUser }] = await Promise.all([
    supabase.from('users').select('first_name, last_name').eq('id', reportData.reporter_id).single(),
    supabase.from('users').select('first_name, last_name').eq('id', activeClaim.claimant_id).single(),
  ])

  return {
    report: reportData,
    claim: activeClaim,
    isReporter,
    reporterName: reporterUser ? `${reporterUser.first_name} ${reporterUser.last_name}` : 'Reporter',
    claimantName: claimantUser ? `${claimantUser.first_name} ${claimantUser.last_name}` : 'Finder',
  }
}

function MessageSquareIcon({ size = 14, className = "text-brand-600" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}
