"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// Respects the user's reduced-motion preference (HCI: user control, accessibility).
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

// Fires true once the element scrolls into view (feedback / progressive disclosure).
export function useInView<T extends HTMLElement>(
  options?: IntersectionObserverInit,
): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setInView(true);
      },
      { threshold: 0.25, ...options },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [options]);
  return [ref, inView];
}

// Counts up to `target` once `active`, easing out. Static target if reduced motion.
export function useCountUp(target: number, active: boolean, durationMs = 1400): number {
  const [val, setVal] = useState(0);
  const reduce = useReducedMotion();
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    if (reduce) {
      setVal(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, active, durationMs, reduce]);
  return val;
}

// A looping 0→1 clock while `active`, for continuous ambient animation.
export function useLoop(active: boolean, periodMs = 3200): number {
  const [t, setT] = useState(0);
  const reduce = useReducedMotion();
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!active || reduce) {
      setT(1);
      return;
    }
    let start = performance.now();
    const tick = (now: number) => {
      let p = (now - start) / periodMs;
      if (p >= 1) {
        start = now;
        p = 0;
      }
      setT(p);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [active, periodMs, reduce]);
  return t;
}
