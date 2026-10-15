import type { Variants } from "framer-motion";

/**
 * Shared stagger variants for "cards entering together" moments —
 * 02_ThemeGuideline.md §9.2: "Home cards on load: staggered fade+rise
 * (opacity 0→1, y: 16px→0), 350ms each, 50ms stagger — cards should feel
 * like they're being 'prepared and placed' by Claré, not just rendered."
 * §9.1 rule 2's easing ("ease-out-expo" cubic-bezier) applies here too.
 * Respects prefers-reduced-motion automatically via the app-wide
 * `MotionConfig reducedMotion="user"` in main.jsx — no extra handling
 * needed at the call site.
 */
export const STAGGER_CONTAINER: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05 },
  },
};

export const STAGGER_ITEM: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};
