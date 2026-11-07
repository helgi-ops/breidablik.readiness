"use client";

/**
 * src/components/coach/SprintCadenceBandsCard.tsx
 *
 * LONGEST CONTINUOUS RUNS (≥24 s) — IMA Free Running bands 7 + 8, as strides.
 *
 * The file/component name is historical ("sprint cadence") and kept so imports
 * don't break. IMA Free Running bands are BOUT-DURATION bands: band 7 = runs
 * lasting 24–27 s, band 8 = runs longer than 27 s. Mean speed in these bands is
 * ~12–14 km/h and stride rate ~87–93/min — the same as bands 4–6 — so this is
 * NOT sprinting and NOT high cadence (docs/ima-free-running-bands.md). Sprint
 * volume lives on SprintExposureCard (GPS sprint distance).
 *
 * Why reframe instead of re-sourcing to GPS sprint efforts: this card sits
 * directly under SprintExposureCard, which is GPS-sourced, so a GPS version
 * here would duplicate it. It stays IMU-only, so it works indoors where GPS
 * sprint is null. (The Decel:Sprint Coupling tile reads GPS sprint efforts
 * since migration 20261107110000; these strides are no longer its denominator.)
 *
 * Reads player_external_load_daily directly (RLS lets a coach see their own
 * team's players) — no API route needed.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { freeRunningBandLabel } from "@/lib/integrations/catapult/freeRunningBands";

type DayRow = {
  date: string;
  band7: number;
  band8: number;
};

type Loaded = {
  days: DayRow[];
  sum7dB7: number;
  sum7dB8: number;
  sum28dB7: number;
  sum28dB8: number;
  daysWithData7d: number;
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function SprintCadenceBandsCard({ playerId }: { playerId: string }) {
  const [lang] = useLang();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const today = new Date();
        const from28 = new Date(today);
        from28.setUTCDate(from28.getUTCDate() - 27);
        const from7 = new Date(today);
        from7.setUTCDate(from7.getUTCDate() - 6);
        const from7Str = toDateStr(from7);

        const { data: rows, error } = await supabase
          .from("player_external_load_daily")
          .select("date, ima_fr_band7_stride_count, ima_fr_band8_stride_count")
          .eq("player_id", playerId)
          .gte("date", toDateStr(from28))
          .lte("date", toDateStr(today))
          .in("source", ["catapult", "manual"])
          .order("date", { ascending: true });

        if (!alive) return;
        if (error) {
          setLoading(false);
          return;
        }

        const days: DayRow[] = ((rows ?? []) as Array<{
          date: string;
          ima_fr_band7_stride_count: number | null;
          ima_fr_band8_stride_count: number | null;
        }>).map((r) => ({
          date: r.date,
          band7: Number(r.ima_fr_band7_stride_count ?? 0) || 0,
          band8: Number(r.ima_fr_band8_stride_count ?? 0) || 0,
        }));

        let sum7dB7 = 0, sum7dB8 = 0, sum28dB7 = 0, sum28dB8 = 0, daysWithData7d = 0;
        for (const d of days) {
          sum28dB7 += d.band7;
          sum28dB8 += d.band8;
          if (d.date >= from7Str) {
            sum7dB7 += d.band7;
            sum7dB8 += d.band8;
            if (d.band7 > 0 || d.band8 > 0) daysWithData7d += 1;
          }
        }

        setData({ days, sum7dB7, sum7dB8, sum28dB7, sum28dB8, daysWithData7d });
      } catch {
        /* silent — card just won't render */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  if (loading) return null;
  if (!data) return null;

  // Nothing captured at all in 28 days — hide rather than show an empty card.
  if (data.sum28dB7 === 0 && data.sum28dB8 === 0) return null;

  const total7d = data.sum7dB7 + data.sum7dB8;
  const total28d = data.sum28dB7 + data.sum28dB8;
  const usualWeek = total28d / 4;
  const fmt = (n: number) => Math.round(n).toLocaleString("is-IS");
  const IS = lang === "IS";

  // Level 0 — plain verdict: this week's long-run volume vs his usual week.
  const ratio = usualWeek > 0 ? total7d / usualWeek : null;
  const verdict = (() => {
    if (ratio == null) return IS ? "Engin löng hlaup síðustu 4 vikur" : "No long runs in the last 4 weeks";
    if (total7d === 0) return IS ? "Engin löng samfelld hlaup þessa vikuna" : "No long continuous runs this week";
    if (ratio >= 1.3) return IS ? "Meira af löngum hlaupum en venjulega þessa vikuna" : "More long continuous running than usual this week";
    if (ratio <= 0.7) return IS ? "Minna af löngum hlaupum en venjulega þessa vikuna" : "Less long continuous running than usual this week";
    return IS ? "Löng hlaup svipuð og venjulega þessa vikuna" : "Long continuous running about the same as usual this week";
  })();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-900">
            {IS ? "Lengstu samfelldu hlaupin (≥24 sek)" : "Longest continuous runs (≥24 s)"}
          </div>
          <div className="text-[11px] text-slate-500">
            {IS
              ? "Skref í hlaupum sem standa í 24 sek eða lengur. Ekki sprettir. Virkar inni og úti."
              : "Strides in runs lasting 24 s or more. Not sprinting. Works indoor and outdoor."}
          </div>
        </div>
      </div>

      {/* Level 0 — verdict */}
      <p className="mt-3 text-sm font-semibold text-slate-900">{verdict}</p>

      {/* Level 1 — plain facts */}
      <ul className="mt-1.5 list-disc pl-4 text-xs text-slate-600 leading-relaxed">
        <li>
          {IS
            ? `${fmt(total7d)} skref í löngum hlaupum síðustu 7 daga (venjuleg vika hjá honum: ~${fmt(usualWeek)}).`
            : `${fmt(total7d)} strides in long runs over the last 7 days (his usual week: ~${fmt(usualWeek)}).`}
        </li>
        <li>
          {IS
            ? `Mælt á ${data.daysWithData7d} af síðustu 7 dögum.`
            : `Measured on ${data.daysWithData7d} of the last 7 days.`}
        </li>
        <li>
          {IS
            ? "Þetta er hlaupaúthald (tempó / löng endurheimtarhlaup), ekki spretthraði — sprettir eru á kortinu fyrir ofan (GPS)."
            : "This is sustained running (tempo / long recovery runs), not sprint speed — sprinting is on the card above (GPS)."}
        </li>
      </ul>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        className="mt-2 text-[11px] font-semibold text-slate-500 underline-offset-2 hover:underline"
      >
        {showDetails ? (IS ? "Fela nánar" : "Hide details") : (IS ? "Sýna nánar" : "Show details")}
      </button>

      {/* Level 2 — per-band split + source */}
      {showDetails && (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{freeRunningBandLabel(7, IS ? "is" : "en")} · 7d</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(data.sum7dB7)}</div>
              <div className="text-[9px] text-slate-500">{IS ? "skref" : "strides"}</div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{freeRunningBandLabel(8, IS ? "is" : "en")} · 7d</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(data.sum7dB8)}</div>
              <div className="text-[9px] text-slate-500">{IS ? "skref" : "strides"}</div>
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{IS ? "Samtals · 7d" : "Total · 7d"}</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(total7d)}</div>
              <div className="text-[9px] text-slate-500">{IS ? "skref í löngum hlaupum" : "long-run strides"}</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            {IS
              ? `28 daga samtals: ${fmt(total28d)} skref (24–27 sek ${fmt(data.sum28dB7)} · >27 sek ${fmt(data.sum28dB8)})`
              : `28-day total: ${fmt(total28d)} strides (24–27 s ${fmt(data.sum28dB7)} · >27 s ${fmt(data.sum28dB8)})`}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-snug">
            {IS
              ? "Heimild: Catapult IMA Free Running, bönd 7–8 (V2). Böndin flokka hvert samfellt hlaup eftir LENGD í sekúndum (band 7 = 24–27 sek, band 8 = >27 sek), ekki eftir hraða eða skreftíðni — meðalhraði er ~12–14 km/klst og skreftíðni ~87–93/mín, sú sama og í böndum 4–6. Decel:Sprint Coupling reiturinn fyrir neðan les GPS-spretti, ekki þessa tölu."
              : "Source: Catapult IMA Free Running, bands 7–8 (V2). The bands sort each continuous run by its LENGTH in seconds (band 7 = 24–27 s, band 8 = >27 s), not by speed or stride rate — mean speed is ~12–14 km/h and stride rate ~87–93/min, the same as bands 4–6. The Decel:Sprint Coupling tile below reads GPS sprint efforts, not this number."}
          </p>
        </>
      )}
    </div>
  );
}
