import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Link as LinkIcon, Share2, Download, CheckCircle2 } from 'lucide-react'

const BRAND = '#06433C'
const BRAND_LIGHT = '#E1F5EE'

function drawShareCard(canvas, report, photoUrl) {
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

  if (photoUrl) {
    // Draw photo with rounded rect clip
    ctx.save()
    roundRect(ctx, 60, PHOTO_Y, W - 120, PHOTO_H, RADIUS)
    ctx.clip()
    ctx.fillStyle = '#1a3d38'
    ctx.fillRect(60, PHOTO_Y, W - 120, PHOTO_H)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = photoUrl
    // If image already loaded (same frame), draw immediately
    if (img.complete) {
      drawCover(ctx, img, 60, PHOTO_Y, W - 120, PHOTO_H)
    }
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
  if (report.location) {
    const locY = titleY + 200
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '36px system-ui, -apple-system, sans-serif'
    ctx.fillText(`📍 ${report.location}`, 60, locY)
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

export default function ShareSheet({ report, onClose }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [cardReady, setCardReady] = useState(false)
  const shareUrl = `${window.location.origin}/reports/${report.id}`

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const photoUrl = report.photoUrls?.[0] ?? null

    if (photoUrl) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        drawShareCard(canvas, report, photoUrl)
        setCardReady(true)
      }
      img.onerror = () => {
        drawShareCard(canvas, report, null)
        setCardReady(true)
      }
      img.src = photoUrl
      // Draw immediately without photo, then redraw once loaded
      drawShareCard(canvas, report, null)
    } else {
      drawShareCard(canvas, report, null)
      setCardReady(true)
    }
  }, [report])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      window.prompt('Copy this link:', shareUrl)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  async function handleShareImage() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'campusfind-report.png', { type: 'image/png' })
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: report.title,
            text: `${report.type === 'found_walkin' ? 'Found at ISSC' : 'Lost'}: ${report.title} — Help on CampusFind`,
            url: shareUrl,
          })
          return
        } catch (e) {
          if (e.name === 'AbortError') return
        }
      }
      // Fallback: download
      handleDownload()
    }, 'image/png')
  }

  function handleDownload() {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.download = `campusfind-${report.id.slice(0, 8)}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 400, damping: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-card rounded-t-2xl w-full max-w-sm pb-safe"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-border-strong" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <p className="text-sm font-semibold text-text-primary">Share report</p>
            <p className="text-xs text-text-muted mt-0.5 truncate max-w-[220px]">{report.title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-muted transition-colors"
          >
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        {/* Card preview */}
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-xl overflow-hidden border border-border relative">
            <canvas
              ref={canvasRef}
              className="w-full block"
              style={{ aspectRatio: '1080/1350' }}
            />
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
        <div className="px-5 pt-2 pb-6 flex flex-col gap-2.5">
          {/* Copy link */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-3 w-full bg-surface-muted rounded-xl px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              {copied
                ? <CheckCircle2 size={18} className="text-brand-600" />
                : <LinkIcon size={18} className="text-brand-600" />
              }
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">
                {copied ? 'Link copied!' : 'Copy link'}
              </p>
              <p className="text-xs text-text-muted truncate">{shareUrl}</p>
            </div>
          </button>

          {/* Share image */}
          <button
            onClick={handleShareImage}
            disabled={!cardReady}
            className="flex items-center gap-3 w-full bg-surface-muted rounded-xl px-4 py-3 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              <Share2 size={18} className="text-brand-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Share image</p>
              <p className="text-xs text-text-muted">Share the card via your apps</p>
            </div>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={!cardReady}
            className="flex items-center gap-3 w-full bg-surface-muted rounded-xl px-4 py-3 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            <div className="w-9 h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              <Download size={18} className="text-brand-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-text-primary">Download card</p>
              <p className="text-xs text-text-muted">Save to your device</p>
            </div>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}