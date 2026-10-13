import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, Search } from 'lucide-react'

const SIZES = {
  sm: { field: 'h-9 px-3 text-xs', option: 'px-3 py-2 text-xs' },
  md: { field: 'h-11 px-4 text-sm', option: 'px-4 py-2.5 text-sm' },
}

// Generic custom-styled dropdown, visually matching CategoryPicker (same
// portal-based menu, rounded field, chevron, check mark) but driven by a
// plain `options` list of { value, label } instead of the fixed category
// set - for any admin/student select that shouldn't use the browser's own
// unstyled <select> popup. Pass `searchable` for long lists (e.g. programs)
// to get a filter box pinned to the top of the menu.
export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabledPlaceholder,
  disabled = false,
  searchable = false,
  size = 'md',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const searchRef = useRef(null)

  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuStyle({ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width })
    }
    updatePosition()
    setQuery('')
    if (searchable) requestAnimationFrame(() => searchRef.current?.focus())
    function closeOnScrollOrResize(e) {
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', closeOnScrollOrResize, true)
    window.addEventListener('resize', closeOnScrollOrResize)
    return () => {
      window.removeEventListener('scroll', closeOnScrollOrResize, true)
      window.removeEventListener('resize', closeOnScrollOrResize)
    }
  }, [open, searchable])

  useEffect(() => {
    function handleClickOutside(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options
    const needle = query.trim().toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(needle))
  }, [options, query, searchable])

  function selectOption(opt) {
    onChange(opt.value)
    setOpen(false)
  }

  const { field: fieldClasses, option: optionClasses } = SIZES[size] ?? SIZES.md
  const displayLabel = selected?.label || (disabled ? disabledPlaceholder ?? placeholder : placeholder)
  const portalTarget = triggerRef.current?.closest('.admin-theme') ?? document.body

  return (
    <div className={`relative ${className}`} ref={triggerRef}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 ${fieldClasses} rounded-xl border bg-surface-card text-left transition-colors ${
          open ? 'border-brand-400 ring-2 ring-brand-400' : 'border-border-strong'
        } ${!selected ? 'text-text-muted' : 'text-text-primary'} ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-brand-400/60'
        }`}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          className="bg-surface-card rounded-xl border border-border shadow-xl z-50 overflow-hidden"
        >
          {searchable && (
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-border-strong bg-surface-page focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-text-muted text-center">No matches</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => selectOption(opt)}
                  className={`w-full flex items-center justify-between gap-2 text-left transition-colors ${optionClasses} ${
                    opt.value === value
                      ? 'bg-brand-50 text-brand-700 font-semibold'
                      : 'text-text-secondary hover:bg-surface-muted'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === value && <Check size={15} className="text-brand-600 shrink-0" aria-hidden="true" />}
                </button>
              ))
            )}
          </div>
        </div>,
        portalTarget
      )}
    </div>
  )
}
