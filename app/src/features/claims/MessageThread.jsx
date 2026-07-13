import { useEffect, useState, useRef } from 'react'
import { Send, MapPin, CheckCircle2 } from 'lucide-react'
import { supabase } from '../../shared/lib/supabase'
import { useAuth } from '../../shared/lib/AuthContext'

const MAX_MESSAGES = 10
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

export default function MessageThread({ claim, isReporter }) {
  const { session } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dropOffChosen, setDropOffChosen] = useState(false)
  const [participants, setParticipants] = useState({})
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!claim?.id) return
    fetchMessages()
    fetchParticipants()

    const channel = supabase
      .channel(`claim-messages-${claim.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'claim_messages', filter: `claim_id=eq.${claim.id}` },
        () => fetchMessages()
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [claim?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchParticipants() {
    if (!claim?.claimant_id) return
    const { data: claimRow } = await supabase
      .from('claims')
      .select('claimant_id, reports(reporter_id)')
      .eq('id', claim.id)
      .single()

    if (!claimRow) return
    const ids = [claimRow.claimant_id, claimRow.reports?.reporter_id].filter(Boolean)
    const { data: users } = await supabase
      .from('users')
      .select('id, first_name, last_name, trust_score')
      .in('id', ids)

    const map = {}
    for (const u of users ?? []) {
      map[u.id] = { name: `${u.first_name} ${u.last_name}`, trust_score: u.trust_score }
    }
    setParticipants(map)
  }

  async function fetchMessages() {
    const { data } = await supabase
      .from('claim_messages')
      .select('*')
      .eq('claim_id', claim.id)
      .order('created_at', { ascending: true })
    setMessages(data ?? [])
    const hasDropOff = (data ?? []).some((m) => m.body?.startsWith('📍'))
    setDropOffChosen(hasDropOff)
    setLoading(false)
  }

  async function handleSend(e) {
    e.preventDefault()
    if (!text.trim() || sending) return
    if (messages.length >= MAX_MESSAGES) return

    setSending(true)
    await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: isReporter ? 'reporter' : 'claimant',
      body: text.trim(),
    })
    setText('')
    setSending(false)
  }

  async function handleDropOff() {
    setSending(true)
    const role = isReporter ? 'reporter' : 'claimant'
    const who = isReporter ? 'The reporter' : 'The finder'
    const { error } = await supabase.from('claim_messages').insert({
      claim_id: claim.id,
      sender_id: session.user.id,
      sender_role: role,
      body: `📍 ${who} has chosen ISSC drop-off. Please bring the item to the ISSC office at your earliest convenience.`,
    })
    if (!error) {
      await fetchMessages()
      await fetch(`${SERVER_URL}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'issc_dropoff',
          title: 'ISSC Drop-off Requested',
          body: `${who} has chosen to drop off an item at the ISSC office. Please prepare to receive it.`,
          claim_id: claim.id,
          report_id: claim.report_id,
        }),
      })
    }
    if (error) console.error('Drop-off insert error:', error)
    setSending(false)
  }

  const atCap = messages.length >= MAX_MESSAGES
  const remaining = MAX_MESSAGES - messages.length

  return (
    <div className="bg-surface-card rounded-2xl border border-status-approved-text/20 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-status-approved-bg">
        <p className="text-xs font-semibold text-status-approved-text">Arrange handoff</p>
        <p className="text-[11px] text-status-approved-text/70 mt-0.5">
          {atCap
            ? 'Message limit reached. Use ISSC drop-off if handoff is not yet arranged.'
            : `${remaining} message${remaining === 1 ? '' : 's'} remaining`}
        </p>
      </div>

      {/* Messages */}
      <div className="px-4 py-3 flex flex-col gap-3 max-h-72 overflow-y-auto">
        {loading && (
          <p className="text-xs text-text-muted text-center py-4">Loading messages…</p>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-xs text-text-muted text-center py-4">
            No messages yet. Suggest a meeting time or choose ISSC drop-off below.
          </p>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_id === session.user.id
          const isSystem = msg.body?.startsWith('📍')
          const participant = participants[msg.sender_id]
          const roleLabel = msg.sender_role === 'reporter' ? 'Reporter' : 'Finder'
          const displayName = participant?.name ?? roleLabel
          const trustScore = participant?.trust_score

          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-status-open-bg text-status-open-text text-[11px] px-3 py-2 rounded-xl text-center max-w-[85%]">
                  {msg.body}
                </div>
              </div>
            )
          }

          return (
            <div key={msg.id} className={`flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
              <div className={`flex items-center gap-1.5 px-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  isMine ? 'bg-brand-600 text-white' : 'bg-border-strong text-text-secondary'
                }`}>
                  {displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className={`flex items-center gap-1 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="text-[11px] font-semibold text-text-primary">{displayName}</span>
                  <span className="text-[10px] text-text-muted">· {roleLabel}</span>
                  {trustScore !== undefined && (
                    <span className="text-[10px] text-status-open-text">· ☆ {trustScore}</span>
                  )}
                </div>
              </div>
              <div
                className={`max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  isMine
                    ? 'bg-brand-600 text-white rounded-tr-sm'
                    : 'bg-surface-muted text-text-primary rounded-tl-sm'
                }`}
              >
                {msg.body}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Drop-off button or confirmed banner */}
      {!dropOffChosen ? (
        <div className="px-4 pb-3">
          <button
            onClick={handleDropOff}
            disabled={sending}
            className="w-full h-10 rounded-xl border border-brand-600 text-brand-600 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            <MapPin size={14} />
            {sending ? 'Processing…' : 'Use ISSC drop-off instead'}
          </button>
        </div>
      ) : (
        <div className="mx-4 mb-3 flex items-start gap-2 bg-status-open-bg rounded-xl px-3 py-2.5 text-xs text-status-open-text">
          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold block mb-0.5">ISSC drop-off confirmed.</span>
            The finder should bring the item to the ISSC office. The owner may collect it there upon presenting valid ID.
          </span>
        </div>
      )}

      {/* Message input */}
      {!atCap && !dropOffChosen && (
        <form onSubmit={handleSend} className="px-4 pb-4 flex gap-2">
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
            className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center disabled:opacity-50 shrink-0"
          >
            <Send size={15} className="text-white" />
          </button>
        </form>
      )}
    </div>
  )
}