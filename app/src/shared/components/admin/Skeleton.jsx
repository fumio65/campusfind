// Shared loading placeholders for the admin dashboard, in the same style the
// ISSC Handoffs page already used: soft pulsing blocks shaped like the
// content that is about to appear, instead of a spinner or "Loading..." text.

export function SkeletonBlock({ className = '' }) {
  return <div className={`bg-surface-card border border-border animate-pulse ${className}`} />
}

export function SkeletonLine({ className = '' }) {
  return <div className={`h-3 rounded bg-surface-muted animate-pulse ${className}`} />
}

// Cards in a vertical list (ISSC Handoffs, Recent imports, dialogs).
export function SkeletonCards({ count = 3, className = 'h-24 rounded-2xl' }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      {[...Array(count)].map((_, i) => (
        <SkeletonBlock key={i} className={className} />
      ))}
    </div>
  )
}

// A table: a header strip and rows of bars, one bar per column.
export function SkeletonTable({ columns = 5, rows = 6 }) {
  const widths = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/6', 'w-2/5']
  return (
    <div
      className="bg-surface-card border border-border rounded-xl overflow-hidden"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="bg-surface-muted/60 border-b border-border px-3 py-3 flex gap-4">
        {[...Array(columns)].map((_, c) => (
          <SkeletonLine key={c} className="flex-1 h-2.5 bg-border" />
        ))}
      </div>
      {[...Array(rows)].map((_, r) => (
        <div key={r} className="px-3 py-3.5 flex gap-4 border-b border-border last:border-0">
          {[...Array(columns)].map((_, c) => (
            <div key={c} className="flex-1">
              <SkeletonLine className={widths[(r + c) % widths.length]} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// Overview: four stat tiles, then the chart and recent accounts beside the
// drop-offs rail.
export function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-4 gap-2.5 mb-5">
        {[...Array(4)].map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: '1fr 272px' }}>
        <div className="flex flex-col gap-3">
          <SkeletonBlock className="h-56 rounded-xl" />
          <SkeletonBlock className="h-48 rounded-xl" />
        </div>
        <SkeletonBlock className="h-72 rounded-xl" />
      </div>
    </div>
  )
}
