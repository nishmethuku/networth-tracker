import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

/**
 * Native touch-based pull-to-refresh, no library. Only engages when the
 * page is scrolled to the top (so it doesn't fight normal scrolling) and
 * only on touch devices. Returns a ref to attach to the scroll container
 * and the current pull state for rendering an indicator.
 */
export default function usePullToRefresh(onRefresh: () => Promise<unknown>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      if (window.scrollY > 0 || refreshing) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    }

    function handleTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && window.scrollY === 0) {
        setPullDistance(Math.min(delta * 0.5, MAX_PULL));
      }
    }

    async function handleTouchEnd() {
      if (startY.current == null) return;
      startY.current = null;
      if (pullDistance >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPullDistance(PULL_THRESHOLD);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [pullDistance, refreshing, onRefresh]);

  return { containerRef, pullDistance, refreshing, threshold: PULL_THRESHOLD };
}
