import { useEffect, type ReactNode } from "react";
import { MotionConfig, type Variants } from "motion/react";
import { createStore, useSelector } from "@tanstack/react-store";

/**
 * Motion for TeamPulse: pages breathe in (rise and settle) and out (soften and sink),
 * sections arrive one after another, and anything below the fold eases in as it scrolls
 * into view. Only transform and opacity ever animate. Anyone who asks their system for
 * reduced motion gets no movement at all (MotionConfig reducedMotion="user" plus the
 * checks below).
 */

const EASE = [0.22, 1, 0.36, 1] as const; // an easing-out curve: quick start, soft landing

export const BREATH_IN = { duration: 0.5, ease: EASE };
export const BREATH_OUT_MS = 150;

/** A page's sections arrive in sequence. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.03 } },
};

/** One section rising into place. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: BREATH_IN },
};

/** For sections further down: they ease in when scrolled into view, once. */
export const revealOnScroll = {
  variants: rise,
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "0px 0px -8% 0px" },
} as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---- Breathing out ---------------------------------------------------------------
// Navigation helpers call leavePage() first: the current page softens for a moment,
// then the route changes and the next page breathes in.

/** Pages that have been given motion so far; others change instantly, as before. */
const ANIMATED_PATHS = new Set(["/"]);

export const motionStore = createStore({ leaving: false });

export async function leavePage() {
  if (prefersReducedMotion() || !ANIMATED_PATHS.has(window.location.pathname))
    return;
  motionStore.setState(() => ({ leaving: true }));
  await new Promise((r) => setTimeout(r, BREATH_OUT_MS));
}

/** Call when the route has changed: the shell stops softening. */
export function usePageLeaving(pathname: string) {
  const leaving = useSelector(motionStore, (s) => s.leaving);
  useEffect(() => {
    motionStore.setState(() => ({ leaving: false }));
  }, [pathname]);
  // Safety: never leave the page dimmed if a navigation is cancelled.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(
      () => motionStore.setState(() => ({ leaving: false })),
      1500,
    );
    return () => clearTimeout(t);
  }, [leaving]);
  return leaving;
}
