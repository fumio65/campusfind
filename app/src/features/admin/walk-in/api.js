import { supabase } from '../../../shared/lib/supabase'

export async function createWalkInReport({ title, description, walkinFinderRef, adminUserId }) {
  const { data, error } = await supabase
    .from('reports')
    .insert({
      type: 'found_walkin',
      title,
      description,
      location: 'ISSC office',
      walkin_finder_ref: walkinFinderRef,
      reporter_id: adminUserId,
      status: 'open',
    })
    .select()
    .single()

  if (error) throw error
  return data
}
