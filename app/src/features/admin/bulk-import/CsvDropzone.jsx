import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import TemplateCard from './TemplateCard'

export default function CsvDropzone({ onFileSelected, onCancelUpload, uploading, filename, rowCount }) {
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (uploading) return
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) onFileSelected(file)
  }

  function handleInputChange(e) {
    const file = e.target.files?.[0]
    if (file) onFileSelected(file)
    e.target.value = ''
  }

  function handleClick() {
    if (uploading) return
    fileInputRef.current?.click()
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={uploading ? -1 : 0}
      aria-disabled={uploading}
      onKeyDown={(e) => {
        if (!uploading && (e.key === 'Enter' || e.key === ' ')) fileInputRef.current?.click()
      }}
      className={`rounded-xl border-2 border-dashed p-6 flex items-center gap-4 transition-colors mb-4 ${
        uploading ? 'cursor-default' : 'cursor-pointer'
      } ${
        dragActive
          ? 'border-brand-600 bg-brand-50'
          : 'border-border-strong bg-surface-card hover:border-brand-400 hover:bg-surface-muted'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleInputChange}
        disabled={uploading}
        className="hidden"
      />

      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
        dragActive ? 'bg-brand-600 text-white' : 'bg-status-open-bg text-status-open-text'
      }`}>
        {uploading ? (
          <div className="w-4 h-4 border-2 border-status-open-text border-t-transparent rounded-full animate-spin" />
        ) : filename ? (
          <FileSpreadsheet size={20} aria-hidden="true" />
        ) : (
          <Upload size={20} aria-hidden="true" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {uploading ? (
          <>
            <div className="text-sm font-semibold text-text-primary">Uploading and validating...</div>
            <div className="text-xs text-text-secondary">This can take a moment for large files</div>
          </>
        ) : filename ? (
          <>
            <div className="text-sm font-semibold text-text-primary truncate">{filename}</div>
            <div className="text-xs text-text-secondary">
              {rowCount} rows &middot; click or drop a new file to replace
            </div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-text-primary">Drop your Registrar CSV here</div>
            <div className="text-xs text-text-secondary">or click to browse for a file</div>
          </>
        )}
      </div>

      {uploading && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onCancelUpload?.()
          }}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border-strong bg-surface-card hover:bg-surface-muted transition-colors"
        >
          <X size={13} aria-hidden="true" /> Cancel
        </button>
      )}
    </div>
  )
}