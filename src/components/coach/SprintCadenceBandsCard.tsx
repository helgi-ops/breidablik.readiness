"use client";

/**
 * src/components/coach/SprintCadenceBandsCard.tsx
 *
 * LONGEST CONTINUOUS RUNS (≥24 s) — IMA Free Running strides in runs of 24 s or more.
 *
 * The file/component name is historical ("sprint cadence") and kept so imports
 * don't break. IMA Free Running bands are BOUT-DURATION bands, and their EDGES
 * CHANGE per team/date (legacy 0-8-12-15-18-21-24-27-100: ≥24 s = bands 7–8 as
 * 24–27 s / 27 s+; Breiðablik from 10 Nov 2026 0-2.5-5-8-12-18-24-30-1000:
 * ≥24 s = bands 7–8 as 24–30 s / 30 s+). The total reads the config-independent
 * ima_fr_ge24_stride_count tier; the detail split groups by RUN LENGTH using each
 * row's own ima_fr_band_bounds, so 24–27 s and 24–30 s are never added together.
 * Mean speed in these runs is ~12–14 km/h and stride rate ~87–93/min — the same as
 * medium runs — so this is NOT sprinting and NOT high cadence
 * (docs/ima-free-running-bands.md). Sprint volume lives on SprintExposureCard (GPS).
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
import {
  bandsAtOrAbove,
  boundsOfRow,
  freeRunningBandLabel,
  sumBandsBetween,
} from "@/lib/integrations/catapult/freeRunningBands";

/** Runs of this length or more = "longest runs" (an edge in every band config). */
const LONGEST_RUN_MIN_S = 24;

type DayRow = {
  date: string;
  /** Strides in runs ≥24 s (ima_fr_ge24 tier, else summed from the row's own bands ≥24 s). */
  total: number;
};

/** One run-length line of the detail split (e.g. "Runs of 24–27 s"), summed over rows with the same edges. */
type SplitLine = {
  key: string;
  lo: number;
  labelEn: string;
  labelIs: string;
  sum7d: number;
  sum28d: number;
};

type Loaded = {
  days: DayRow[];
  sum7d: number;
  sum28d: number;
  split: SplitLine[];
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
          .select(
            "date, ima_fr_band_bounds, ima_fr_ge24_stride_count, " +
              "ima_fr_band6_stride_count, ima_fr_band7_stride_count, ima_fr_band8_stride_count",
          )
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

        const typed = (rows ?? []) as unknown as Array<Record<string, unknown> & { date: string }>;
        const days: DayRow[] = [];
        const split = new Map<string, SplitLine>();
        let sum7d = 0, sum28d = 0, daysWithData7d = 0;
        for (const r of typed) {
          const tier = Number(r.ima_fr_ge24_stride_count);
          const total = Number.isFinite(tier) && r.ima_fr_ge24_stride_count != null
            ? tier
            : sumBandsBetween(r, "stride_count", LONGEST_RUN_MIN_S) ?? 0;
          days.push({ date: r.date, total });
          const in7d = r.date >= from7Str;
          sum28d += total;
          if (in7d) {
            sum7d += total;
            if (total > 0) daysWithData7d += 1;
          }
          // Detail split by run length under this row's own edges (never by band number across rows).
          const bounds = boundsOfRow(r);
          for (const b of bandsAtOrAbove(bounds, LONGEST_RUN_MIN_S) ?? []) {
            const v = Number(r[`ima_fr_band${b}_stride_count`] ?? 0) || 0;
            const lo = bounds[b - 1];
            const hi = b === 8 ? "open" : String(bounds[b]);
            const key = `${lo}-${hi}`;
            const line = split.get(key) ?? {
              key, lo,
              labelEn: freeRunningBandLabel(b, "en", bounds),
              labelIs: freeRunningBandLabel(b, "is", bounds),
              sum7d: 0, sum28d: 0,
            };
            line.sum28d += v;
            if (in7d) line.sum7d += v;
            split.set(key, line);
          }
        }
        const splitLines = Array.from(split.values())
          .filter((l) => l.sum28d > 0)
          .sort((a, b) => a.lo - b.lo || a.key.localeCompare(b.key));

        setData({ days, sum7d, sum28d, split: splitLines, daysWithData7d });
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
  if (data.sum28d === 0) return null;

  const total7d = data.sum7d;
  const total28d = data.sum28d;
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
            {data.split.map((l) => (
              <div key={l.key} className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wide text-slate-500">{IS ? l.labelIs : l.labelEn} · 7d</div>
                <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(l.sum7d)}</div>
                <div className="text-[9px] text-slate-500">{IS ? "skref" : "strides"}</div>
              </div>
            ))}
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="text-[9px] uppercase tracking-wide text-slate-500">{IS ? "Samtals · 7d" : "Total · 7d"}</div>
              <div className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{fmt(total7d)}</div>
              <div className="text-[9px] text-slate-500">{IS ? "skref í löngum hlaupum" : "long-run strides"}</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-500">
            {IS
              ? `28 daga samtals: ${fmt(total28d)} skref (${data.split.map((l) => `${l.labelIs.toLowerCase()} ${fmt(l.sum28d)}`).join(" · ")})`
              : `28-day total: ${fmt(total28d)} strides (${data.split.map((l) => `${l.labelEn.toLowerCase()} ${fmt(l.sum28d)}`).join(" · ")})`}
          </div>
          <p className="mt-2 text-[10px] text-slate-500 leading-snug">
            {IS
              ? "Heimild: Catapult IMA Free Running (V2), öll hlaup sem stóðu í 24 sek eða lengur. Böndin flokka hvert samfellt hlaup eftir LENGD í sekúndum, ekki eftir hraða eða skreftíðni — meðalhraði er ~12–14 km/klst og skreftíðni ~87–93/mín, sú sama og í miðlungslöngum hlaupum. Bandamörkin breyttust 10. nóv. 2026 (efsta bilið varð 24–30 sek og >30 sek í stað 24–27 og >27), svo sundurliðunin sýnir hvort tveggja; heildartalan (≥24 sek) er sambærileg yfir breytinguna. Decel:Sprint Coupling reiturinn fyrir neðan les GPS-spretti, ekki þessa tölu."
              : "Source: Catapult IMA Free Running (V2), every run lasting 24 s or more. The bands sort each continuous run by its LENGTH in seconds, not by speed or stride rate — mean speed is ~12–14 km/h and stride rate ~87–93/min, the same as medium runs. The band edges changed on 10 Nov 2026 (the top split became 24–30 s and >30 s instead of 24–27 s and >27 s), so the split can show both; the total (≥24 s) compares across the change. The Decel:Sprint Coupling tile below reads GPS sprint efforts, not this number."}
          </p>
        </>
      )}
    </div>
  );
}
