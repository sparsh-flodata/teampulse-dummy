import {
  useEffect,
  useLayoutEffect,
  type ReactNode,
  type RefObject,
} from "react";
import { MotionConfig, animate, type Variants } from "motion/react";
import { createStore, useSelector } from "@tanstack/react-store";

/**
 * Motion for TeamPulse: pages breathe in (rise and settle) and out (soften and sink),
 * sections arrive one after another, tabs ease between their bodies, and anything below
 * the fold eases in as it scrolls into view. Only transform and opacity ever animate.
 * Anyone who asks their system for reduced motion gets no movement at all
 * (MotionConfig reducedMotion="user" plus the checks below).
 */

export const EASE = [0.22, 1, 0.36, 1] as const; // an easing-out curve: quick start, soft landing

export const BREATH_IN = { duration: 0.5, ease: EASE };
export const BREATH_OUT_MS = 150;

/** The sections of a view arrive in sequence. */
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
// Navigation helpers call leavePage() first: the current view softens for a moment,
// then the route changes and the next view breathes in.

export const motionStore = createStore({ leaving: false });

export async function leavePage() {
  if (prefersReducedMotion()) return;
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

// ---- Breathing in, page by page ------------------------------------------------------

/** The blocks a page is made of. Nested matches are revealed with their parent. */
const REVEAL =
  "section, .panel, .page-heading, .workspace-context, .sample-workspace-note, .connection-error, .page-footer";
/** Blocks that animate themselves; the generic reveal leaves them and their contents alone. */
const MANUAL = '[data-motion="manual"]';
const FOLD = 0.92;

/**
 * On each route change the top-level blocks of the page rise in one after another.
 * Blocks below the fold wait and ease in as they scroll into view.
 */
export function usePageReveal(
  rootRef: RefObject<HTMLElement | null>,
  pathname: string,
) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const found = Array.from(root.querySelectorAll<HTMLElement>(REVEAL));
    const targets = found.filter(
      (el) =>
        !el.parentElement?.closest(MANUAL) &&
        !found.some((other) => other !== el && other.contains(el)),
    );
    if (!targets.length) return;

    const now: HTMLElement[] = [];
    const later: HTMLElement[] = [];
    for (const el of targets) {
      el.style.opacity = "0";
      el.style.transform = "translateY(14px)";
      (el.getBoundingClientRect().top < window.innerHeight * FOLD
        ? now
        : later
      ).push(el);
    }

    const controls: { stop: () => void }[] = now.map((el, i) =>
      animate(
        el,
        { opacity: [0, 1], y: [14, 0] },
        {
          duration: BREATH_IN.duration,
          ease: EASE,
          delay: Math.min(i, 8) * 0.07 + 0.03,
        },
      ),
    );

    const io: IntersectionObserver | null = later.length
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              io?.unobserve(entry.target);
              controls.push(
                animate(
                  entry.target as HTMLElement,
                  { opacity: [0, 1], y: [14, 0] },
                  { duration: BREATH_IN.duration, ease: EASE },
                ),
              );
            }
          },
          { threshold: 0.08, rootMargin: "0px 0px -6% 0px" },
        )
      : null;
    later.forEach((el) => io?.observe(el));

    return () => {
      io?.disconnect();
      controls.forEach((c) => c.stop());
      // The heading and footer outlive a route: never leave them invisible.
      for (const el of targets) {
        el.style.opacity = "";
        el.style.transform = "";
      }
    };
  }, [rootRef, pathname]);
}
