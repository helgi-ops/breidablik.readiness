"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { PLAYER_COPY } from "@/app/player/playerCopy";
import type { Lang } from "@/lib/lang";

type Props = { lang?: Lang };

/**
 * "You haven't checked in" nudge. Self-hides during a declared team break (/api/player/break-status) —
 * no check-in is expected on a break. Leaf component (border-2, not the .border the Today DOM
 * post-processors target), so its break→null transition can't drive the observer loop that manages
 * the session/decision tree. Descriptive.
 */
export default function MissingCheckinBanner({ lang = "IS" }: Props) {
  const ct = PLAYER_COPY[lang].checkin;
  const [onBreak, setOnBreak] = useState<boolean | null>(null); // null = unknown (don't flash the banner)

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        if (!token || !alive) { if (alive) setOnBreak(false); return; }
        const j = await fetch("/api/player/break-status", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
        if (alive) setOnBreak(!!j?.on_break);
      } catch { if (alive) setOnBreak(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (onBreak !== false) return null; // hide while unknown, and hide entirely on a break

  return (
    <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="text-sm font-bold text-amber-900">{ct.missingTitle}</span>
          </div>
          <p className="mt-1 text-xs text-amber-800">{ct.missingBody}</p>
        </div>
        <Link
          href="/player/checkin"
          className="shrink-0 inline-flex items-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 transition-colors"
        >
          {ct.missingBtn}
        </Link>
      </div>
    </div>
  );
}
