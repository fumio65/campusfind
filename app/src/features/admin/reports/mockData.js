// Mock data shaped after reports in 0001_init_schema.sql. Used as a
// fallback when Supabase isn't configured (see api.js in this folder).
export const mockReports = [
  { id: 'r1', type: 'lost', title: 'Blue umbrella', location: 'CICT building', status: 'open', created_at: '2026-06-28', reporter: 'R. Cruz' },
  { id: 'r2', type: 'lost', title: 'Student ID lanyard', location: 'Library entrance', status: 'claimed', created_at: '2026-06-25', reporter: 'M. Tan' },
  { id: 'r3', type: 'lost', title: 'Black wallet', location: 'Gymnasium', status: 'resolved', created_at: '2026-06-23', reporter: 'J. Bautista' },
  { id: 'r4', type: 'found_walkin', title: 'USB flash drive', location: 'ISSC office', status: 'open', created_at: '2026-06-30', reporter: 'ISSC admin' },
  { id: 'r5', type: 'lost', title: 'Calculator (Casio)', location: 'CICT building', status: 'approved', created_at: '2026-06-29', reporter: 'P. Reyes' },
]