// Downscales a photo File to a small JPEG blob entirely on-device (no
// network involved, so this works offline too) - used so list/strip views
// only ever have to fetch a few KB instead of the original camera file just
// to render a 64-128px thumbnail. Returns null on any failure (unsupported
// format, decode error) so callers can gracefully fall back to the
// full-resolution photo instead.
const MAX_DIMENSION = 320
const JPEG_QUALITY = 0.72

export async function makeThumbnail(file) {
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

      return await new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY)
      })
    } finally {
      bitmap.close?.()
    }
  } catch {
    return null
  }
}
