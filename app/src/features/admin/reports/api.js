import { supabase } from '../../../shared/lib/supabase'

export async function fetchReports({ limit = 20 } = {}) {
  const { data, error } = await supabase
    .from('reports')
    .select('id, type, title, location, status, created_at, reporter:users!reports_reporter_id_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data.map((r) => ({
    ...r,
    reporter: r.reporter ? `${r.reporter.first_name} ${r.reporter.last_name}` : 'ISSC admin',
  }))
}

export async function forceResolveReport(reportId, { resolvedVia = 'issc_walkin_pickup' } = {}) {
  const { error } = await supabase
    .from('reports')
    .update({ status: 'resolved', resolved_via: resolvedVia, resolved_at: new Date().toISOString() })
    .eq('id', reportId)

  if (error) throw error
}
