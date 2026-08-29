import Dexie from 'dexie'

export const db = new Dexie('campusfind')

// v1: cache tables mirror the shapes currently read from Supabase, plus the
// offline write pipeline (sync_queue = outbox, blobs = pending photo bytes).
db.version(1).stores({
  reports: 'id, status, reporter_id, updated_at',
  report_photos: 'id, report_id',
  claims: 'id, report_id, claimant_id, status, updated_at',
  claim_photos: 'id, claim_id',
  claim_messages: 'id, claim_id, created_at',
  dropoff_requests: 'id, claim_id',
  tips: 'id, report_id, user_id, created_at',
  user_notifications: 'id, user_id, created_at',
  notifications: 'id, user_id, created_at',
  proxy_requests: 'id, requester_id, created_at',
  profile: 'id',
  trust_score_events: 'id, user_id, created_at',

  sync_queue: '++seq, id, opType, entity, status, createdAt',
  blobs: 'id, createdAt',

  // Photo bytes cached opportunistically after a successful load, keyed by
  // storage path, so thumbnails already seen while online still render
  // offline instead of showing a broken-image icon.
  image_cache: 'id, cachedAt',
})
