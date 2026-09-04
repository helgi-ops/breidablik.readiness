"use client";

import { useEffect, useRef } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * Live-sync the planner surfaces on any match_schedule change. Because match_schedule is the single
 * source of truth for matches (see api/coach/periodization fixture write path), a fixture added, moved,
 * or removed in ANY open tab fires a postgres_changes event; each subscribed surface re-derives from it —
 * so the Meso calendar, Macro anchors, the Micro/Week Setup week and the Fixtures list stay in lockstep
 * without a manual reload. Delivery is RLS-scoped to the coach's own team (the browser client is
 * authenticated), so no team filter is needed. `topic` must be unique per concurrently-mounted caller
 * (the hub and the embedded Week Setup can both be mounted at once).
 */
export function useMatchScheduleRealtime(topic: string, onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!enabled) return;
    const sb = getSupabaseClient();
    const channel = sb
      .channel(`match-schedule-${topic}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_schedule" }, () => cb.current())
      .subscribe();
    return () => { void sb.removeChannel(channel); };
  }, [topic, enabled]);
}
