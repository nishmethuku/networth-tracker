import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Counts up from its previous value to a new one whenever `value` changes
 * (e.g. switching display currency or refreshing the dashboard) rather than
 * just snapping — a small, deliberate touch on the single most-looked-at
 * number in the app. Respects prefers-reduced-motion.
 */
export default function AnimatedNumber({ value, format, duration = 0.6 }) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    function tick(now) {
      const elapsed = (now - start) / 1000;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <motion.span initial={false}>{format ? format(display) : display}</motion.span>;
}
