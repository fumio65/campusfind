// Human-readable text for each trust_score_events.reason enum value, shown
// in TrustScoreDialog when a trust-affecting event fires. Keep this in sync
// with the `trust_event_reason` Postgres enum (supabase/migrations) and with
// every adjustTrustScore() call site across the Edge Functions - a reason
// string passed there that isn't a key of this enum (or of the DB enum)
// won't be logged to trust_score_events at all, so it won't reach here.
export const TRUST_REASON_TEXT = {
  claim_rejected: "Your claim was declined by the reporter.",
  repeat_rejections_30d:
    "Includes an extra penalty for 3 or more rejected claims within 30 days.",
  no_show_handoff: "You missed an agreed handoff.",
  claim_approved_handoff_completed:
    "The item was recovered. Thank you for your honesty!",
  issc_dropoff_returned:
    "Thank you for dropping off a found item at the ISSC office.",
  tip_credited: "Your tip was credited for helping recover this item.",
}

export function trustReasonText(reason) {
  return TRUST_REASON_TEXT[reason] ?? ""
}
