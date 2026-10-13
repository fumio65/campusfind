// Scrolls a just-focused input/textarea into view above the on-screen
// keyboard. Android's adjustResize window mode shrinks the WebView when the
// keyboard opens, but nothing scrolls the newly-focused field above it on
// its own - a field sitting in the lower half of a form (or the last field
// before Submit) ends up hidden behind the keyboard otherwise.
//
// The short delay matters: scrolling immediately on focus races the
// keyboard's own open animation and undershoots, since the viewport hasn't
// finished resizing yet.
//
// Usage: <textarea onFocus={scrollFieldIntoView} ... />
export function scrollFieldIntoView(e) {
  const el = e.currentTarget
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
}
