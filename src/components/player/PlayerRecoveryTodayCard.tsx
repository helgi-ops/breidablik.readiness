"use client";

/**
 * PlayerRecoveryTodayCard — the player's daily wearable recovery readout.
 *
 * Always on (when a watch is connected and has a reading), unlike the Signal Pack
 * card which is silent until something flags. Shows today's actual HRV / resting HR /
 * recovery-score numbers with the cited verdict computed on the player's OWN rolling
 * baseline — the SAME engine as the coach surface and the AI (loadPlayerWearableRecovery
 * → wearableRecoveryContributor). Layered read: (0) one-line verdict, (1) the three
 * numbers vs your usual, (2) "behind the numbers" detail + citation.
 *
 * A SIDE signal — it never sets or changes the readiness colour. No data → hidden.
 * Manifesto: #1 provenance (citation), #2 plain-first/jargon-behind-toggle, #3 why,
 * #8 same engine / player voice.
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { loadPlayerWearableRecovery, type PlayerWearableRecovery } from "@/lib/micropulse/signalPack/wearableRecoveryLoad";
import type { WearableMarker } from "@/lib/micropulse/signalPack/wearableRecovery";

const PROVIDER_LABEL: Record<string, string> = { whoop: "Whoop", polar: "Polar", terra: "Terra", garmin: "Garmin", oura: "Oura" };

/** Direction of a marker vs the player's own norm, with whether that direction is a concern. */
function trend(m: WearableMarker, higherBetter: boolean): { arrow: string; concern: boolean } {
  const { recent, baselineMean, baselineSd } = m;
  if (recent == null || baselineMean == null || baselineSd == null || baselineSd <= 0) return { arrow: "≈", concern: false };
  const z = (recent - baselineMean) / baselineSd;
  if (z > 0.3) return { arrow: "↑", concern: !higherBetter };
  if (z < -0.3) return { arrow: "↓", concern: higherBetter };
  return { arrow: "≈", concern: false };
}

export default function PlayerRecoveryTodayCard({
  playerId,
  lang = "EN",
  voice = "player",
}: {
  playerId?: string | null;
  lang?: "IS" | "EN";
  /** "player" (self, default) or "coach" — the coach drill-down reuses this card on-demand. */
  voice?: "player" | "coach";
}) {
  const IS = lang === "IS";
  const coachVoice = voice === "coach";
  const [data, setData] = React.useState<PlayerWearableRecovery | null>(null);
  const [loading, setLoading] = React.useState(true);
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!playerId) { setLoading(false); return; }
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const r = await loadPlayerWearableRecovery(sb, playerId, today, voice);
        if (alive) setData(r);
      } catch { if (alive) setData(null); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [playerId, today, voice]);

  const pick = (b: { en: string; is: string }) => (IS ? b.is : b.en);

  // Hidden until there's a reading — a watch not connected (or no data yet) shows nothing.
  if (loading || !data) return null;

  const { contributor: c, input, latest } = data;
  const lowConf = c.confidence === "low";
  const dateLabel = (() => {
    try { return new Date(`${latest.date}T00:00:00Z`).toLocaleDateString(IS ? "is-IS" : "en-GB", { day: "numeric", month: "short" }); }
    catch { return latest.date; }
  })();
  const providerLabel = latest.provider ? (PROVIDER_LABEL[latest.provider] ?? latest.provider) : IS ? "úr" : "watch";

  const hrvT = trend(input.hrv, true);
  const rhrT = trend(input.restingHr, false);
  const recT = trend(input.recoveryScore, true);

  const tiles: Array<{ show: boolean; label: string; value: number | null; unit: string; usual: number | null; t: { arrow: string; concern: boolean } }> = [
    { show: latest.hrvMs != null, label: "HRV", value: latest.hrvMs, unit: "ms", usual: input.hrv.baselineMean, t: hrvT },
    { show: latest.restingHr != null, label: IS ? "Hvíldarpúls" : "Resting HR", value: latest.restingHr, unit: "bpm", usual: input.restingHr.baselineMean, t: rhrT },
    { show: latest.recovery != null, label: IS ? "Endurheimt" : "Recovery", value: latest.recovery, unit: "%", usual: input.recoveryScore.baselineMean, t: recT },
  ];
  const ctxTiles: Array<{ show: boolean; label: string; value: number | null; unit: string }> = [
    { show: latest.stress != null, label: IS ? "Streita" : "Stress", value: latest.stress, unit: "/100" },
    { show: latest.bodyBattery != null, label: IS ? "Orkuforði" : "Body battery", value: latest.bodyBattery, unit: "/100" },
  ];

  return (
    <div data-player-card="recovery-today" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-base">📈</span>
        <span className="text-sm font-bold text-zinc-900">{IS ? "Endurheimt í dag" : "Recovery today"}</span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500"
          title={coachVoice
            ? (IS ? "Mælt af úrinu hans — hliðarmerki, ekki liturinn." : "From his watch — a side signal, not the colour.")
            : (IS ? "Mælt af úrinu þínu — hliðarmerki, ekki liturinn þinn." : "From your watch — a side signal, not your colour.")}>
          {providerLabel} · {dateLabel}
        </span>
      </div>

      {/* Layer 0 — one-line verdict (recovery vs your own usual; never the readiness colour). */}
      <p className={`mt-2 text-[15px] font-semibold leading-snug ${c.flagged ? "text-amber-700" : "text-zinc-900"}`}>
        {pick(c.why)}
      </p>

      {/* Layer 1 — the actual numbers vs your usual. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.filter((t) => t.show).map((t) => (
          <div key={t.label} className="rounded-xl border border-zinc-200 bg-zinc-50 px-2.5 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t.label}</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums text-zinc-900">{t.value != null ? Math.round(t.value) : "—"}</span>
              <span className="text-[10px] text-zinc-400">{t.unit}</span>
              <span className={`text-xs ${t.t.concern ? "text-amber-600" : "text-zinc-400"}`}>{t.t.arrow}</span>
            </div>
            {t.usual != null && (
              <div className="text-[10px] text-zinc-400">{IS ? "venja" : "usual"} ~{Math.round(t.usual)}</div>
            )}
          </div>
        ))}
      </div>

      {ctxTiles.some((t) => t.show) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ctxTiles.filter((t) => t.show).map((t) => (
            <span key={t.label} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
              {t.label}: <span className="font-semibold tabular-nums">{t.value != null ? Math.round(t.value) : "—"}</span>{t.unit}
            </span>
          ))}
        </div>
      )}

      {c.counterfactual && (
        <p className="mt-2 text-[12px] italic leading-relaxed text-zinc-500">{pick(c.counterfactual)}</p>
      )}
      {lowConf && (
        <p className="mt-1 text-[11px] text-amber-600">
          {IS ? "Byggt á takmörkuðum gögnum enn — viðmiðunin styrkist með fleiri nóttum." : "Based on limited data so far — your baseline firms up with more nights."}
        </p>
      )}

      {/* Layer 2 — behind the numbers. */}
      <details className="mt-3 group/behind">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700">
          <span className="transition group-open/behind:rotate-90">▸</span>
          {IS ? "Á bak við tölurnar" : "Behind the numbers"}
        </summary>
        <div className="mt-2 space-y-1.5 rounded-xl border border-zinc-200 bg-white/70 p-3 text-[11px] leading-relaxed text-zinc-600">
          <p>{pick(c.detail)} <span className="text-zinc-400">· {c.citation}</span></p>
          <p className="pt-1 text-zinc-400">
            {coachVoice
              ? (IS
                ? "Á hans eigin viðmiðun (rúllandi meðaltal). Hliðarmerki sem útskýrir — það ræður ekki litnum."
                : "On his own rolling baseline. A side signal that explains — it doesn't decide the colour.")
              : (IS
                ? "Á þinni eigin viðmiðun (rúllandi meðaltal). Hliðarmerki sem útskýrir — það ræður ekki litnum þínum."
                : "On your own rolling baseline. A side signal that explains — it doesn't decide your colour.")}
          </p>
        </div>
      </details>
    </div>
  );
}
