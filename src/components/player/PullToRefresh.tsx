"use client";

/**
 * Pull-to-refresh for the player PWA. Pull down from the very top of the page to
 * refetch — so a player never has to close and reopen the app to see new coach
 * data. Deliberately minimal and defensive: it only engages when the page is
 * already scrolled to the top, damps the pull, and does nothing if the gesture
 * isn't a clear downward pull — so it can't interfere with normal scrolling.
 */
import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD = 70; // px of (damped) pull needed to trigger a refresh
const MAX_PULL = 110;
const DAMP = 0.5;

function scrollTop(): number {
  return window.scrollY || document.scrollingElement?.scrollTop || document.documentElement.scrollTop || 0;
}

export default function PullToRefresh({
  onRefresh,
  lang = "IS",
}: {
  /** Called when the user pulls past the threshold and releases. */
  onRefresh: () => void | Promise<void>;
  lang?: "IS" | "EN";
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armedAtTop = useRef(false);

  const isIS = lang === "IS";
  const armed = pull >= THRESHOLD;

  const trigger = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      // onRefresh usually reloads the page; the reset only matters for a soft
      // refetch that keeps the component mounted.
      setRefreshing(false);
      setPull(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (refreshing || e.touches.length !== 1) { startY.current = null; return; }
      armedAtTop.current = scrollTop() <= 0;
      startY.current = armedAtTop.current ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !armedAtTop.current) { setPull(0); return; }
      // We're pulling down at the top — take over the gesture from native bounce.
      if (e.cancelable) e.preventDefault();
      setPull(Math.min(dy * DAMP, MAX_PULL));
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      setPull((p) => {
        if (p >= THRESHOLD && !refreshing) void trigger();
        return p >= THRESHOLD ? THRESHOLD : 0;
      });
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing, trigger]);

  if (pull <= 0 && !refreshing) return null;

  const label = refreshing
    ? isIS ? "Endurnýja…" : "Refreshing…"
    : armed
    ? isIS ? "Slepptu til að endurnýja" : "Release to refresh"
    : isIS ? "Dragðu niður til að endurnýja" : "Pull to refresh";

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center"
      style={{ transform: `translateY(${refreshing ? THRESHOLD : pull}px)`, transition: startY.current == null ? "transform 160ms ease" : "none" }}
      aria-live="polite"
    >
      <div className="mt-2 flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-600 shadow-sm">
        <span
          className={refreshing ? "animate-spin" : ""}
          style={{ transform: !refreshing && armed ? "rotate(180deg)" : "none", transition: "transform 160ms ease" }}
          aria-hidden
        >
          {refreshing ? "⟳" : "↓"}
        </span>
        {label}
      </div>
    </div>
  );
}
