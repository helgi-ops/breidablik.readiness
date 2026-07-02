"use client";

/**
 * PlayerMatchMovementCard — the player's own "how I move" profile (IMA driver),
 * the companion to his game report. Self-scoped (/api/player/match-movement —
 * player_id from auth). Deliberately player-friendly: a squad-percentile radar,
 * plain-language labels, and a positive "your standout" read. No jargon, no
 * load/injury language — just how he moves vs his squad.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { ProfileRadar, type RadarMetric } from "@/components/coach/PlayerGameReportCharts";
import { fmtDim, type DimensionKey, type MovementFingerprint } from "@/lib/micropulse/matchMovement/types";

type Resp = {
  matches: Array<{ date: string; minutes: number; fingerprint: MovementFingerprint }>;
  average: MovementFingerprint | null;
  percentiles: Record<DimensionKey, number>;
  squadMedian: MovementFingerprint;
  matchCount: number;
};

// Player-friendly labels (no S&C jargon) for each movement dimension.
const PLAYER_LABELS: Record<DimensionKey, { en: string; is: string; quality?: boolean }> = {
  totalPerMin:     { en: "Work rate",   is: "Vinnumagn",   quality: true },
  accelDecelRatio: { en: "Explosive",   is: "Sprengikraftur", quality: true },
  codPerMin:       { en: "Agility",     is: "Lipurð",      quality: true },
  codLeftPct:      { en: "L / R balance", is: "V / H jafnvægi" },
  hiCadencePerMin: { en: "Sprinting",   is: "Sprettur",    quality: true },
};
const RADAR_ORDER: DimensionKey[] = ["totalPerMin", "accelDecelRatio", "codPerMin", "hiCadencePerMin", "codLeftPct"];

export default function PlayerMatchMovementCard() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) { if (alive) setLoading(false); return; }
        const res = await fetch("/api/player/match-movement", { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!alive) return;
        if (res.ok) setData(await res.json());
        setLoading(false);
      } catch { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const radar: RadarMetric[] = useMemo(() => {
    if (!data) return [];
    return RADAR_ORDER.map((k) => ({
      label: is ? PLAYER_LABELS[k].is : PLAYER_LABELS[k].en,
      percentile: data.percentiles[k] ?? 50,
      valueLabel: fmtDim(k, data.average?.[k] ?? null),
    }));
  }, [data, is]);

  if (loading) return null;
  if (!data || data.matchCount === 0) return null;

  // Positive standout — the "quality" dimension he ranks highest on.
  const standout = (["totalPerMin", "accelDecelRatio", "codPerMin", "hiCadencePerMin"] as DimensionKey[])
    .filter((k) => data.percentiles[k] != null)
    .sort((a, b) => (data.percentiles[b] ?? 0) - (data.percentiles[a] ?? 0))[0];
  const standoutPct = standout ? data.percentiles[standout] : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{is ? "Hreyfing" : "Movement"}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{is ? "Hvernig þú hreyfir þig" : "How you move"}</div>
      <p className="mt-0.5 text-xs text-slate-500">
        {is ? `Miðað við liðið · byggt á ${data.matchCount} leikjum` : `Compared to your squad · based on ${data.matchCount} matches`}
      </p>

      {standout && standoutPct >= 60 && (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-slate-800">
          <span className="font-semibold">{is ? "Þinn styrkur: " : "Your standout: "}</span>
          {is ? PLAYER_LABELS[standout].is : PLAYER_LABELS[standout].en}
          {" — "}
          {is ? `þú ert í efstu ${100 - standoutPct}% liðsins.` : `you're in the top ${100 - standoutPct}% of the squad.`}
        </div>
      )}

      <div className="mt-3">
        <ProfileRadar metrics={radar} maxHeight={280} />
      </div>

      <p className="mt-1 text-[11px] leading-snug text-slate-400">
        {is
          ? "Toppar út = yfir liðs-miðgildi, inn = undir. Þetta lýsir hreyfi-stíl þínum — ekki gott/slæmt."
          : "Spikes out = above the squad median, dips in = below. This describes your movement style — not good/bad."}
      </p>
    </div>
  );
}
