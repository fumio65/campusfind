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
