"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { HrBand } from "@/lib/micropulse/hrLoad";

type Resp = { ok: boolean; hasData: boolean; date: string | null; totalMinutes: number | null; bands: HrBand[] };

// Ordinal band → colour ramp (low intensity → high). The bands are ordinal; the
// honest read is the % of the session in each, not an invented zone name.
const BAND_COLOR = [
  "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1", "#f59e0b", "#f97316", "#ef4444", "#b91c1c",
];

/**
 * PLAYER-facing HR intensity of their own last belt session: how the time was
 * spread across the 8 HR bands, with a plain "how hard was it" headline (share of
 * time in the high bands). Self-hides when the player has no HR belt data — never
 * an empty HR card. Bands are labelled by ordinal + %, not by Catapult's per-band
 * bpm (which is unreliable on low bands).
 */
export default function PlayerHrZoneCard({ date, lang }: { date: string; lang: "IS" | "EN" }) {
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(`/api/player/hr-zones?date=${date}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = (await res.json()) as Resp;
      setData(res.ok ? j : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!data || !data.hasData) return null;

  const present = data.bands.filter((b) => b.timeS && b.timeS > 0);
  if (present.length === 0) return null;

  // Boundary-free, honest framing: the highest band reached and where most time
  // was spent (we don't know the bands' %HRmax cutoffs, so we don't invent
  // "high-intensity %"). The peak band IS a real relative-intensity signal.
  const peakBand = Math.max(...present.map((b) => b.band));
  const dominant = present.reduce((a, b) => ((b.pct ?? 0) > (a.pct ?? 0) ? b : a));
  const headline =
    peakBand >= 6
      ? is ? `Hörð æfing — komst upp í band ${peakBand}.` : `Hard session — reached band ${peakBand}.`
      : peakBand >= 4
      ? is ? `Góð ákefð — upp í band ${peakBand}, mest í bandi ${dominant.band}.` : `Solid intensity — up to band ${peakBand}, mostly band ${dominant.band}.`
      : is ? `Róleg æfing — mest í bandi ${dominant.band}.` : `Easy session — mostly band ${dominant.band}.`;

  const notToday = data.date && data.date !== date;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {is ? "Hjartsláttur — ákefð" : "Heart rate — intensity"}
        </div>
        {notToday ? (
          <span className="text-[10px] text-slate-400">{is ? "síðasta æfing" : "last session"} · {data.date}</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm font-medium text-slate-800">{headline}</p>

      <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full">
        {present.map((b) => (
          <div
            key={b.band}
            style={{ width: `${b.pct ?? 0}%`, backgroundColor: BAND_COLOR[b.band - 1] }}
            title={`${is ? "Band" : "Band"} ${b.band}${b.avgBpm ? ` ≈ ${b.avgBpm} bpm` : ""} · ${Math.round((b.timeS ?? 0) / 60)}m (${b.pct ?? 0}%)`}
          />
        ))}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {present.map((b) => (
          <span
            key={b.band}
            className="rounded px-1.5 py-px text-[10px] tabular-nums text-slate-600"
            style={{ backgroundColor: `${BAND_COLOR[b.band - 1]}33` }}
          >
            B{b.band} · {b.pct}%
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
        {is
          ? `${data.totalMinutes ?? 0} mín með hjartsláttarbelti. Bönd 1–8 = ákefð, lágt → hátt.`
          : `${data.totalMinutes ?? 0} min on the HR belt. Bands 1–8 = intensity, low → high.`}
      </p>
    </div>
  );
}
