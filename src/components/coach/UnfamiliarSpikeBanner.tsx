"use client";

/**
 * UnfamiliarSpikeBanner — a slim top-of-briefing alert that elevates SHARP
 * unfamiliar-load spikes (a player jumping well outside his own norm) so the
 * coach sees them in the morning brief without scrolling. The briefing flags;
 * the Unfamiliar Load card below explains (who/why/what) — explainability-first.
 * Renders nothing when there are no spikes.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Item = { player_id: string; name: string; spike?: boolean };
type Resp = { ok: boolean; items: Item[]; summary?: { spikes?: number } };

const first = (full: string) => full.split(/\s+/)[0] || full;

export default function UnfamiliarSpikeBanner({ lang, date }: { lang?: string; date?: string }) {
  const is = (lang ?? "").toUpperCase() === "IS";
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`/api/coach/unfamiliar-load${date ? `?date=${date}` : ""}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const j = (await res.json()) as Resp;
        if (!alive) return;
        if (res.ok) setNames((j.items ?? []).filter((i) => i.spike).map((i) => i.name));
        else setNames([]);
      } catch { if (alive) setNames([]); }
    })();
    return () => { alive = false; };
  }, [date]);

  if (!names || names.length === 0) return null;

  const shown = names.slice(0, 3).map(first).join(", ");
  const more = names.length - 3;
  const nameStr = more > 0 ? (is ? `${shown} og ${more} til viðbótar` : `${shown} and ${more} more`) : shown;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5">
      <span className="text-base">⚡</span>
      <div className="text-sm text-rose-800">
        <span className="font-semibold">
          {names.length} {is ? (names.length === 1 ? "skarpt frávik" : "skörp frávik") : (names.length === 1 ? "sharp spike" : "sharp spikes")}
        </span>{" "}
        {is ? "í dag" : "today"} — <span className="font-medium">{nameStr}</span>.{" "}
        <span className="text-rose-600">{is ? "Sjá Óvanaleg hreyfing að neðan." : "See Unfamiliar load below."}</span>
      </div>
    </div>
  );
}
