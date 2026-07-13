import { supabaseAdmin } from './supabaseAdmin.js'

export async function adjustTrustScore(userId, delta, reason) {
  if (!userId || delta === 0) return

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('trust_score')
    .eq('id', userId)
    .single()

  if (!user) return

  const current = user.trust_score ?? 100
  const updated = Math.max(0, Math.min(200, current + delta))

  await supabaseAdmin
    .from('users')
    .update({ trust_score: updated })
    .eq('id', userId)

  console.log(`[trust] ${reason}: user ${userId} ${delta > 0 ? '+' : ''}${delta} (${current} → ${updated})`)

  // Notify the user of the trust score change
  const isPositive = delta > 0
  await supabaseAdmin.from('user_notifications').insert({
    user_id: userId,
    type: isPositive ? 'trust_score_increase' : 'trust_score_decrease',
    title: isPositive
      ? `Trust score +${delta} (now ${updated})`
      : `Trust score ${delta} (now ${updated})`,
    body: isPositive
      ? `Your trust score increased by ${delta} points — ${reason}.`
      : `Your trust score decreased by ${Math.abs(delta)} points — ${reason}.`,
  })
}

export async function checkRepeatedRejections(claimantId) {
  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { count } = await supabaseAdmin
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('claimant_id', claimantId)
    .eq('status', 'rejected')
    .gte('updated_at', since.toISOString())

  // Only trigger extra penalty exactly on the 3rd rejection, not every subsequent one
  return count === 3
}