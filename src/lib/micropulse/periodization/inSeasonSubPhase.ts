/**
 * In-season strength SUB-PHASE — a fixture-density read of the competitive season.
 * Pure, side-effect free.
 *
 * The macro already cycles Transmutation ↔ Realization; this reads each WEEK's fixture
 * context (congestion, gaps, declared breaks, run-in) and names the strength INTENT for
 * that week, so the competitive season is never a flat "maintenance" line. Four sub-phases:
 *
 *   re_strength          a fixture gap / declared break → a window to re-DEVELOP strength
 *                        (a mini re-accumulation), not just maintain.
 *   maintain_potentiate  a congested week (2+ games, or a ≤3-day turnaround) → hold +
 *                        potentiate, zero accumulated fatigue, readiness first.
 *   sharpen              a normal one-match week → express the block's quality, microdosed
 *                        (strength-power on MD-4/MD-3, speed-strength nearer MD).
 *   taper                the season run-in → freshness first, peak for the decisive matches.
 *
 * "Key match" importance is not modelled on fixtures (only competition / home-away), so
 * taper is triggered by the season run-in (the last `runInWeeks`) as a defensible proxy;
 * a per-match importance flag could refine it later.
 *
 * Descriptive planning aid — it never touches the readiness colour.
 * Cite: Issurin 2010 (block periodization, residual effects); Rønnestad 2011 (in-season
 * strength maintenance preserves sprint/jump); Suchomel 2016 (strength-power transfer);
 * Mujika 2003 (tapering).
 */

import type { Bi } from "./index";

export type InSeasonSubPhaseKey = "re_strength" | "maintain_potentiate" | "sharpen" | "taper";

export type InSeasonSubPhase = {
  key: InSeasonSubPhaseKey;
  label: Bi;
  short: Bi;
  rationale: Bi;
  /** What the sub-phase means for that week's strength dose. */
  dose: Bi;
  cite: string;
};

export const SUBPHASE_KEYS: InSeasonSubPhaseKey[] = ["re_strength", "sharpen", "maintain_potentiate", "taper"];

/**
 * The WEEK's strength-dose multiplier per sub-phase — applied at delivery to the MAIN strength volume
 * (compound/accessory/unilateral) ON TOP of the meso block tilt and the readiness reduction already in
 * the dose. Output/power and injury-prevention work is never scaled. `sharpen` = 1 (the block's default
 * microdose). re_strength loads a little more (a gap/break = room to re-develop); maintain_potentiate
 * collapses to a potentiation dose (congested week); taper cuts volume while intensity (%1RM) is untouched.
 */
export const SUBPHASE_DOSE_SCALE: Record<InSeasonSubPhaseKey, number> = {
  re_strength: 1.25,
  sharpen: 1,
  maintain_potentiate: 0.5,
  taper: 0.6,
};

type BreakRange = { start_date: string; end_date: string };

const DAY = 86_400_000;
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * DAY).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

/** Monday (ISO) of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

const META: Record<InSeasonSubPhaseKey, Omit<InSeasonSubPhase, "key">> = {
  re_strength: {
    label: { en: "Re-strength", is: "Endur-styrkur" },
    short: { en: "Re-strength", is: "Endur-styrkur" },
    rationale: { en: "Fixture gap / break — room to re-develop strength, not just maintain.", is: "Leikjaglugg / hlé — svigrúm til að endurþróa styrk, ekki bara halda." },
    dose: { en: "Mini re-accumulation: ~2 strength sessions at a higher dose, still submaximal fatigue.", is: "Lítil endur-uppsöfnun: ~2 styrktaræfingar með hærri skammti, enn undir hámarks-þreytu." },
    cite: "Issurin 2010; Rønnestad 2011",
  },
  maintain_potentiate: {
    label: { en: "Maintain + potentiate", is: "Viðhald + potentiation" },
    short: { en: "Maintain", is: "Viðhald" },
    rationale: { en: "Congested week (2+ games / short turnaround) — protect freshness.", is: "Þétt vika (2+ leikir / stutt á milli) — vernda ferskleika." },
    dose: { en: "Potentiation only: 1 explosive quality set, no accumulated fatigue; readiness first.", is: "Aðeins potentiation: 1 sprengi-gæðasett, engin uppsöfnuð þreyta; viðbragð fyrst." },
    cite: "Rønnestad 2011; González-Badillo & Sánchez-Medina 2010",
  },
  sharpen: {
    label: { en: "Sharpen", is: "Sérhæfa" },
    short: { en: "Sharpen", is: "Sérhæfa" },
    rationale: { en: "Normal one-match week — express the block's quality, microdosed.", is: "Venjuleg eins-leiks vika — tjáðu gæði blokkarinnar, örskammtað." },
    dose: { en: "Strength-power on MD-4/MD-3, speed-strength nearer MD; low volume.", is: "Strength-power á MD-4/MD-3, speed-strength nær MD; lágt rúmmál." },
    cite: "Suchomel 2016; Issurin 2010",
  },
  taper: {
    label: { en: "Taper (run-in)", is: "Niðurtröppun (lokasprettur)" },
    short: { en: "Taper", is: "Niðurtröppun" },
    rationale: { en: "Season run-in — freshness first; peak for the decisive matches.", is: "Lokasprettur tímabils — ferskleiki fyrst; toppa fyrir úrslitaleikina." },
    dose: { en: "Keep neural intensity, cut volume; potentiation primers only, no accumulation.", is: "Haltu taugaálagi, skerðu rúmmál; aðeins potentiation-primers, engin uppsöfnun." },
    cite: "Mujika 2003; Issurin 2010",
  },
};

/** Full descriptor for a sub-phase key (labels + rationale + dose + cite). */
export function subPhaseInfo(key: InSeasonSubPhaseKey): InSeasonSubPhase {
  return { key, ...META[key] };
}

/**
 * Classify ONE competitive week by its fixture context. `weekStart` is any day in the
 * week (snapped to Monday internally); fixtures/breaks are plain ISO date strings.
 */
export function classifyInSeasonSubPhase(input: {
  weekStart: string;
  fixtures: string[];
  breaks?: BreakRange[];
  competitiveEnd?: string | null;
  /** Weeks before season end that count as the run-in (taper). Default 3. */
  runInWeeks?: number;
  /** A ≤N-day gap to the next game marks a single-game week congested too. Default 3. */
  congestedTurnaroundDays?: number;
}): InSeasonSubPhase {
  const mon = mondayOf(input.weekStart);
  const sun = addDays(mon, 6);
  const fx = input.fixtures.filter(Boolean).slice().sort();
  const matches = fx.filter((d) => d >= mon && d <= sun).length;
  const onBreak = (input.breaks ?? []).some((b) => b.start_date <= sun && b.end_date >= mon);

  const nextFx = fx.find((d) => d > sun) ?? null;
  const prevFx = fx.filter((d) => d < mon).pop() ?? null;
  const gapAfter = nextFx ? diffDays(sun, nextFx) : null;
  const turnaround = input.congestedTurnaroundDays ?? 3;

  // 1) Congestion dominates: 2+ games this week, or a single game with a ≤3-day turnaround.
  if (matches >= 2 || (matches >= 1 && gapAfter != null && gapAfter <= turnaround)) return subPhaseInfo("maintain_potentiate");

  // 2) No match this week → a gap. A declared break, or a ≥12-day inter-fixture gap (room to
  //    re-load and recover), is a re-strength window; a short blank lead-in stays a sharpen week.
  if (matches === 0) {
    const interGap = prevFx && nextFx ? diffDays(prevFx, nextFx) : null;
    if (onBreak) return subPhaseInfo("re_strength");
    if (interGap != null && interGap >= 12) return subPhaseInfo("re_strength");
    if (prevFx && nextFx == null && diffDays(prevFx, mon) >= 7) return subPhaseInfo("re_strength"); // open tail after the last match
    if (prevFx == null && nextFx == null) return subPhaseInfo("re_strength"); // no fixtures at all
    return subPhaseInfo("sharpen");
  }

  // 3) Exactly one match, not congested. Season run-in → taper; otherwise sharpen.
  const runInWeeks = input.runInWeeks ?? 3;
  if (input.competitiveEnd && mon <= input.competitiveEnd && diffDays(mon, input.competitiveEnd) <= runInWeeks * 7) return subPhaseInfo("taper");
  return subPhaseInfo("sharpen");
}

export type SubPhaseWeek = { weekStart: string; sub: InSeasonSubPhase; matches: number; isNow: boolean };

/** One classified entry per competitive week (Monday-aligned) — for the macro sub-phase lane. */
export function inSeasonSubPhaseWeeks(input: {
  competitiveStart: string;
  competitiveEnd: string;
  fixtures: string[];
  breaks?: BreakRange[];
  today?: string;
  runInWeeks?: number;
}): SubPhaseWeek[] {
  const nowMon = mondayOf(input.today ?? new Date().toISOString().slice(0, 10));
  const out: SubPhaseWeek[] = [];
  for (let w = mondayOf(input.competitiveStart); w <= input.competitiveEnd; w = addDays(w, 7)) {
    const sun = addDays(w, 6);
    out.push({
      weekStart: w,
      sub: classifyInSeasonSubPhase({ weekStart: w, fixtures: input.fixtures, breaks: input.breaks, competitiveEnd: input.competitiveEnd, runInWeeks: input.runInWeeks }),
      matches: input.fixtures.filter((d) => d >= w && d <= sun).length,
      isNow: w === nowMon,
    });
    if (out.length > 90) break; // guard against a malformed span
  }
  return out;
}
