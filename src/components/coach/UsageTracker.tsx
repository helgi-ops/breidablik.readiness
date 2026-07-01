"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { normalizeUsagePath } from "@/lib/analytics/usagePath";

/**
 * UsageTracker — fires one fire-and-forget page_view event per route change.
 *
 * Mounted once in CoachShell, so it covers every coach/PT route automatically
 * (no per-page wiring). Identity is resolved server-side from the token; here we
 * only send the normalised path. Failures are silently ignored — analytics must
 * never affect navigation.
 */
export default function UsageTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const path = normalizeUsagePath(pathname);
    // Dedupe: don't re-send the same normalised path back-to-back (e.g. when a
    // player-detail id changes but the surface is the same).
    if (!path || path === lastSent.current) return;
    lastSent.current = path;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || cancelled) return;
        // keepalive lets the request survive the navigation that triggered it.
        void fetch("/api/analytics/track", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ path, event_type: "page_view" }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* never break navigation */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
