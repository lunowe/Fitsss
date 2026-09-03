"use client";

import { useEffect, useRef } from "react";

/**
 * Ticks the text of an element up (or down) to `value`.
 *
 * The animation is written straight to the DOM node rather than through state:
 * it is a per-frame visual effect, React already renders the final value, and
 * this keeps the tick out of the render loop. Reduced motion skips it.
 *
 * Usage: `<span ref={useCountUp(count)}>{count}</span>`
 */
export function useCountUp(value: number, duration = 250) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);

  useEffect(() => {
    const node = ref.current;
    const from = previous.current;
    previous.current = value;
    if (!node || from === value) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      node.textContent = String(Math.round(from + (value - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      node.textContent = String(value);
    };
  }, [value, duration]);

  return ref;
}
