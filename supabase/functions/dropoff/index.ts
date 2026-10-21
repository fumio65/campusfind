import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { requireAdmin } from '../_shared/requireAdmin.ts'
import { requireUser } from '../_shared/requireUser.ts'


const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'))
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const baseIndex = pathParts.indexOf('dropoff')
  const id = pathParts[baseIndex + 1]
  const action = pathParts[baseIndex + 2]

  try {
    // POST /dropoff — claimant creates drop-off request
    if (req.method === 'POST' && !id) {
      // SECURITY FIX (Strix WEB-01): this route had no auth check and trusted
      // every ID in the request body, so anyone could forge drop-off requests.
      // Now the caller must be signed in and be the claimant or the reporter
      // on an approved claim, and every ID is read from the database.
      const caller = await requireUser(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { claimId } = await req.json()
      if (!claimId) {
        return new Response(JSON.stringify({ error: 'claimId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: claim } = await supabaseAdmin
        .from('claims')
        .select('id, report_id, claimant_id, status, reports(reporter_id)')
        .eq('id', claimId)
        .single()

      if (!claim) {
        return new Response(JSON.stringify({ error: 'Claim not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const reportId = claim.report_id
      const claimantId = claim.claimant_id
      const reporterId = (claim.reports as any)?.reporter_id

      if (caller.id !== claimantId && caller.id !== reporterId) {
        return new Response(JSON.stringify({ error: 'Only the claimant or reporter can request a drop-off.' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (claim.status !== 'approved') {
        return new Response(JSON.stringify({ error: 'A drop-off can only be requested for an approved claim.' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: report } = await supabaseAdmin
        .from('reports')
        .select('title')
        .eq('id', reportId)
        .single()

      const reportTitle = report?.title ?? 'an item'

      // Check if a pending request already exists
      const { data: existing } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id')
        .eq('report_id', reportId)
        .eq('status', 'pending')
        .maybeSingle()

      if (existing) {
        // FIX: was returning early without notifying admin.
        // Admin still needs to be notified even if request already exists
        // (they may have missed the original notification)
        await supabaseAdmin.from('notifications').insert({
          type: 'dropoff_request',
          title: 'New drop-off request',
          body: `A finder is dropping off "${reportTitle}" at the ISSC office.`,
          report_id: reportId,
          claim_id: claimId,
          read: false,
        })

        return new Response(JSON.stringify({ ok: true, id: existing.id, existing: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: request, error: insertError } = await supabaseAdmin
        .from('dropoff_requests')
        .insert({
          report_id: reportId,
          claim_id: claimId,
          claimant_id: claimantId,
          reporter_id: reporterId,
          status: 'pending',
        })
        .select()
        .single()

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Notify admin
      const { error: notifError } = await supabaseAdmin.from('notifications').insert({
        type: 'dropoff_request',
        title: 'New drop-off request',
        body: `A finder is dropping off "${reportTitle}" at the ISSC office.`,
        report_id: reportId,
        claim_id: claimId,
        read: false,
      })

      if (notifError) {
        console.error('[dropoff] notification insert failed:', notifError)
      }

      // Tell the other student on the claim that the drop-off is agreed
      // (previously only the admin was notified).
      const otherPartyId = caller.id === claimantId ? reporterId : claimantId
      if (otherPartyId) {
        const { error: partyError } = await supabaseAdmin.from('user_notifications').insert({
          user_id: otherPartyId,
          type: 'dropoff_chosen',
          title: 'ISSC drop-off confirmed',
          body: otherPartyId === reporterId
            ? `The finder will bring "${reportTitle}" to the ISSC office. You'll be notified when it's ready for pickup.`
            : `The ISSC drop-off for "${reportTitle}" is confirmed. Bring the item to the ISSC office.`,
          report_id: reportId,
          claim_id: claimId,
        })
        if (partyError) console.error('[dropoff] party notification failed:', partyError)
      }

      return new Response(JSON.stringify({ ok: true, id: request.id }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // GET /dropoff — admin lists all drop-off requests
    if (req.method === 'GET' && !id) {
      // SECURITY FIX (Strix WEB-01): admin-only; this exposed every reporter's
      // and claimant's name and student ID to anyone on the internet.
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const status = url.searchParams.get('status')

      let query = supabaseAdmin
        .from('dropoff_requests')
        .select(`
          id, status, drop_off_photo_path, created_at, updated_at,
          report_id, claim_id, claimant_id, reporter_id,
          reports(title, category),
          claimant:users!dropoff_requests_claimant_id_fkey(first_name, last_name, student_id),
          reporter:users!dropoff_requests_reporter_id_fkey(first_name, last_name, student_id)
        `)
        .order('created_at', { ascending: false })

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify(data ?? []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /dropoff/:id/receive — admin marks item as received + uploads photo
    if (req.method === 'PATCH' && id && action === 'receive') {
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { photoPath } = await req.json()
      if (!photoPath) {
        return new Response(JSON.stringify({ error: 'photoPath required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { data: request } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id, status, report_id, claim_id, reporter_id, reports(title)')
        .eq('id', id)
        .single()

      if (!request) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (request.status !== 'pending') {
        return new Response(JSON.stringify({ error: `Request is already ${request.status}.` }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin
        .from('dropoff_requests')
        .update({
          status: 'received',
          drop_off_photo_path: photoPath,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      // Notify reporter via user_notifications (student-facing)
      await supabaseAdmin.from('user_notifications').insert({
        user_id: request.reporter_id,
        type: 'dropoff_received',
        title: 'Your item is at the ISSC office',
        body: `"${(request.reports as any)?.title ?? 'Your item'}" has been dropped off and is ready for pickup.`,
        report_id: request.report_id,
        claim_id: request.claim_id,
        read: false,
      })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // PATCH /dropoff/:id/pickup — admin confirms reporter picked up item, resolve report
    if (req.method === 'PATCH' && id && action === 'pickup') {
      const caller = await requireAdmin(req, supabaseAdmin)
      if (caller instanceof Response) return caller

      const { data: request } = await supabaseAdmin
        .from('dropoff_requests')
        .select('id, status, report_id, claim_id, reporter_id, claimant_id, reports(title)')
        .eq('id', id)
        .single()

      if (!request) {
        return new Response(JSON.stringify({ error: 'Request not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Only an item that is physically at the ISSC office can be picked up,
      // and only once - otherwise a repeated call would award +5 again.
      if (request.status !== 'received') {
        return new Response(JSON.stringify({ error: `Request is ${request.status}, not received.` }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await supabaseAdmin
        .from('dropoff_requests')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', id)

      await supabaseAdmin
        .from('reports')
        .update({ status: 'resolved', resolved_via: 'issc_dropoff' })
        .eq('id', request.report_id)

      await supabaseAdmin
        .from('claims')
        .update({ status: 'resolved' })
        .eq('id', request.claim_id)

      const { data: claimant } = await supabaseAdmin
        .from('users')
        .select('trust_score')
        .eq('id', request.claimant_id)
        .single()

      if (claimant) {
        // Logged as a trust_score_events row (the trigger applies the +5 to
        // users.trust_score) instead of updating the user directly, so the
        // change shows up in the claimant's trust score history.
        const newScore = Math.max(0, Math.min(200, (claimant.trust_score ?? 100) + 5))
        await supabaseAdmin.from('trust_score_events').insert({
          user_id: request.claimant_id,
          delta: 5,
          reason: 'issc_dropoff_returned',
          related_claim_id: request.claim_id,
          score_after: newScore,
        })
      }

      // Notify reporter via user_notifications (student-facing)
      await supabaseAdmin.from('user_notifications').insert({
        user_id: request.reporter_id,
        type: 'report_resolved',
        title: 'Item recovered!',
        body: `You collected "${(request.reports as any)?.title ?? 'your item'}" from the ISSC office, so it's now marked as returned. Thank you for using CampusFind!`,
        report_id: request.report_id,
        claim_id: request.claim_id,
        read: false,
      })

      // Notify claimant via user_notifications (student-facing)
      await supabaseAdmin.from('user_notifications').insert({
        user_id: request.claimant_id,
        type: 'dropoff_resolved',
        title: 'Drop-off complete! +5 Trust Score',
        body: `The item has been collected by the reporter. Thank you for your honesty!`,
        report_id: request.report_id,
        claim_id: request.claim_id,
        read: false,
      })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Unexpected server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})