import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'

export async function refreshHistory(userId) {
  if (!isOnline() || !userId) return

  const [{ data: r }, { data: c }, { data: t }, { data: te }] = await Promise.all([
    supabase
      .from('reports')
      .select('id, title, status, location, created_at, reporter_id')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('claims')
      .select('id, status, created_at, report_id, claimant_id, reports(title)')
      .eq('claimant_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tips')
      .select('id, text, created_at, report_id, user_id, reports(title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('trust_score_events')
      .select('id, delta, reason, created_at, user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  if (r) await db.reports.bulkPut(r)
  // Strip the joined report title before caching - it's resolved back at
  // read time from the shared `reports` cache (see useHistory below), which
  // stays correct even if the report is later renamed.
  if (c) await db.claims.bulkPut(c.map(({ reports: _reports, ...claim }) => claim))
  if (t) await db.tips.bulkPut(t.map(({ reports: _reports, ...tip }) => tip))
  if (te) await db.trust_score_events.bulkPut(te)
}

// ProfilePage's "30-day rejection window" - reuses the same cached claims
// refreshHistory already populates (it fetches all of a claimant's claims,
// not just non-rejected ones), so no separate network call is needed.
export function useRecentRejections(userId) {
  return useLiveQuery(async () => {
    if (!userId) return []
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const [claims, allReports] = await Promise.all([
      db.claims.where('claimant_id').equals(userId).toArray(),
      db.reports.toArray(),
    ])
    const titleByReportId = Object.fromEntries(allReports.map((r) => [r.id, r.title]))
    return claims
      .filter((c) => c.status === 'rejected' && new Date(c.created_at).getTime() >= thirtyDaysAgo)
      .map((c) => (titleByReportId[c.report_id] ? { ...c, reports: { title: titleByReportId[c.report_id] } } : c))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [userId])
}

// Reads reactively from the local cache - reflects whatever refreshHistory
// last wrote, plus any offline-created reports/claims/tips queued locally.
export function useHistory(userId) {
  return useLiveQuery(async () => {
    if (!userId) return { reports: [], claims: [], tips: [], trustEvents: [] }

    const [reports, claims, tips, trustEvents, allReports] = await Promise.all([
      db.reports.where('reporter_id').equals(userId).toArray(),
      db.claims.where('claimant_id').equals(userId).toArray(),
      db.tips.where('user_id').equals(userId).toArray(),
      db.trust_score_events.where('user_id').equals(userId).toArray(),
      db.reports.toArray(),
    ])

    const titleByReportId = Object.fromEntries(allReports.map((r) => [r.id, r.title]))
    const withTitle = (row) =>
      titleByReportId[row.report_id] ? { ...row, reports: { title: titleByReportId[row.report_id] } } : row
    const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at)

    return {
      reports: [...reports].sort(byNewest),
      claims: claims.map(withTitle).sort(byNewest),
      tips: tips.map(withTitle).sort(byNewest),
      trustEvents: [...trustEvents].sort(byNewest),
    }
  }, [userId])
}
