"use client";

/**
 * MatchMovementComparison — the driver-layer (IMA) match comparison, the
 * companion to GPS/MD comparison. GPS volume is similar match-to-match; this
 * shows HOW a player moved. One fetched dataset, three views:
 *   • norm  — a player's latest match vs his own match-average
 *   • ab    — match A vs match B for a player
 *   • squad — every player in one match
 * Explainability-first: a plain verdict on top, the five-dimension breakdown
 * below, raw numbers behind "Show details". Rules compute it; no AI.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { downloadMatchMovementPdf } from "@/components/coach/MatchMovementPdf";
import ShowDetails from "@/components/common/ShowDetails";
import { CompareRadar, ChartZoom } from "@/components/coach/PlayerGameReportCharts";
import {
  SUB_BAND_GROUPS,
  fmtDim,
  whyWord,
  dimByKey,
  movementDimensions,
  type DimensionKey,
  type MovementDimension,
  type MovementFingerprint,
  type MatchMovementResult,
  type MatchMovementRow,
  type SubBands,
} from "@/lib/micropulse/matchMovement/types";

type Mode = "norm" | "ab" | "squad";

// Plain, coach-facing definition of each dimension (IMA + GPS variants) — the
// data is new to many coaches, so this says what the axis IS in one line.
const DIM_DEFS: Record<DimensionKey, { en: string; is: string }> = {
  totalPerMin:     { en: "The overall amount of movement work per minute — accelerations, decelerations and turns combined.",
                     is: "Heildar hreyfi-vinna á mínútu — hröðun, hemlun og snúningar samanlagt." },
  accelDecelRatio: { en: "The balance of speeding up vs slowing down. Above 1 = more accelerating (front-foot); below 1 = more braking (reactive).",
                     is: "Jafnvægi milli hröðunar og hemlunar. Yfir 1 = meiri hröðun (sóknar); undir 1 = meiri hemlun (viðbragð)." },
  codPerMin:       { en: "How often the player changes direction per minute — the agility demand of his game.",
                     is: "Hversu oft leikmaðurinn skiptir um stefnu á mínútu — lipurðar-krafan í leik hans." },
  codLeftPct:      { en: "Share of turns to the left vs right. Near 50% is balanced; a big skew flags a one-sided pattern.",
                     is: "Hlutfall vinstri vs hægri snúninga. Um 50% er jafnt; mikil skekkja bendir á einhliða mynstur." },
  hiCadencePerMin: { en: "Fast, sprint-type running per minute (stride bands 6-8) — the IMA read on high-speed running.",
                     is: "Hratt sprett-hlaup á mínútu (skref-bönd 6-8) — IMA-mæling á hröðu hlaupi." },
  // GPS variant (Core/Lite)
  workPerMin:      { en: "Overall physical workload per minute (GPS player load) — how hard the game was.",
                     is: "Heildar líkamlegt álag á mínútu (GPS) — hversu erfiður leikurinn var." },
  effortsPerMin:   { en: "Sharp accelerations and decelerations per minute — the agility / stop-start demand (the GPS stand-in for change of direction).",
                     is: "Snöggar hröðunir og hemlanir á mínútu — lipurðar-/stopp-og-fara krafan (GPS-staðgengill fyrir stefnubreytingar)." },
  hsrPerMin:       { en: "High-speed running metres per minute — how much fast running.",
                     is: "Háhraðahlaup (metrar) á mínútu — hversu mikið hratt hlaup." },
  sprintPerMin:    { en: "Sprint-distance metres per minute — top-end running.",
                     is: "Sprett-vegalengd (metrar) á mínútu — hámarkshraða hlaup." },
  topSpeed:        { en: "Peak sprint speed reached in the match (km/h).",
                     is: "Hæsti hraði sem náðist í leiknum (km/klst)." },
};

function fmtDate(iso: string, is: boolean): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(is ? "is-IS" : "en-GB", { day: "numeric", month: "short" });
}

/** Signed deviation of a value vs a baseline — % for rate/ratio dims, points for pct dims. */
function deviation(key: DimensionKey, cur: number | null, base: number | null): { rel: number; abs: number } | null {
  if (cur == null || base == null) return null;
  const dim = dimByKey(key)!;
  const rel = dim.kind === "pct" ? cur - base : base !== 0 ? ((cur - base) / base) * 100 : 0;
  return { rel, abs: Math.abs(rel) };
}
function isSignificant(key: DimensionKey, abs: number): boolean {
  const dim = dimByKey(key)!;
  return dim.kind === "pct" ? abs >= 10 : abs >= 20;
}
function dirWord(key: DimensionKey, rel: number, is: boolean): string {
  const d = dimByKey(key)!;
  return rel > 0 ? (is ? d.moreIS : d.moreEN) : is ? d.lessIS : d.lessEN;
}
function magWord(key: DimensionKey, rel: number, is: boolean): string {
  const d = dimByKey(key)!;
  const m = Math.abs(Math.round(rel));
  return d.kind === "pct" ? `${m} ${is ? "stig" : "pts"}` : `${m}%`;
}

/** Squad mean of each dimension across a match's rows (nulls skipped). */
function meanFp(rows: MatchMovementRow[], dims: MovementDimension[]): MovementFingerprint {
  const out: MovementFingerprint = {};
  for (const d of dims) {
    const vals = rows.map((r) => r.fingerprint[d.key]).filter((v): v is number => v != null);
    out[d.key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

type Series = { label: string; fp: MovementFingerprint; barClass: string };
type SubSeries = { label: string; sub: SubBands; barClass: string };

/** S&C drill-down — raw per-match sub-band counts, grouped, high-intensity flagged. */
function SubBandsBreakdown({ series, is }: { series: SubSeries[]; is: boolean }) {
  return (
    <div className="space-y-3">
      {SUB_BAND_GROUPS.map((g) => (
        <div key={g.group}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? g.labelIS : g.labelEN}</div>
          <div className="space-y-1.5">
            {g.bands.map((b) => {
              const vals = series.map((s) => s.sub[b.key]).filter((v): v is number => v != null);
              const max = vals.length ? Math.max(...vals) : 1;
              return (
                <div key={b.key}>
                  <div className={`mb-0.5 text-[10px] ${b.high ? "font-semibold text-rose-600" : "text-slate-400"}`}>
                    {is ? b.is : b.en}{b.high ? (is ? " · háákefðar" : " · high-intensity") : ""}
                  </div>
                  {series.map((s) => {
                    const v = s.sub[b.key];
                    const w = v != null && max > 0 ? Math.max(4, Math.round((v / max) * 100)) : 0;
                    return (
                      <div key={s.label} className="flex items-center gap-2">
                        <div className="w-24 shrink-0 truncate text-[10px] text-slate-500">{s.label}</div>
                        <div className="h-3 flex-1 rounded bg-slate-100">
                          <div className={`h-3 rounded ${b.high ? "bg-rose-400" : s.barClass}`} style={{ width: `${w}%` }} />
                        </div>
                        <div className="w-10 shrink-0 text-right text-[10px] font-semibold tabular-nums text-slate-700">{v == null ? "—" : Math.round(v)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] leading-snug text-slate-400">
        {is
          ? "Hráar tölur per leik. Háákefðar decel-ar / CoD / sprett-bönd (rautt) eru krefjandi endinn sem summan í fingrafarinu felur — lýsandi vélræn krafa (McBurnie 2022), ekki meiðsla-spá."
          : "Raw per-match counts. High-intensity decels / CoD / sprint bands (red) are the demanding end the summed fingerprint hides — a descriptive read of mechanical demand (McBurnie 2022), not an injury prediction."}
      </p>
    </div>
  );
}

function DimBars({ series, is, dims }: { series: Series[]; is: boolean; dims: MovementDimension[] }) {
  return (
    <div className="space-y-2.5">
      {dims.map((d) => {
        const vals = series.map((s) => s.fp[d.key]).filter((v): v is number => v != null);
        const max = vals.length ? Math.max(...vals, d.kind === "ratio" ? 1 : 0) : 1;
        return (
          <div key={d.key}>
            <div className="mb-0.5 text-[11px] font-medium text-slate-500">{is ? d.is : d.en}</div>
            <div className="space-y-1">
              {series.map((s) => {
                const v = s.fp[d.key];
                const w = v != null && max > 0 ? Math.max(4, Math.round((v / max) * 100)) : 0;
                return (
                  <div key={s.label} className="flex items-center gap-2">
                    <div className="w-24 shrink-0 truncate text-[11px] text-slate-500">{s.label}</div>
                    <div className="h-4 flex-1 rounded bg-slate-100">
                      <div className={`h-4 rounded ${s.barClass}`} style={{ width: `${w}%` }} />
                    </div>
                    <div className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-700">{fmtDim(d.key, v)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function MatchMovementComparison() {
  const [lang] = useLang();
  const is = lang === "IS";
  const [data, setData] = useState<MatchMovementResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("norm");
  const [playerId, setPlayerId] = useState<string>("");
  const [matchA, setMatchA] = useState<string>("");
  const [matchB, setMatchB] = useState<string>("");
  const [squadMatch, setSquadMatch] = useState<string>("");
  const [squadMatchB, setSquadMatchB] = useState<string>(""); // "" = no comparison
  const [openDef, setOpenDef] = useState<DimensionKey | null>(null); // which dimension explainer is open
  const [ai, setAi] = useState<{ sig: string; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: { session } } = await sb.auth.getSession();
        if (!session?.access_token) { if (alive) { setErr("Unauthorized"); setLoading(false); } return; }
        const res = await fetch("/api/coach/match-movement", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) { setErr(json.error ?? "Failed"); setLoading(false); return; }
        setData(json as MatchMovementResult);
        setLoading(false);
      } catch (e) { if (alive) { setErr(e instanceof Error ? e.message : "Network error"); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, []);

  // Derive the effective selection INLINE (default to the first player / latest
  // match) so a fresh load shows something without seeding state from an effect
  // — avoids the cascading-render setState-in-effect pattern.
  const effPlayerId = playerId || (data ? (data.players.find((p) => p.matches >= 1)?.player_id ?? data.players[0]?.player_id ?? "") : "");
  const playerRows = useMemo(
    () => (data && effPlayerId ? data.rows.filter((r) => r.player_id === effPlayerId).sort((a, b) => b.match_date.localeCompare(a.match_date)) : []),
    [data, effPlayerId],
  );

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">{is ? "Hleður…" : "Loading…"}</div>;
  if (err || !data) return null; // silent — page shows its own context
  if (data.rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        {is ? "Engin leikja-IMA gögn enn (þarf Catapult IMA á leikdögum)." : "No match IMA data yet (needs Catapult IMA on match days)."}
      </div>
    );
  }

  const effMatchA = matchA || playerRows[0]?.match_date || "";
  const effMatchB = matchB || playerRows[1]?.match_date || "";
  const effSquadMatch = squadMatch || (data.matchDates[data.matchDates.length - 1] ?? "");
  const playerName = data.players.find((p) => p.player_id === effPlayerId)?.name ?? "—";

  // The dimension set depends on the club's data: the true IMA driver (Pro/ELITE)
  // or the GPS movement read (Core/Lite). Everything below is variant-generic.
  const DIMS = movementDimensions(data.variant);
  const isGps = data.variant === "gps";
  // The squad "standout" dimensions differ by variant (IMA has change-of-direction
  // + accel:decel; GPS has accel/decel efforts + top speed).
  const primaryKey = isGps ? "effortsPerMin" : "codPerMin";
  const secondaryKey = isGps ? "topSpeed" : "accelDecelRatio";

  // AI explanation — the selection signature so a stale narrative never lingers
  // after the coach changes what's shown (only display `ai` if it matches).
  const aiSig = `${mode}|${effPlayerId}|${effMatchA}|${effMatchB}|${effSquadMatch}|${squadMatchB}`;
  const genAi = async () => {
    setAiBusy(true); setAiErr(null);
    try {
      const sb = getSupabaseClient();
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch("/api/coach/match-movement/narrative", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ lang, mode, playerId: effPlayerId, matchA: effMatchA, matchB: effMatchB, squadMatch: effSquadMatch, squadMatchB }),
      });
      const j = await res.json();
      if (!res.ok) { setAiErr(j.error ?? "Failed"); return; }
      setAi({ sig: aiSig, text: j.narrative as string });
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setAiBusy(false);
    }
  };

  // ── Verdict + series per mode ───────────────────────────────────────────────
  let verdict = "";          // layer 0 — the WHAT (metric read)
  let interpretation = "";   // layer 1 — the "what it means" for the coach
  let confidence = "";       // the data behind it (matches / minutes)
  let facts: string[] = [];
  let series: Series[] = [];
  let subSeries: SubSeries[] = [];
  let squadRows: MatchMovementRow[] = [];

  const nMatches = data.players.find((p) => p.player_id === effPlayerId)?.matches ?? 0;
  const thinNorm = (is ? " · venja enn að myndast" : " · norm still forming");

  if (mode === "norm") {
    const latest = playerRows.find((r) => r.match_date === effMatchA) ?? playerRows[0];
    const norm = data.playerAverages[effPlayerId];
    if (latest && norm) {
      series = [
        { label: is ? "Þessi leikur" : "This match", fp: latest.fingerprint, barClass: "bg-indigo-500" },
        { label: is ? "Hans venja" : "His usual", fp: norm, barClass: "bg-slate-400" },
      ];
      if (!isGps && data.subAverages[effPlayerId]) subSeries = [
        { label: is ? "Þessi leikur" : "This match", sub: latest.sub, barClass: "bg-indigo-500" },
        { label: is ? "Hans venja" : "His usual", sub: data.subAverages[effPlayerId], barClass: "bg-slate-400" },
      ];
      const devs = DIMS
        .map((d) => ({ d, dev: deviation(d.key, latest.fingerprint[d.key], norm[d.key]) }))
        .filter((x): x is { d: MovementDimension; dev: { rel: number; abs: number } } => x.dev != null && isSignificant(x.d.key, x.dev.abs))
        .sort((a, b) => b.dev.abs - a.dev.abs);
      if (devs.length === 0) {
        verdict = is
          ? `${playerName} hreyfði sig eins og venjulega í leiknum ${fmtDate(latest.match_date, is)}.`
          : `${playerName} moved like his usual self in the ${fmtDate(latest.match_date, is)} match.`;
      } else {
        const parts = devs.slice(0, 2).map((x) => `${dirWord(x.d.key, x.dev.rel, is)} (${magWord(x.d.key, x.dev.rel, is)})`);
        verdict = is
          ? `${playerName} hreyfði sig öðruvísi í leiknum ${fmtDate(latest.match_date, is)} — ${parts.join(", ")} en venjulega.`
          : `${playerName} moved differently in the ${fmtDate(latest.match_date, is)} match — ${parts.join(", ")} than usual.`;
        interpretation = (is ? "Í stuttu máli: " : "In plain terms: ") +
          devs.slice(0, 2).map((x) => whyWord(x.d.key, x.dev.rel, is)).join(is ? "; og " : "; and ") + ".";
        facts = devs.slice(2, 4).map((x) => `${is ? x.d.is : x.d.en}: ${dirWord(x.d.key, x.dev.rel, is)} (${magWord(x.d.key, x.dev.rel, is)})`);
      }
      confidence = (is ? `Byggt á ${nMatches} leikjum hans · þessi leikur ${latest.minutes}′` : `Based on his ${nMatches} matches · this game ${latest.minutes}′`)
        + (nMatches < 3 ? thinNorm : "");
    }
  } else if (mode === "ab") {
    const a = playerRows.find((r) => r.match_date === effMatchA);
    const b = playerRows.find((r) => r.match_date === effMatchB);
    if (a && b) {
      series = [
        { label: fmtDate(a.match_date, is), fp: a.fingerprint, barClass: "bg-indigo-500" },
        { label: fmtDate(b.match_date, is), fp: b.fingerprint, barClass: "bg-emerald-500" },
      ];
      if (!isGps) subSeries = [
        { label: fmtDate(a.match_date, is), sub: a.sub, barClass: "bg-indigo-500" },
        { label: fmtDate(b.match_date, is), sub: b.sub, barClass: "bg-emerald-500" },
      ];
      const diffs = DIMS
        .map((d) => ({ d, dev: deviation(d.key, b.fingerprint[d.key], a.fingerprint[d.key]) }))
        .filter((x): x is { d: MovementDimension; dev: { rel: number; abs: number } } => x.dev != null && isSignificant(x.d.key, x.dev.abs))
        .sort((x, y) => y.dev.abs - x.dev.abs);
      if (diffs.length === 0) {
        verdict = is
          ? `${playerName} hreyfði sig svipað í báðum leikjum.`
          : `${playerName} moved similarly in both matches.`;
      } else {
        const parts = diffs.slice(0, 2).map((x) => `${dirWord(x.d.key, x.dev.rel, is)} (${magWord(x.d.key, x.dev.rel, is)})`);
        verdict = is
          ? `Í leiknum ${fmtDate(b.match_date, is)} vs ${fmtDate(a.match_date, is)}: ${playerName} með ${parts.join(", ")}.`
          : `In the ${fmtDate(b.match_date, is)} vs ${fmtDate(a.match_date, is)} match: ${playerName} showed ${parts.join(", ")}.`;
        interpretation = (is ? `Í ${fmtDate(b.match_date, is)}-leiknum: ` : `In the ${fmtDate(b.match_date, is)} match: `) +
          diffs.slice(0, 2).map((x) => whyWord(x.d.key, x.dev.rel, is)).join(is ? "; og " : "; and ") + ".";
      }
      confidence = is ? `${fmtDate(a.match_date, is)}: ${a.minutes}′ · ${fmtDate(b.match_date, is)}: ${b.minutes}′`
                      : `${fmtDate(a.match_date, is)}: ${a.minutes}′ · ${fmtDate(b.match_date, is)}: ${b.minutes}′`;
    }
  } else {
    squadRows = data.rows.filter((r) => r.match_date === effSquadMatch).sort((a, b) => (b.fingerprint[primaryKey] ?? 0) - (a.fingerprint[primaryKey] ?? 0));
    const squadRowsB = squadMatchB && squadMatchB !== effSquadMatch ? data.rows.filter((r) => r.match_date === squadMatchB) : [];

    if (squadRowsB.length > 0 && squadRows.length > 0) {
      // Squad-vs-squad: compare the two matches by the squad's MEAN fingerprint,
      // then name the biggest individual movers (players who played both).
      const avgA = meanFp(squadRows, DIMS);
      const avgB = meanFp(squadRowsB, DIMS);
      series = [
        { label: fmtDate(effSquadMatch, is), fp: avgA, barClass: "bg-indigo-500" },
        { label: fmtDate(squadMatchB, is), fp: avgB, barClass: "bg-emerald-500" },
      ];
      const diffs = DIMS
        .map((d) => ({ d, dev: deviation(d.key, avgA[d.key], avgB[d.key]) }))
        .filter((x): x is { d: MovementDimension; dev: { rel: number; abs: number } } => x.dev != null && isSignificant(x.d.key, x.dev.abs))
        .sort((x, y) => y.dev.abs - x.dev.abs);
      if (diffs.length === 0) {
        verdict = is
          ? `Liðið hreyfði sig svipað í báðum leikjum (${fmtDate(effSquadMatch, is)} vs ${fmtDate(squadMatchB, is)}).`
          : `The squad moved similarly in both matches (${fmtDate(effSquadMatch, is)} vs ${fmtDate(squadMatchB, is)}).`;
      } else {
        const parts = diffs.slice(0, 2).map((x) => `${dirWord(x.d.key, x.dev.rel, is)} (${magWord(x.d.key, x.dev.rel, is)})`);
        verdict = is
          ? `Liðið í heild — ${fmtDate(effSquadMatch, is)} vs ${fmtDate(squadMatchB, is)}: ${parts.join(", ")}.`
          : `The squad overall — ${fmtDate(effSquadMatch, is)} vs ${fmtDate(squadMatchB, is)}: ${parts.join(", ")}.`;
        interpretation = (is ? "Í stuttu máli: " : "In plain terms: ") +
          diffs.slice(0, 2).map((x) => whyWord(x.d.key, x.dev.rel, is)).join(is ? "; og " : "; and ") + ".";
      }
      // Biggest movers on the primary movement dimension among players who played both.
      const bBy = new Map(squadRowsB.map((r) => [r.player_id, r]));
      const movers = squadRows
        .map((r) => { const rb = bBy.get(r.player_id); const dev = rb ? deviation(primaryKey, r.fingerprint[primaryKey], rb.fingerprint[primaryKey]) : null; return dev && isSignificant(primaryKey, dev.abs) ? { name: r.name.split(" ")[0], rel: dev.rel } : null; })
        .filter((x): x is { name: string; rel: number } => x != null)
        .sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel))
        .slice(0, 2);
      facts = movers.map((m) => `${m.name}: ${dirWord(primaryKey, m.rel, is)} (${magWord(primaryKey, m.rel, is)})`);
      confidence = is
        ? `${fmtDate(effSquadMatch, is)}: ${squadRows.length} leikm. · ${fmtDate(squadMatchB, is)}: ${squadRowsB.length} leikm.`
        : `${fmtDate(effSquadMatch, is)}: ${squadRows.length} players · ${fmtDate(squadMatchB, is)}: ${squadRowsB.length} players`;
    } else {
      // Single-match squad snapshot (no comparison match picked). Standouts are
      // the two variant-appropriate movement dimensions.
      const top1 = [...squadRows].filter((r) => r.fingerprint[primaryKey] != null).sort((a, b) => (b.fingerprint[primaryKey] ?? 0) - (a.fingerprint[primaryKey] ?? 0))[0];
      const top2 = [...squadRows].filter((r) => r.fingerprint[secondaryKey] != null).sort((a, b) => (b.fingerprint[secondaryKey] ?? 0) - (a.fingerprint[secondaryKey] ?? 0))[0];
      const dimName = (k: string) => (is ? dimByKey(k)!.is : dimByKey(k)!.en);
      if (squadRows.length > 0) {
        verdict = is
          ? `${squadRows.length} leikmenn í leiknum ${fmtDate(effSquadMatch, is)}.`
          : `${squadRows.length} players in the ${fmtDate(effSquadMatch, is)} match.`;
        if (top1) facts.push(`${is ? "Mest" : "Most"} ${dimName(primaryKey)}: ${top1.name.split(" ")[0]} (${fmtDim(primaryKey, top1.fingerprint[primaryKey])})`);
        if (top2) facts.push(`${is ? "Hæst" : "Highest"} ${dimName(secondaryKey)}: ${top2.name.split(" ")[0]} (${fmtDim(secondaryKey, top2.fingerprint[secondaryKey])})`);
        interpretation = isGps
          ? (is ? "Í stuttu máli: berðu saman hvernig hver leikmaður hreyfði sig — hver vann mest, tók flest átök og spretti. Veldu annan leik til að bera liðið saman."
                : "In plain terms: compare how each player moved — who worked hardest, made the most efforts and sprinted most. Pick a second match to compare the squad across games.")
          : (is ? "Í stuttu máli: berðu saman hvernig hver leikmaður hreyfði sig — hver var lipurðar-/hröðunar-/hemlunar-þyngstur. Veldu annan leik til að bera liðið saman."
                : "In plain terms: compare how each player moved — who was the most agility-, acceleration- or braking-heavy. Pick a second match to compare the squad across games.");
        confidence = is ? `${squadRows.length} leikmenn með ≥20′ í þessum leik` : `${squadRows.length} players with ≥20′ in this match`;
      }
    }
  }

  // Overlay radar — the two compared fingerprints as shapes on shared axes.
  const RADAR_COLORS = ["#4f46e5", "#2b8a54"];
  const compareAxes = DIMS.map((d) => (is ? d.is : d.en));
  const compareSeries = series.map((s, i) => ({
    label: s.label,
    values: DIMS.map((d) => s.fp[d.key]),
    color: RADAR_COLORS[i] ?? "#8b8676",
  }));

  const modeBtn = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${mode === m ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );
  const selectCls = "h-8 rounded-md border border-slate-300 bg-white px-2 text-xs";

  // The two-shape comparison (radar + dimension bars) — shared by norm / ab, and
  // by squad when a comparison match is picked (then the shapes are squad means).
  const comparisonView = (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Hreyfi-form (radar)" : "Movement shape (radar)"}</div>
        <ChartZoom title={is ? "Hreyfi-form (radar)" : "Movement shape (radar)"} large={<CompareRadar axes={compareAxes} series={compareSeries} maxHeight={520} />}>
          <CompareRadar axes={compareAxes} series={compareSeries} maxHeight={260} />
        </ChartZoom>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px]">
          {compareSeries.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: s.color }} />{s.label}
            </span>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-snug text-slate-400">{is ? "Hvert ás normalíserað að stærra gildinu — sýnir form-muninn milli leikjanna." : "Each axis normalised to the larger value — shows the shape difference between the matches."}</p>
      </div>
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Eftir víddum" : "By dimension"}</div>
        <DimBars series={series} is={is} dims={DIMS} />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{isGps ? "Catapult · GPS movement" : "Catapult · IMA driver"}</div>
            <div className="text-sm font-semibold text-slate-900">{is ? "Hreyfi-samanburður (leikir)" : "Match Movement Comparison"}</div>
            {isGps && (
              <div className="mt-0.5 text-[10px] leading-snug text-amber-600">
                {is ? "GPS-hreyfing (Lite) — ekki IMA driver. Byggt á álagi, átökum og spretti." : "GPS movement (Lite) — not the IMA driver. Based on load, efforts and sprinting."}
              </div>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
            {modeBtn("norm", is ? "vs venja" : "vs norm")}
            {modeBtn("ab", is ? "Leikur A/B" : "Match A/B")}
            {modeBtn("squad", is ? "Allt liðið" : "Squad")}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(mode === "norm" || mode === "ab") && (
            <select value={effPlayerId} onChange={(e) => { setPlayerId(e.target.value); setMatchA(""); setMatchB(""); }} className={selectCls}>
              {data.players.filter((p) => p.matches >= 1).map((p) => (
                <option key={p.player_id} value={p.player_id}>{p.name}{p.position ? ` (${p.position})` : ""}</option>
              ))}
            </select>
          )}
          {mode === "norm" && (
            <select value={effMatchA} onChange={(e) => setMatchA(e.target.value)} className={selectCls}>
              {playerRows.map((r) => <option key={r.match_date} value={r.match_date}>{fmtDate(r.match_date, is)} · {r.minutes}′</option>)}
            </select>
          )}
          {mode === "ab" && (
            <>
              <select value={effMatchA} onChange={(e) => setMatchA(e.target.value)} className={selectCls}>
                {playerRows.map((r) => <option key={r.match_date} value={r.match_date}>A: {fmtDate(r.match_date, is)}</option>)}
              </select>
              <select value={effMatchB} onChange={(e) => setMatchB(e.target.value)} className={selectCls}>
                {playerRows.map((r) => <option key={r.match_date} value={r.match_date}>B: {fmtDate(r.match_date, is)}</option>)}
              </select>
            </>
          )}
          {mode === "squad" && (
            <>
              <select value={effSquadMatch} onChange={(e) => setSquadMatch(e.target.value)} className={selectCls}>
                {[...data.matchDates].reverse().map((d) => <option key={d} value={d}>{fmtDate(d, is)}</option>)}
              </select>
              <span className="text-xs text-slate-400">{is ? "vs" : "vs"}</span>
              <select value={squadMatchB} onChange={(e) => setSquadMatchB(e.target.value)} className={selectCls}>
                <option value="">{is ? "— (einn leikur)" : "— (single match)"}</option>
                {[...data.matchDates].reverse().filter((d) => d !== effSquadMatch).map((d) => <option key={d} value={d}>{fmtDate(d, is)}</option>)}
              </select>
              <button
                type="button"
                onClick={() => downloadMatchMovementPdf(data, effSquadMatch, is ? "Lið" : "Team", lang)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title={is ? "Leikhreyfing liðsins vs venjan — PDF" : "Squad match movement vs norm — PDF"}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                {is ? "Sækja PDF" : "Download PDF"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Verdict (0) → interpretation (1) → facts → confidence + provenance. */}
        {verdict ? (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-sm font-medium text-slate-800">{verdict}</p>
            {interpretation && <p className="mt-1 text-[13px] leading-snug text-slate-600">{interpretation}</p>}
            {facts.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {facts.map((f, i) => <li key={i}>· {f}</li>)}
              </ul>
            )}
            {confidence && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 border-t border-slate-200 pt-1.5 text-[11px] text-slate-400">
                <span title={is ? "Þekja gagna — hversu traust dómurinn er" : "Data coverage — how much to trust the verdict"}>
                  {is ? "Vissa" : "Confidence"}: {confidence}
                </span>
                <span className="text-slate-300">·</span>
                <span title={is ? "Deterministic útreikningur úr Catapult IMA — ekkert AI" : "Deterministic calculation from Catapult IMA — no AI"}>
                  {is ? "Reglur reikna, ekki AI" : "Rules compute — not AI"}
                </span>
              </div>
            )}
          </div>
        ) : null}

        {/* AI explanation — detailed, labelled AI, written from the re-computed
            Catapult numbers (the client sends only the selection, not figures). */}
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-900">
              <span>✨</span>{is ? "AI útskýring" : "AI explanation"}
            </div>
            {(!ai || ai.sig !== aiSig) && (
              <button
                type="button"
                onClick={genAi}
                disabled={aiBusy}
                className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {aiBusy ? (is ? "Skrifa…" : "Writing…") : (is ? "Útskýra" : "Explain")}
              </button>
            )}
          </div>
          {aiErr && <div className="mt-2 text-xs text-red-600">{aiErr}</div>}
          {ai && ai.sig === aiSig ? (
            <>
              <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-slate-700">{ai.text}</p>
              <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-indigo-700">AI</span>
                {is ? "Skrifað úr endurreiknuðum Catapult-tölum. AI útskýrir — reglur ráða." : "Written from the re-computed Catapult numbers. AI explains — rules decide."}
              </div>
            </>
          ) : !aiBusy && !aiErr ? (
            <p className="mt-1 text-xs text-indigo-700/70">
              {is ? "Fáðu ítarlega útskýringu á þessum samanburði, skrifaða úr tölunum." : "Get a detailed explanation of this comparison, written from the numbers."}
            </p>
          ) : null}
        </div>

        {/* The data is new to many coaches — tap a dimension for a plain one-liner. */}
        <div className="mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? `Hvað þýðir hvað? (${isGps ? "GPS" : "IMA"})` : `What does each mean? (${isGps ? "GPS" : "IMA"})`}</div>
          <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1.5">
            {DIMS.map((d) => {
              const active = openDef === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setOpenDef(active ? null : d.key)}
                  aria-expanded={active}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  {is ? d.is : d.en}
                  <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold ${active ? "bg-indigo-500 text-white" : "bg-slate-200 text-slate-500"}`}>i</span>
                </button>
              );
            })}
          </div>
          {openDef && (
            <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs leading-snug text-slate-700">
              <span className="font-semibold">{is ? dimByKey(openDef)!.is : dimByKey(openDef)!.en}</span>
              {" — "}
              {is ? DIM_DEFS[openDef].is : DIM_DEFS[openDef].en}
            </div>
          )}
        </div>

        {/* Breakdown */}
        {mode === "squad" ? (
          <>
            {/* Squad-vs-squad shape comparison, shown only when a second match is picked. */}
            {series.length > 0 && (
              <div className="mb-6 border-b border-slate-100 pb-6">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? "Liðið í heild — meðal-hreyfing" : "Squad overall — average movement"}</div>
                {comparisonView}
              </div>
            )}
            <div className="overflow-x-auto">
              {series.length > 0 && (
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{is ? `Leikmenn — ${fmtDate(effSquadMatch, is)}` : `Players — ${fmtDate(effSquadMatch, is)}`}</div>
              )}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-2">{is ? "Leikmaður" : "Player"}</th>
                    <th className="py-1 pr-2 text-right">{is ? "Mín" : "Min"}</th>
                    {DIMS.map((d) => <th key={d.key} className="py-1 pr-2 text-right">{is ? d.is : d.en}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {squadRows.map((r) => (
                    <tr key={r.player_id} className="border-t align-top">
                      <td className="py-1 pr-2 font-medium text-slate-800">{r.name}{r.position ? <span className="ml-1 text-slate-400">{r.position}</span> : null}{r.estimated ? <span className="ml-1 rounded-full border border-amber-300 px-1 py-0.5 text-[8px] font-semibold uppercase text-amber-600" title={is ? "Áætlað — ekki raunmæling" : "Estimated — not a pod measurement"}>{is ? "áætl." : "est."}</span> : null}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-slate-500">{r.minutes}′</td>
                      {DIMS.map((d) => <td key={d.key} className="py-1 pr-2 text-right tabular-nums text-slate-700">{fmtDim(d.key, r.fingerprint[d.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : series.length > 0 ? (
          comparisonView
        ) : (
          <div className="text-sm text-slate-400">{is ? "Veldu leik(i)." : "Pick a match / matches."}</div>
        )}

        {/* S&C drill-down — opt-in sub-band depth (kept out of the head-coach view). */}
        {subSeries.length > 0 && (
          <ShowDetails label={{ EN: "S&C breakdown — raw sub-bands", IS: "S&C sundurliðun — hrá undir-bönd" }} hint={{ EN: "decel / CoD by intensity · stride bands 6-8", IS: "decel / CoD eftir styrk · skref-bönd 6-8" }}>
            <SubBandsBreakdown series={subSeries} is={is} />
          </ShowDetails>
        )}

        <ShowDetails label={{ EN: "What the dimensions mean", IS: "Hvað víddirnar þýða" }}>
          <ul className="space-y-1 text-xs text-slate-600">
            {DIMS.map((d) => (
              <li key={d.key}><b>{is ? d.is : d.en}</b> — {is ? DIM_DEFS[d.key].is : DIM_DEFS[d.key].en}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-slate-400">
            {isGps
              ? (is ? "Normalíserað per mínútu (hæsti hraði er toppgildi). GPS-hreyfing — ekki IMA driver. Reglur reikna — ekki AI." : "Normalised per minute (top speed is a peak). GPS movement — not the IMA driver. Rules compute — not AI.")
              : (is ? "Normalíserað per mínútu. Reglur reikna — ekki AI. Buchheit 2014 (persónuleg norm), di Prampero 2015." : "Normalised per minute. Rules compute — not AI. Buchheit 2014 (personal norms), di Prampero 2015.")}
          </p>
        </ShowDetails>
      </div>
    </div>
  );
}
