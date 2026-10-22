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

// Draws `source` scaled to fit maxDimension and encodes it as JPEG.
// Returns the canvas too, so a smaller version can be drawn from it.
async function encode(source, srcWidth, srcHeight, maxDimension, quality) {
  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight))
  const width = Math.max(1, Math.round(srcWidth * scale))
  const height = Math.max(1, Math.round(srcHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(source, 0, 0, width, height)

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
  })
  return { canvas, blob }
}

// FIX: "Save changes" / "Submit" used to sit for several seconds per photo
// because each camera photo was fully decoded THREE times before the screen
// could move on (once just to read its size, once for the display image,
// once more for the thumbnail) - decoding a 12MP photo is slow on a phone.
// Now each photo is decoded once, the thumbnail is drawn from the
// already-downscaled display canvas (far cheaper than from the original),
// and the result is remembered per File so it can be started the moment a
// photo is picked (see preparePhoto callers) and simply awaited on submit.
async function processPhoto(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { display: null, thumb: null }
  }
  try {
    let display = null
    let thumbSource = bitmap
    let thumbSourceWidth = bitmap.width
    let thumbSourceHeight = bitmap.height

    // Only re-encode the display copy when the photo is over the cap -
    // null tells callers to upload an already-small original as-is.
    if (Math.max(bitmap.width, bitmap.height) > DISPLAY_MAX_DIMENSION) {
      try {
        const result = await encode(bitmap, bitmap.width, bitmap.height, DISPLAY_MAX_DIMENSION, DISPLAY_JPEG_QUALITY)
        display = result.blob
        thumbSource = result.canvas
        thumbSourceWidth = result.canvas.width
        thumbSourceHeight = result.canvas.height
      } catch {
        display = null
      }
    }

    let thumb = null
    try {
      thumb = (await encode(thumbSource, thumbSourceWidth, thumbSourceHeight, MAX_DIMENSION, JPEG_QUALITY)).blob
    } catch {
      thumb = null
    }
    return { display, thumb }
  } finally {
    bitmap.close?.()
  }
}

const prepared = new WeakMap()

// Starts (or returns the already-started) processing for this File. Safe to
// call as soon as a photo is picked, without awaiting - the work is shared
// with the later makeDisplayImage/makeThumbnail calls on submit.
export function preparePhoto(file) {
  if (!file) return Promise.resolve({ display: null, thumb: null })
  let promise = prepared.get(file)
  if (!promise) {
    promise = processPhoto(file)
    prepared.set(file, promise)
  }
  return promise
}

export async function makeThumbnail(file) {
  return (await preparePhoto(file)).thumb
}

// Returns null (not just when downscaling fails, but also when the photo is
// already at or under the cap) so callers know to fall back to uploading
// the original file as-is rather than re-encoding an already-small image.
export async function makeDisplayImage(file) {
  return (await preparePhoto(file)).display
}
