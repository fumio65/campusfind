import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

export const CATEGORIES = [
  'Electronics', 'IDs & Cards', 'Bags', 'Clothing',
  'Books & Notes', 'Keys', 'Wallet', 'Jewelry', 'Documents', 'Other',
]

const KNOWN_CATEGORIES = CATEGORIES.slice(0, -1)

const SIZES = {
  sm: { field: 'h-9 px-3 text-xs', option: 'px-3 py-2 text-xs' },
  md: { field: 'h-11 px-4 text-sm', option: 'px-4 py-2.5 text-sm' },
}

// Custom-styled dropdown (not a native <select>, whose OS-drawn list can't
// carry the app's theme, and would get visually clipped here anyway - see
// the portal note below) replacing the old category chip row. Picking
// "Other" reveals a text field for a custom category instead of just
// storing the literal string "Other" - unless allowCustomOther is off (the
// home filter: "Other" there just filters for reports already tagged
// literally "Other", the same as any other fixed category, with no typing).
// `value` is always the single resolved category (a preset, a custom
// string, 'Other', or '' for none).
export default function CategoryPicker({
  value,
  onChange,
  allowAll = false,
  allowCustomOther = true,
  size = 'md',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const [otherSelected, setOtherSelected] = useState(
    allowCustomOther && Boolean(value) && !KNOWN_CATEGORIES.includes(value)
  )
  const [customText, setCustomText] = useState(otherSelected ? value : '')
  // Tracks the last value *this component* emitted, so the sync effect below
  // can tell "value changed because we called onChange" (e.g. picking Other
  // with no text yet emits '' - that must not collapse otherSelected back to
  // false) apart from a genuine external change (loading a different report,
  // a filter getting cleared) that should resync the picker.
  const lastEmitted = useRef(value)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (value === lastEmitted.current) return
    lastEmitted.current = value
    if (!allowCustomOther) return
    if (!value) {
      setOtherSelected(false)
      setCustomText('')
    } else if (!KNOWN_CATEGORIES.includes(value)) {
      setOtherSelected(true)
      setCustomText(value)
    } else {
      setOtherSelected(false)
    }
  }, [value, allowCustomOther])

  // The field can sit inside an ancestor with overflow-hidden (e.g. the
  // filter panel's own collapse/expand animation), which would clip a
  // normal absolutely-positioned menu. Render it in a portal, positioned
  // from the trigger's live viewport rect, so it always draws on top intact
  // instead of getting cut off. Closes on scroll/resize rather than
  // re-tracking position continuously - simpler, and a stray floating menu
  // detached from its field after a scroll would look wrong anyway.
  useEffect(() => {
    if (!open) return
    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuStyle({ position: 'fixed', top: rect.bottom + 6, left: rect.left, width: rect.width })
    }
    updatePosition()
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
  }, [open])

  useEffect(() => {
    function handleClickOutside(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function emit(next) {
    lastEmitted.current = next
    onChange(next)
  }

  function selectOption(cat) {
    if (cat === 'Other' && allowCustomOther) {
      setOtherSelected(true)
      emit(customText)
    } else {
      setOtherSelected(false)
      emit(cat)
    }
    setOpen(false)
  }

  function handleCustomTextChange(e) {
    const text = e.target.value
    setCustomText(text)
    emit(text)
  }

  const { field: fieldClasses, option: optionClasses } = SIZES[size] ?? SIZES.md
  const isPlaceholder = !otherSelected && !value
  const displayLabel = otherSelected
    ? 'Other'
    : value || (allowAll ? 'All categories' : 'Select a category')
  // CSS custom properties for colors are scoped to .admin-theme on the admin
  // shell's root - portaling straight to document.body would escape that
  // scope and fall back to the student palette. Portal into the nearest
  // .admin-theme ancestor when there is one so the menu keeps whichever
  // theme it's actually in; document.body otherwise.
  const portalTarget = triggerRef.current?.closest('.admin-theme') ?? document.body

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="relative" ref={triggerRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`w-full flex items-center justify-between gap-2 ${fieldClasses} rounded-xl border bg-surface-card text-left transition-colors ${
            open ? 'border-brand-400 ring-2 ring-brand-400' : 'border-border-strong'
          } ${isPlaceholder ? 'text-text-muted' : 'text-text-primary'}`}
        >
          <span className="truncate">{displayLabel}</span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={menuStyle}
          className="max-h-64 overflow-y-auto overscroll-contain bg-surface-card rounded-xl border border-border shadow-xl z-50 py-1"
        >
          {allowAll && (
            <DropdownOption
              label="All categories"
              selected={!otherSelected && !value}
              onClick={() => selectOption('')}
              className={optionClasses}
            />
          )}
          {KNOWN_CATEGORIES.map((cat) => (
            <DropdownOption
              key={cat}
              label={cat}
              selected={!otherSelected && value === cat}
              onClick={() => selectOption(cat)}
              className={optionClasses}
            />
          ))}
          <DropdownOption
            label="Other"
            selected={otherSelected || (!allowCustomOther && value === 'Other')}
            onClick={() => selectOption('Other')}
            className={optionClasses}
          />
        </div>,
        portalTarget
      )}

      {otherSelected && allowCustomOther && (
        <input
          type="text"
          value={customText}
          onChange={handleCustomTextChange}
          placeholder="Enter a category"
          maxLength={40}
          className={`w-full ${fieldClasses} rounded-xl border border-border-strong bg-surface-card focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder:text-text-muted`}
        />
      )}
    </div>
  )
}

function DropdownOption({ label, selected, onClick, className }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 text-left transition-colors ${className} ${
        selected ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-text-secondary hover:bg-surface-muted'
      }`}
    >
      <span className="truncate">{label}</span>
      {selected && <Check size={15} className="text-brand-600 shrink-0" aria-hidden="true" />}
    </button>
  )
}
