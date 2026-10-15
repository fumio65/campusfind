// Shared animation primitives. Kept intentionally small and cheap:
// opacity + a few px of translate only (no layout-affecting animations,
// no continuous loops), and every variant collapses to an instant,
// motion-free state when the OS reduce-motion setting is on, per the SRS
// usability requirement (7.4) for a reduce-motion toggle/respect.

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const pageTransition = prefersReducedMotion
  ? { initial: {}, animate: {}, exit: {}, transition: { duration: 0 } }
  : {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -4 },
      transition: { duration: 0.16, ease: 'easeOut' },
    }

// Used for switching between the student app's bottom-nav tabs
// (Home/History/Activity/Profile). Deliberately opacity-only, no
// transform: each of those pages already animates its own header/body
// in on mount with its own y-translate, so adding a second, outer
// y-translate here would stack two independent vertical motions on
// top of each other and read as jittery instead of smooth. A plain
// crossfade complements the page's own entrance animation instead of
// competing with it.
export const tabTransition = prefersReducedMotion
  ? { initial: {}, animate: {}, exit: {}, transition: { duration: 0 } }
  : {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.14, ease: 'easeOut' },
    }

export const staggerContainer = prefersReducedMotion
  ? { initial: {}, animate: {} }
  : {
      initial: 'hidden',
      animate: 'show',
      variants: {
        hidden: {},
        show: { transition: { staggerChildren: 0.04 } },
      },
    }

export const staggerItem = prefersReducedMotion
  ? { variants: { hidden: {}, show: {} } }
  : {
      variants: {
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
      },
    }
