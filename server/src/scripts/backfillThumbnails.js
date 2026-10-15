// One-off maintenance script: generates a small thumbnail for every existing
// report_photos row that predates the thumbnail feature (thumbnail_path is
// null), so the reports list stops falling back to full-size originals for
// old reports. Mirrors app/src/shared/lib/imageThumbnail.js's settings
// (max 320px, JPEG quality ~0.72) for visual/size parity with new uploads.
//
// Run once with: node src/scripts/backfillThumbnails.js
import sharp from 'sharp'
import { supabaseAdmin } from '../lib/supabaseAdmin.js'

const BUCKET = 'report-photos'
const MAX_DIMENSION = 320
const JPEG_QUALITY = 72

function thumbnailPathFor(storagePath) {
  const lastDot = storagePath.lastIndexOf('.')
  const base = lastDot === -1 ? storagePath : storagePath.slice(0, lastDot)
  return `${base}_thumb.jpg`
}

async function backfillOne(photo) {
  const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(photo.storage_path)
  if (downloadError || !fileBlob) {
    console.error(`  skip ${photo.id}: download failed - ${downloadError?.message}`)
    return false
  }

  const buffer = Buffer.from(await fileBlob.arrayBuffer())
  let thumbBuffer
  try {
    thumbBuffer = await sharp(buffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer()
  } catch (err) {
    console.error(`  skip ${photo.id}: decode/resize failed - ${err.message}`)
    return false
  }

  const thumbnailPath = thumbnailPathFor(photo.storage_path)
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(thumbnailPath, thumbBuffer, { contentType: 'image/jpeg', upsert: true })
  if (uploadError) {
    console.error(`  skip ${photo.id}: thumbnail upload failed - ${uploadError.message}`)
    return false
  }

  const { error: updateError } = await supabaseAdmin
    .from('report_photos')
    .update({ thumbnail_path: thumbnailPath })
    .eq('id', photo.id)
  if (updateError) {
    console.error(`  skip ${photo.id}: db update failed - ${updateError.message}`)
    return false
  }

  return true
}

async function main() {
  const { data: photos, error } = await supabaseAdmin
    .from('report_photos')
    .select('id, storage_path')
    .is('thumbnail_path', null)
  if (error) throw error

  console.log(`Found ${photos.length} report photo(s) without a thumbnail.`)

  let done = 0
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    const ok = await backfillOne(photo)
    if (ok) done++
    console.log(`[${i + 1}/${photos.length}] ${photo.storage_path} -> ${ok ? 'done' : 'FAILED'}`)
  }

  console.log(`Backfilled ${done}/${photos.length} thumbnails.`)
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
