"use client";

/**
 * UnfamiliarSpikeBanner — top-of-brief spike alert. Elevates the sharp spikes a
 * coach should see without scrolling, SPLIT BY SOURCE so the Engine (GPS) and
 * Driver (IMA) signals are never confused (Niklas Virtanen framing):
 *   • GPS — moving differently than usual (movement-signature drift). The detail
 *     lives in the Unfamiliar Load card below.
 *   • IMA — much more high-intensity running than usual (sprint acute:chronic vs
 *     the player's own baseline). Detail on the IMA Intelligence page — there is
 *     no IMA card on Today, so this row links out.
 * Renders nothing when there are no spikes of either kind.
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Item = { player_id: string; name: string; spike?: boolean };
type UnfamiliarResp = { ok: boolean; items: Item[] };
type ImaPlayer = { full_name: string; sprint_vs_baseline_pct: number | null; total_strides: number };
type ImaResp = { profile?: { per_player?: ImaPlayer[] } };

const first = (full: string) => full.split(/\s+/)[0] || full;

export default function UnfamiliarSpikeBanner({ lang, date }: { lang?: string; date?: string }) {
  const is = (lang ?? "").toUpperCase() === "IS";
  const [gps, setGps] = useState<string[]>([]);
  const [ima, setIma] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        const auth = { headers: { Authorization: `Bearer ${session?.access_token ?? ""}` } };
        const [uRes, iRes] = await Promise.all([
          fetch(`/api/coach/unfamiliar-load${date ? `?date=${date}` : ""}`, auth).then((r) => (r.ok ? r.json() : null)).catch(() => null),
          fetch(`/api/coach/team/ima-day-profile?${date ? `date=${date}&` : ""}lang=${is ? "IS" : "EN"}`, auth).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        ]);
        if (!alive) return;
        // GPS spike = movement-signature drift flagged as a sharp spike.
        setGps(((uRes as UnfamiliarResp | null)?.items ?? []).filter((i) => i.spike).map((i) => i.name));
        // IMA spike = high-cadence sprint running >= 150% of the 14-day baseline
        // (the same threshold the IMA page verdict uses).
        setIma(((iRes as ImaResp | null)?.profile?.per_player ?? [])
          .filter((p) => p.total_strides > 0 && (p.sprint_vs_baseline_pct ?? 0) >= 150)
          .map((p) => p.full_name));
      } catch { if (alive) { setGps([]); setIma([]); } }
    })();
    return () => { alive = false; };
  }, [date, is]);

  if (gps.length === 0 && ima.length === 0) return null;

  const nameStr = (names: string[]) => {
    const shown = names.slice(0, 3).map(first).join(", ");
    const more = names.length - 3;
    return more > 0 ? (is ? `${shown} og ${more} til viðbótar` : `${shown} and ${more} more`) : shown;
  };

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5">
      <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
        <span className="text-base">⚡</span>
        {is ? "Skörp frávik í dag" : "Sharp spikes today"}
      </div>
      <ul className="mt-1 space-y-0.5 pl-6 text-sm text-rose-800">
        {gps.length > 0 && (
          <li>
            <span
              className="font-semibold"
              title={is
                ? "GPS = vélin (vegalengd, hraði) — hver hreyfir sig öðruvísi en venjulega (hreyfimynstur)."
                : "GPS = the engine (distance, speed) — who is moving differently than usual (movement pattern)."}
            >
              GPS · {is ? "öðruvísi hreyfing" : "moving differently"}
            </span>{" "}
            ({gps.length}): <span className="font-medium">{nameStr(gps)}</span>{" "}
            <span className="text-rose-600">— {is ? "sjá Óvanaleg hreyfing að neðan" : "see Unfamiliar load below"}</span>
          </li>
        )}
        {ima.length > 0 && (
          <li>
            <span
              className="font-semibold"
              title={is
                ? "IMA = drifið (hröðun/hemlun, háákefðar átak) — hver hljóp mun meira háákefðar en venjulega (magn)."
                : "IMA = the driver (accel/decel, high-intensity efforts) — who did much more high-intensity running than usual (volume)."}
            >
              IMA · {is ? "háákefðar hlaup" : "high-intensity running"}
            </span>{" "}
            ({ima.length}): <span className="font-medium">{nameStr(ima)}</span>{" "}
            <a
              href="/coach/ima-intelligence"
              className="text-rose-600 underline decoration-dotted underline-offset-2 hover:opacity-80"
            >
              — {is ? "sjá IMA" : "see IMA"} →
            </a>
          </li>
        )}
      </ul>
    </div>
  );
}
