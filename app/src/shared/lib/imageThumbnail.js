// Downscales a photo File to a small JPEG blob entirely on-device (no
// network involved, so this works offline too) - used so list/strip views
// only ever have to fetch a few KB instead of the original camera file just
// to render a 64-128px thumbnail. Returns null on any failure (unsupported
// format, decode error) so callers can gracefully fall back to the
// full-resolution photo instead.
const MAX_DIMENSION = 320
const JPEG_QUALITY = 0.72

// The "full-resolution" photo shown in the lightbox doesn't need to be the
// untouched camera original - modern phone cameras routinely shoot
// 4000px+/several-MB images, far more detail than any screen in this app
// will ever display, and that size is exactly what made the lightbox take
// ~20s to load on a first view. Downscaling to a generous 1920px cap at
// high quality keeps photos sharp on any device screen while cutting
// typical file size by 5-10x. Same fallback behavior as makeThumbnail:
// null on failure, so callers fall back to uploading the original file.
const DISPLAY_MAX_DIMENSION = 1920
const DISPLAY_JPEG_QUALITY = 0.85

async function downscale(file, maxDimension, quality) {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

      return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality)
      })
    } finally {
      bitmap.close?.()
    }
  } catch {
    return null
  }
}

export async function makeThumbnail(file) {
  return downscale(file, MAX_DIMENSION, JPEG_QUALITY)
}

// Returns null (not just when downscaling fails, but also when the photo is
// already at or under the cap) so callers know to fall back to uploading
// the original file as-is rather than re-encoding an already-small image.
export async function makeDisplayImage(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const alreadySmall = Math.max(bitmap.width, bitmap.height) <= DISPLAY_MAX_DIMENSION
    bitmap.close?.()
    if (alreadySmall) return null
  } catch {
    return null
  }
  return downscale(file, DISPLAY_MAX_DIMENSION, DISPLAY_JPEG_QUALITY)
}
