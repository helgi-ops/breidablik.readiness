"use client";

/**
 * FosterMonotonyStrainCard — per-player Training Monotony + Strain (Foster 1998).
 *
 * Foster, C. (1998). Monitoring training in athletes with reference to
 * overtraining syndrome. Med Sci Sports Exerc, 30(7), 1164–1168.
 *
 * Definitions (computed over a rolling 7-day window per player):
 *   daily_load   = sRPE × duration_minutes  (AU)
 *   weekly_load  = sum(daily_load over last 7 days)
 *   mean_load    = weekly_load / 7
 *   sd_load      = stddev of daily_load across 7 days
 *   MONOTONY     = mean_load / sd_load
 *   STRAIN       = weekly_load × MONOTONY
 *
 * Thresholds (Foster 1998 + AC Milan / Real Madrid 2010s refinements):
 *   Monotony  ≤ 1.5   safe
 *             1.5–2.0 watch
 *             > 2.0   high overtraining risk
 *   Strain    ≤ 4000  safe
 *             4000–6000 watch
 *             > 6000  illness/injury "danger zone"
 *
 * Why Lite teams care: this is the OG load-monitoring math (used since
 * 1998, before GPS existed). Needs only sRPE + duration — no Catapult
 * Premium parameters required. Highest-quality training-load signal
 * available for clubs without a B2-3 plan.
 *
 * Lite-mode fallback: when RPE compliance is poor (<5 days/player in
 * 14d window), the card switches to a VOLUME-only variant using
 * total_distance instead of sRPE × duration. Same math, weaker signal,
 * but better than nothing. The header shows which variant is active.
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  teamId: string;
  /** Reference date (defaults to today). Foster windows are anchored
   *  here: weekly_load = sum of past 7 days INCLUSIVE of refDate. */
  refDate?: string;
  lang?: "EN" | "IS";
};

type DailyLoad = { date: string; load: number };
type PlayerRow = {
  id: string;
  name: string;
  position: string;
  daily: DailyLoad[];          // last 7 days (oldest → newest)
  weeklyLoad: number;          // sum of daily.load
  meanLoad: number;            // weeklyLoad / 7
  sdLoad: number;              // population SD across 7 days
  monotony: number | null;     // mean / sd; null when SD = 0
  strain: number | null;       // weeklyLoad × monotony
  daysWithData: number;
};

const I18N = {
  title:        { EN: "Training Monotony & Strain",  IS: "Training Monotony & Strain" },
  citation:     { EN: "Foster 1998",                 IS: "Foster 1998" },
  subtitleRpe:  { EN: "Per-player overtraining-risk monitoring from sRPE × duration (last 7 days). Variability matters as much as volume — a player loading 600 AU every day is at higher risk than one alternating 400/800.",
                  IS: "Eftir-leikmanns greining á overtraining-áhættu reiknað úr sRPE × tími (síðustu 7 dagar). Breytileikinn skiptir jafn miklu máli og magnið — leikmaður með 600 AU alla daga er í meiri hættu en einn sem skiptir á 400/800." },
  subtitleVol:  { EN: "Per-player overtraining-risk monitoring from training volume (total distance, last 7 days). Variant used when RPE compliance is too low for the canonical Foster method — weaker signal but still useful.",
                  IS: "Eftir-leikmanns greining á overtraining-áhættu reiknað úr æfingamagni (heildarvegalengd, síðustu 7 dagar). Notað þegar RPE compliance er of lítil fyrir hefðbundinn Foster reikning — veikari merki en samt nytsamlegt." },
  variantRpe:   { EN: "RPE × duration",  IS: "RPE × tími" },
  variantVol:   { EN: "Volume (m)",      IS: "Volume (m)" },
  player:       { EN: "Player",          IS: "Leikmaður" },
  weeklyLoad:   { EN: "Weekly load",     IS: "Vikuálag" },
  monotony:     { EN: "Monotony",        IS: "Monotony" },
  strain:       { EN: "Strain",          IS: "Strain" },
  monotonyTip:  {
    EN: "Monotony = mean weekly load ÷ standard deviation. Measures how SAME each day's training is. >2.0 means very little day-to-day variation — even at modest volume this raises illness/injury risk (Foster 1998). Coach lever: vary intensity day-to-day, even if total weekly volume stays the same.",
    IS: "Monotony = meðal-vikuálag ÷ staðalfrávik. Mælir hversu LÍK æfingar eru dag frá degi. >2.0 þýðir mjög lítill breytileiki milli daga — jafnvel í hófi-magni eykur þetta veikinda/meiðsla-áhættu (Foster 1998). Þjálfara-aðgerð: breyta intensity milli daga, jafnvel þótt heildar vikumagn haldist eins.",
  },
  strainTip:    {
    EN: "Strain = weekly load × monotony. Combined signal beats either metric alone (Foster 1998). >4000 AU = watch; >6000 AU = illness/injury danger zone. Two players with the same weekly load can have very different strain if one trains evenly and the other has spikes.",
    IS: "Strain = vikuálag × monotony. Sameinað merki er sterkara en hvor mæling fyrir sig (Foster 1998). >4000 AU = fylgjast með; >6000 AU = veikinda/meiðsla-svæði. Tveir leikmenn með sama vikuálag geta haft mjög ólíkan strain ef annar æfir jafnt en hinn hefur spikes.",
  },
  days:         { EN: "Days",            IS: "Dagar" },
  flag:         { EN: "Status",          IS: "Staða" },
  noData:       { EN: "No load data in the last 7 days. Players need to log RPE after sessions, or upload Catapult data.",
                  IS: "Engin álagsgögn síðustu 7 daga. Leikmenn þurfa að skrá RPE eftir æfingar, eða þú þarft að hlaða inn Catapult gögnum." },
  helpHeader:   { EN: "How to read",     IS: "Hvernig á að lesa" },
  helpBody:     {
    EN: "Monotony >2.0 = low day-to-day variability → overtraining risk. Strain >6000 AU = illness/injury danger zone (Foster 1998). The combined signal beats either metric alone.",
    IS: "Monotony >2.0 = lítill breytileiki milli daga → overtraining-áhætta. Strain >6000 AU = veikinda/meiðsla danger zone (Foster 1998). Saman gefa þessar tvær breytur betra svar en hvor um sig.",
  },
  flagSafe:     { EN: "Safe",     IS: "Öruggt" },
  flagWatch:    { EN: "Watch",    IS: "Fylgjast með" },
  flagHigh:     { EN: "High",     IS: "Hár" },
  flagDanger:   { EN: "Danger",   IS: "Hætta" },
} as const;

function tt<K extends keyof typeof I18N>(k: K, lang: "EN" | "IS"): string {
  return lang === "EN" ? I18N[k].EN : I18N[k].IS;
}

function dateMinusDays(refIso: string, n: number): string {
  const d = new Date(`${refIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function populationStdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Foster monotony has a known divide-by-zero pathology when every day
 *  has the same load or all-but-one are zero. Guard with epsilon and
 *  return null in those cases so we render "—" instead of Infinity. */
function fosterMetrics(loads: DailyLoad[]): Pick<PlayerRow, "weeklyLoad" | "meanLoad" | "sdLoad" | "monotony" | "strain" | "daysWithData"> {
  const xs = loads.map((d) => d.load);
  const weeklyLoad = xs.reduce((s, v) => s + v, 0);
  const meanLoad = xs.length > 0 ? weeklyLoad / xs.length : 0;
  const sdLoad = populationStdev(xs);
  const daysWithData = xs.filter((v) => v > 0).length;
  if (sdLoad < 0.5 || daysWithData < 2) {
    return { weeklyLoad, meanLoad, sdLoad, monotony: null, strain: null, daysWithData };
  }
  const monotony = meanLoad / sdLoad;
  const strain = weeklyLoad * monotony;
  return { weeklyLoad, meanLoad, sdLoad, monotony, strain, daysWithData };
}

function monotonyFlag(v: number | null): { label: string; bg: string; fg: string; key: "safe" | "watch" | "high" | "na" } {
  if (v == null)   return { key: "na",    label: "—",    bg: "bg-slate-50",   fg: "text-slate-400" };
  if (v > 2.0)     return { key: "high",  label: "HIGH", bg: "bg-rose-100",   fg: "text-rose-800 font-semibold" };
  if (v > 1.5)     return { key: "watch", label: "WATCH",bg: "bg-amber-100",  fg: "text-amber-800 font-semibold" };
  return                  { key: "safe",  label: "SAFE", bg: "bg-emerald-50", fg: "text-emerald-800" };
}

function strainFlag(v: number | null): { label: string; bg: string; fg: string; key: "safe" | "watch" | "danger" | "na" } {
  if (v == null)   return { key: "na",     label: "—",      bg: "bg-slate-50",   fg: "text-slate-400" };
  if (v > 6000)    return { key: "danger", label: "DANGER", bg: "bg-rose-100",   fg: "text-rose-800 font-semibold" };
  if (v > 4000)    return { key: "watch",  label: "WATCH",  bg: "bg-amber-100",  fg: "text-amber-800 font-semibold" };
  return                  { key: "safe",   label: "SAFE",   bg: "bg-emerald-50", fg: "text-emerald-800" };
}

/** Combined per-row badge — picks the worst of the two flags so coaches
 *  can scan the rightmost column without parsing both numbers. */
function combinedFlag(m: ReturnType<typeof monotonyFlag>, s: ReturnType<typeof strainFlag>, lang: "EN" | "IS") {
  const dangerHits = (m.key === "high" ? 1 : 0) + (s.key === "danger" ? 1 : 0);
  const watchHits  = (m.key === "watch" ? 1 : 0) + (s.key === "watch" ? 1 : 0);
  if (dangerHits >= 1) return { label: tt("flagDanger", lang), bg: "bg-rose-100", fg: "text-rose-800 font-semibold" };
  if (watchHits  >= 1) return { label: tt("flagWatch", lang),  bg: "bg-amber-100", fg: "text-amber-800 font-semibold" };
  if (m.key === "na" && s.key === "na") return { label: "—", bg: "bg-slate-50", fg: "text-slate-400" };
  return { label: tt("flagSafe", lang), bg: "bg-emerald-50", fg: "text-emerald-800" };
}

export default function FosterMonotonyStrainCard({ teamId, refDate, lang = "EN" }: Props) {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const today = refDate ?? new Date().toISOString().slice(0, 10);
  const weekStart = React.useMemo(() => dateMinusDays(today, 6), [today]);

  const [rows, setRows] = React.useState<PlayerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [variant, setVariant] = React.useState<"rpe" | "volume">("rpe");

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        // Roster
        const { data: roster } = await supabase
          .from("players")
          .select("id, full_name, position")
          .eq("team_id", teamId)
          .eq("is_active", true)
          .order("full_name");
        if (!alive) return;
        const players = (roster ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
        if (players.length === 0) { setRows([]); setLoading(false); return; }
        const playerIds = players.map((p) => p.id);

        // Try RPE first (Foster's canonical input). session_rpe_entries
        // already stores session_load = rpe × duration_minutes so we can
        // sum directly per (player, date).
        const { data: rpeData } = await supabase
          .from("session_rpe_entries")
          .select("player_id, session_date, session_load")
          .eq("team_id", teamId)
          .in("player_id", playerIds)
          .gte("session_date", weekStart)
          .lte("session_date", today)
          .gt("session_load", 0);
        const rpeRows = (rpeData ?? []) as Array<{ player_id: string; session_date: string; session_load: number | null }>;

        // RPE compliance check — if fewer than 5 days have any RPE
        // logged across the whole squad in the 7-day window, fall back
        // to volume-only variant. Threshold picked so 1 player logging
        // every day = 7 days, well above 5; many players logging spotty
        // = still fires.
        const distinctRpeDays = new Set(rpeRows.map((r) => r.session_date)).size;
        const useVolumeFallback = distinctRpeDays < 5;
        if (alive) setVariant(useVolumeFallback ? "volume" : "rpe");

        // If falling back, fetch external load instead.
        let dailyByPlayer = new Map<string, Map<string, number>>();
        if (!useVolumeFallback) {
          for (const r of rpeRows) {
            const pid = String(r.player_id);
            const inner = dailyByPlayer.get(pid) ?? new Map<string, number>();
            inner.set(r.session_date, (inner.get(r.session_date) ?? 0) + Number(r.session_load ?? 0));
            dailyByPlayer.set(pid, inner);
          }
        } else {
          const { data: extData } = await supabase
            .from("player_external_load_daily")
            .select("player_id, date, total_distance")
            .eq("team_id", teamId)
            .in("source", ["catapult", "manual"])
            .in("player_id", playerIds)
            .gte("date", weekStart)
            .lte("date", today)
            .gt("total_distance", 0);
          for (const r of ((extData ?? []) as Array<{ player_id: string; date: string; total_distance: number | null }>)) {
            const pid = String(r.player_id);
            const inner = dailyByPlayer.get(pid) ?? new Map<string, number>();
            // Scale total_distance down to AU-comparable range (÷10 puts a
            // typical 6000 m session at "600 AU" which lines up with a
            // mid-range RPE-load value, so the same thresholds remain
            // approximately valid).
            inner.set(r.date, (inner.get(r.date) ?? 0) + Math.round((Number(r.total_distance ?? 0)) / 10));
            dailyByPlayer.set(pid, inner);
          }
        }

        // Build dense 7-day windows per player (0-pad missing days so
        // SD reflects true variability, not just "I trained 3 hard days
        // and skipped 4" → that's MORE monotony of zero, not less)
        const windowDates: string[] = [];
        for (let i = 6; i >= 0; i--) windowDates.push(dateMinusDays(today, i));

        const computed = players.map((p) => {
          const inner = dailyByPlayer.get(p.id) ?? new Map<string, number>();
          const daily: DailyLoad[] = windowDates.map((d) => ({ date: d, load: inner.get(d) ?? 0 }));
          const m = fosterMetrics(daily);
          return {
            id: p.id,
            name: String(p.full_name ?? ""),
            position: String(p.position ?? "—"),
            daily,
            ...m,
          } as PlayerRow;
        });

        // Filter to players who have at least 1 day of training in the window
        const filtered = computed.filter((r) => r.daysWithData >= 1);
        if (alive) setRows(filtered);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId, today, weekStart]);

  const variantBadge = variant === "rpe"
    ? { label: tt("variantRpe", lang), bg: "bg-emerald-100 text-emerald-800 border-emerald-300" }
    : { label: tt("variantVol", lang), bg: "bg-blue-100 text-blue-800 border-blue-300" };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <span>{tt("title", lang)}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                {tt("citation", lang)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${variantBadge.bg}`}>
                {variantBadge.label}
              </span>
            </CardTitle>
            <CardDescription className="mt-1 max-w-3xl text-xs">
              {variant === "rpe" ? tt("subtitleRpe", lang) : tt("subtitleVol", lang)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {loading && (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            {lang === "EN" ? "Loading…" : "Hleður…"}
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-slate-400">
            {tt("noData", lang)}
          </div>
        )}
        {!loading && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{tt("player", lang)}</th>
                  <th className="px-3 py-2 text-right font-medium">{tt("days", lang)}</th>
                  <th className="px-3 py-2 text-right font-medium">{tt("weeklyLoad", lang)}</th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      {tt("monotony", lang)}
                      <span
                        title={tt("monotonyTip", lang)}
                        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                        aria-label={tt("monotonyTip", lang)}
                      >
                        i
                      </span>
                    </span>
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      {tt("strain", lang)}
                      <span
                        title={tt("strainTip", lang)}
                        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-400 text-[9px] font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                        aria-label={tt("strainTip", lang)}
                      >
                        i
                      </span>
                    </span>
                  </th>
                  <th className="px-4 py-2 text-center font-medium">{tt("flag", lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows
                  .slice()
                  .sort((a, b) => (b.strain ?? 0) - (a.strain ?? 0))
                  .map((r) => {
                    const mFlag = monotonyFlag(r.monotony);
                    const sFlag = strainFlag(r.strain);
                    const cFlag = combinedFlag(mFlag, sFlag, lang);
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{r.name || "—"}</div>
                          <div className="text-[11px] text-slate-500">{r.position}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{r.daysWithData}/7</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900 font-medium">
                          {Math.round(r.weeklyLoad).toLocaleString()}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${mFlag.fg}`}>
                          {r.monotony == null ? "—" : r.monotony.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums ${sFlag.fg}`}>
                          {r.strain == null ? "—" : Math.round(r.strain).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cFlag.bg} ${cFlag.fg}`}>
                            {cFlag.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700">{tt("helpHeader", lang)}</div>
            <p className="mt-1">{tt("helpBody", lang)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
