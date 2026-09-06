import { useEffect, useRef, useState } from 'react'
import { X, Download, CheckCircle2, AlertCircle } from 'lucide-react'

// Mirrors the Android app's share card exactly (app/src/features/reports/ShareSheet.jsx)
// so admins get the same branded image students see when they share a report -
// kept as a duplicate here rather than a shared import because admin/ and app/
// are separate Vite projects with no shared package between them.

const BRAND = '#06433C'
const BRAND_LIGHT = '#E1F5EE'

function drawShareCard(canvas, report, photoImg) {
  const W = 1080
  const H = 1350
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = BRAND
  ctx.fillRect(0, 0, W, H)

  // Subtle radial glow center
  const grd = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, W * 0.7)
  grd.addColorStop(0, 'rgba(255,255,255,0.07)')
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, W, H)

  // Photo area
  const PHOTO_Y = 120
  const PHOTO_H = 620
  const RADIUS = 40

  if (photoImg) {
    // Draw photo with rounded rect clip
    ctx.save()
    roundRect(ctx, 60, PHOTO_Y, W - 120, PHOTO_H, RADIUS)
    ctx.clip()
    ctx.fillStyle = '#1a3d38'
    ctx.fillRect(60, PHOTO_Y, W - 120, PHOTO_H)
    drawCover(ctx, photoImg, 60, PHOTO_Y, W - 120, PHOTO_H)
    ctx.restore()
  } else {
    // Placeholder box
    ctx.save()
    ctx.fillStyle = '#0d2e2a'
    roundRect(ctx, 60, PHOTO_Y, W - 120, PHOTO_H, RADIUS)
    ctx.fill()
    ctx.restore()
    // Camera icon placeholder
    ctx.font = '120px sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.textAlign = 'center'
    ctx.fillText('📷', W / 2, PHOTO_Y + PHOTO_H / 2 + 40)
  }

  // Label pill (Lost / Found at ISSC)
  const labelText = report.type === 'found_walkin' ? 'Found at ISSC' : 'Lost'
  const pillY = PHOTO_Y + PHOTO_H - 60
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif'
  const labelW = ctx.measureText(labelText).width + 48
  ctx.fillStyle = report.type === 'found_walkin' ? BRAND_LIGHT : '#FEF3E2'
  roundRect(ctx, 100, pillY - 36, labelW, 52, 26)
  ctx.fill()
  ctx.fillStyle = report.type === 'found_walkin' ? BRAND : '#854F0B'
  ctx.textAlign = 'left'
  ctx.fillText(labelText, 124, pillY + 2)

  // Title
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 72px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  const titleY = PHOTO_Y + PHOTO_H + 90
  wrapText(ctx, report.title, 60, titleY, W - 120, 88)

  // Location
  let nextY = titleY + 200
  if (report.location) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '36px system-ui, -apple-system, sans-serif'
    ctx.fillText(`📍 ${report.location}`, 60, nextY)
    nextY += 60
  }

  // Description (single truncated line - keeps the layout safe regardless
  // of how long the title/location above turned out to be)
  if (report.description) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '30px system-ui, -apple-system, sans-serif'
    ctx.fillText(truncateToWidth(ctx, report.description, W - 120), 60, nextY)
  }

  // Divider
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(60, H - 210)
  ctx.lineTo(W - 60, H - 210)
  ctx.stroke()

  // Watermark
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('CampusFind', 60, H - 140)
  ctx.fillStyle = 'rgba(255,255,255,0.3)'
  ctx.font = '28px system-ui, -apple-system, sans-serif'
  ctx.fillText('NwSSU Lost & Found', 60, H - 90)

  // Help text right
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '26px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('Scan or tap to help', W - 60, H - 140)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = img.width * scale
  const sh = img.height * scale
  const sx = x + (w - sw) / 2
  const sy = y + (h - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh)
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ')
  let line = ''
  let lineCount = 0
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + ' '
    if (ctx.measureText(test).width > maxW && i > 0) {
      ctx.fillText(line.trim(), x, y + lineCount * lineH)
      line = words[i] + ' '
      lineCount++
      if (lineCount >= 2) { // max 2 lines
        ctx.fillText(line.trim() + (i < words.length - 1 ? '…' : ''), x, y + lineCount * lineH)
        return
      }
    } else {
      line = test
    }
  }
  ctx.fillText(line.trim(), x, y + lineCount * lineH)
}

function truncateToWidth(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let truncated = text
  while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxW) {
    truncated = truncated.slice(0, -1)
  }
  return truncated.trimEnd() + '…'
}

// Loads the report photo via fetch+blob (not a plain cross-origin <img>) so
// the canvas is never tainted, regardless of the storage host's CORS headers.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('image fetch failed'))))
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob)
        const img = new Image()
        img.onload = () => resolve({ img, objectUrl })
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('image decode failed'))
        }
        img.src = objectUrl
      })
      .catch(reject)
  })
}

export default function ShareCardDialog({ report, photoUrl, onClose }) {
  const canvasRef = useRef(null)
  const [downloaded, setDownloaded] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let objectUrl = null

    drawShareCard(canvas, report, null)

    if (!photoUrl) {
      setCardReady(true)
      return
    }

    loadImage(photoUrl)
      .then(({ img, objectUrl: url }) => {
        objectUrl = url
        if (cancelled) return
        drawShareCard(canvas, report, img)
        setCardReady(true)
      })
      .catch(() => {
        if (!cancelled) setCardReady(true)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [report, photoUrl])

  async function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas || saving) return
    setSaving(true)
    setActionError(null)
    try {
      const filename = `campusfind-${report.id.slice(0, 8)}.png`
      const a = document.createElement('a')
      a.download = filename
      a.href = canvas.toDataURL('image/png')
      a.click()
      setDownloaded(true)
      setTimeout(() => setDownloaded(false), 2500)
    } catch {
      setActionError("Couldn't save the card. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div>
            <p className="text-sm font-semibold text-text-primary">Share report</p>
            <p className="text-xs text-text-muted mt-0.5 truncate max-w-[220px]">{report.title}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted transition-colors">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Card preview */}
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-xl overflow-hidden border border-border relative">
            <canvas ref={canvasRef} className="w-full block" style={{ aspectRatio: '1080/1350' }} />
            {!cardReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-brand-600">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <p className="text-[11px] text-text-muted text-center mt-2">
            {report.type === 'found_walkin' ? 'Found at ISSC' : 'Lost item'} · CampusFind
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 pt-2 pb-5 flex flex-col gap-2.5 shrink-0">
          {actionError && (
            <div className="flex items-center gap-2 bg-status-rejected-bg text-status-rejected-text text-xs rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <button
            onClick={handleDownload}
            disabled={!cardReady || saving}
            className="flex items-center gap-3 w-full bg-surface-muted rounded-xl px-4 py-3 hover:bg-surface-page transition-colors disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              {downloaded ? <CheckCircle2 size={18} className="text-brand-600" /> : <Download size={18} className="text-brand-600" />}
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">{saving ? 'Saving…' : downloaded ? 'Saved!' : 'Download card'}</p>
              <p className="text-xs text-text-muted">Saves the image to your computer</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
