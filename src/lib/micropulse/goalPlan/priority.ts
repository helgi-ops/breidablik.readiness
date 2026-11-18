/**
 * Goal plan, lota 7: "is the quality I picked the one I have most to gain in?" Pure and client-safe; rules only,
 * no AI.
 *
 * Each of the four qualities gets one number per player, compared with the players in the same position on the
 * team (the whole team when fewer than 4 share it), with the same percentile, pools and confidence as Total Player
 * Analysis (`buildAthleteProfile`). A "clear weakness" is the bottom third: the 30th percentile or lower
 * (WEAKNESS_PCTL, MicroPulse's rule, not from a study).
 *
 * A suggestion is made only when another quality is a clear weakness and the picked one is in the top half (50th
 * percentile or higher, CHOSEN_MIN_PCTL — the coach's choice on 2026-11-14 after the real-team run: Breiðablik 45% of
 * picks got a suggestion with "not in the bottom third", 35% with "top half"; HK 26 → 22%, Keflavík 23 → 15%). Never when the
 * picked one has no number or a low-confidence one, when the other quality is blocked for the player (top speed for
 * goalkeepers and in basketball), or when its read is low confidence. Two candidates → the lower percentile wins.
 * The player decides; the coach sees the same read and what the player did.
 *
 * Numbers:
 *   - Top speed: 3rd-fastest GPS day in 12 months, or a faster sprint test (the plan's own reference).
 *   - Jump: the latest CMJ on the force plates within 12 months, mean of its jumps.
 *   - Acceleration / braking: Catapult's top band (Acc / Dec band 3) per 90 min of GPS time over 12 months. A team
 *     with no band 3 at all uses the 3rd-highest day in m/s² instead. One team, one column: never mixed.
 * Goalkeepers are compared only with goalkeepers (no fallback to outfield players); outfield players never with
 * goalkeepers.
 */

import {
  MIN_POSITION_POOL,
  WEAKNESS_PCTL,
  buildAthleteProfile,
  type AthleteSignalSet,
  type Confidence,
  type MetricSample,
  type QualityId,
} from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { positionGroup } from "@/lib/micropulse/positionStyle";
import { LOOKBACK_DAYS, MIN_REF_DAYS, mergeSpeedDays, referenceTopSpeed, type SpeedRow } from "@/lib/micropulse/nearMaxExposure";
import { BAND3_MAX_PER_DAY, PEAK_MS2_MAX } from "./outcome";
import { PITCH_QUALITIES, type Bi, type GoalQuality, type PitchQuality } from "./types";

export { WEAKNESS_PCTL };
/** The picked quality must be at least this percentile for a suggestion (MicroPulse rule, the coach's choice). */
export const CHOSEN_MIN_PCTL = 50;

/** A GPS day counts toward "per 90 min" only with 20–150 min of GPS time (MicroPulse rule: drops stubs and all-day files). */
export const RATE_MIN_MINUTES = 20;
export const RATE_MAX_MINUTES = 150;
/** Fewest counted GPS days for a per-90 number. */
export const MIN_RATE_DAYS = 3;
/** A jump test older than this is not used (same as the plan). */
export const MAX_JUMP_AGE_DAYS = 365;

export type EffortMetric = "band3" | "peak";

/** One stored GPS row, reduced to what the priority read needs. */
export type PriorityGpsRow = SpeedRow & {
  /** GPS time in minutes: the stored session length, else PlayerLoad ÷ PlayerLoad per minute. */
  minutes: number | null;
  accelB3: number | null;
  decelB3: number | null;
  accelPeak: number | null;
  decelPeak: number | null;
};

export type PriorityJumpTest = { date: string; cm: number; trials: number };

export type PriorityPlayerRaw = {
  playerId: string;
  position: string | null;
  gps: PriorityGpsRow[];
  sprintTestKmh: number | null;
  /** CMJ tests, one row per test (trials already averaged). Any order. */
  jumps: PriorityJumpTest[];
};

/** The "weakest quality" read covers the four pitch goals only; the gym-only goals are suggested from DSI (2026-11-18). */
const QUALITY_TO_ID: Record<PitchQuality, QualityId> = {
  top_speed: "speed",
  acceleration: "acceleration",
  braking: "deceleration",
  jump: "reactive_power",
};

const DAY_MS = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY_MS);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Band 3 when anyone on the team has a band-3 value (0 is a real value), else the peak in m/s². */
export function teamEffortMetric(players: PriorityPlayerRaw[]): EffortMetric {
  return players.some((p) => p.gps.some((r) => fin(r.accelB3) || fin(r.decelB3))) ? "band3" : "peak";
}

function inWindow(date: string, todayIso: string): boolean {
  const d = daysBetween(date, todayIso);
  return d >= 0 && d <= LOOKBACK_DAYS;
}

/** Band-3 efforts per 90 min of GPS time. Per date the row with the most efforts (and its minutes) counts. */
export function band3Per90(rows: PriorityGpsRow[], kind: "accel" | "decel", todayIso: string): { value: number; days: number; date: string } | null {
  const byDate = new Map<string, { b3: number; mins: number }>();
  for (const r of rows) {
    const date = String(r.date ?? "").slice(0, 10);
    if (!date || !inWindow(date, todayIso)) continue;
    const b3 = kind === "accel" ? r.accelB3 : r.decelB3;
    if (!fin(b3) || b3 < 0 || b3 > BAND3_MAX_PER_DAY) continue;
    if (!fin(r.minutes) || r.minutes < RATE_MIN_MINUTES || r.minutes > RATE_MAX_MINUTES) continue;
    const cur = byDate.get(date);
    if (!cur || b3 > cur.b3) byDate.set(date, { b3, mins: r.minutes });
  }
  if (byDate.size < MIN_RATE_DAYS) return null;
  let sum = 0, mins = 0;
  for (const v of byDate.values()) { sum += v.b3; mins += v.mins; }
  if (mins <= 0) return null;
  const last = [...byDate.keys()].sort().at(-1)!;
  return { value: round1((sum / mins) * 90), days: byDate.size, date: last };
}

/** 3rd-highest day in m/s² over 12 months (needs MIN_REF_DAYS days, like top speed). */
export function peakThirdBest(rows: PriorityGpsRow[], kind: "accel" | "decel", todayIso: string): { value: number; days: number; date: string } | null {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const date = String(r.date ?? "").slice(0, 10);
    if (!date || !inWindow(date, todayIso)) continue;
    const raw = kind === "accel" ? r.accelPeak : r.decelPeak;
    if (!fin(raw)) continue;
    const v = Math.abs(raw);
    if (v <= 0 || v > PEAK_MS2_MAX) continue;
    byDate.set(date, Math.max(byDate.get(date) ?? 0, v));
  }
  if (byDate.size < MIN_REF_DAYS) return null;
  const vals = [...byDate.values()].sort((a, b) => b - a);
  return { value: round1(vals[2]), days: byDate.size, date: [...byDate.keys()].sort().at(-1)! };
}

/** One player's four numbers. Missing data → no entry (never 0). */
export function priorityValues(p: PriorityPlayerRaw, todayIso: string, metric: EffortMetric): Partial<Record<GoalQuality, MetricSample>> {
  const out: Partial<Record<GoalQuality, MetricSample>> = {};
  const speedDays = mergeSpeedDays(p.gps).filter((d) => inWindow(d.date, todayIso));
  const ref = referenceTopSpeed(speedDays, todayIso, p.sprintTestKmh);
  if (ref) {
    out.top_speed = {
      value: ref.kmh, unit: "km/h", source: ref.source === "sprint_test" ? "sprint test" : "GPS",
      date: speedDays.at(-1)?.date ?? null, sampleSize: ref.source === "sprint_test" ? Math.max(ref.days, 2) : ref.days,
    };
  }
  for (const [q, kind] of [["acceleration", "accel"], ["braking", "decel"]] as const) {
    const r = metric === "band3" ? band3Per90(p.gps, kind, todayIso) : peakThirdBest(p.gps, kind, todayIso);
    if (r) out[q] = { value: r.value, unit: metric === "band3" ? "per 90 min" : "m/s²", source: "GPS", date: r.date, sampleSize: r.days };
  }
  const jump = p.jumps
    .filter((j) => fin(j.cm) && j.cm > 0 && daysBetween(j.date, todayIso) >= 0 && daysBetween(j.date, todayIso) <= MAX_JUMP_AGE_DAYS)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (jump) out.jump = { value: round1(jump.cm), unit: "cm", source: "force plates", date: jump.date, sampleSize: jump.trials };
  return out;
}

// ── The read ────────────────────────────────────────────────────────────────

export type PriorityRead = {
  quality: GoalQuality;
  value: number | null;
  /** Percentile in the comparison group (higher = better), null without a number or a group. */
  pctl: number | null;
  benchmark: "position" | "squad" | null;
  poolSize: number;
  confidence: Confidence;
  /** Days or jumps behind the number. */
  n: number | null;
  date: string | null;
  blocked: boolean;
};

export type PriorityReason = "suggest" | "chosen_is_weak" | "chosen_below_middle" | "no_clear_weakness" | "no_data" | "blocked";

export type GoalPriority = {
  chosen: GoalQuality;
  suggested: GoalQuality | null;
  reason: PriorityReason;
  metric: EffortMetric;
  reads: PriorityRead[];
  /** Plain words for the player, only when there is a suggestion. */
  view: PriorityView | null;
};

export type PriorityView = {
  verdict: Bi;
  sub: Bi;
  facts: Bi[];
  details: Bi[];
  switchLabel: Bi;
  keepLabel: Bi;
};

export type PriorityTeam = {
  sport: string | null;
  metric: EffortMetric;
  players: Array<{ playerId: string; position: string | null; values: Partial<Record<GoalQuality, MetricSample>> }>;
};

const isGk = (pos: string | null, sport: string | null) => !!pos && positionGroup(pos, sport) === "GK";

/** The player's four reads against their comparison group. null when the player is not in the team list. */
export function priorityReads(team: PriorityTeam, playerId: string, blocked: Partial<Record<GoalQuality, boolean>> = {}): PriorityRead[] | null {
  const me = team.players.find((p) => p.playerId === playerId);
  if (!me) return null;
  const gk = isGk(me.position, team.sport);
  // Goalkeepers only against goalkeepers, outfield only against outfield.
  const pool = team.players.filter((p) => isGk(p.position, team.sport) === gk);
  const toSignals = (v: Partial<Record<GoalQuality, MetricSample>>): AthleteSignalSet => {
    const s: AthleteSignalSet = {};
    for (const q of PITCH_QUALITIES) if (v[q]) s[QUALITY_TO_ID[q]] = v[q];
    return s;
  };
  const profile = buildAthleteProfile(
    { sport: team.sport, players: pool.map((p) => ({ playerId: p.playerId, position: p.position, signals: toSignals(p.values) })) },
    playerId,
  );
  if (!profile) return null;
  return PITCH_QUALITIES.map((quality): PriorityRead => {
    const r = profile.qualities.find((x) => x.id === QUALITY_TO_ID[quality])!;
    // A squad read with fewer than 4 players is no group at all.
    const thin = r.poolSize < MIN_POSITION_POOL;
    return {
      quality,
      value: r.value,
      pctl: r.value == null || thin ? null : r.positionPercentile,
      benchmark: r.value == null || thin ? null : r.benchmark,
      poolSize: r.poolSize,
      confidence: thin ? "low" : r.confidence,
      n: r.sampleSize,
      date: r.date,
      blocked: !!blocked[quality],
    };
  });
}

const weak = (r: PriorityRead) => r.pctl != null && r.pctl <= WEAKNESS_PCTL;
const usable = (r: PriorityRead) => r.value != null && r.pctl != null && r.confidence !== "low" && !r.blocked;

/** The rule. */
export function goalPriority(reads: PriorityRead[], chosen: GoalQuality, metric: EffortMetric): GoalPriority {
  const base = { chosen, metric, reads };
  const mine = reads.find((r) => r.quality === chosen);
  if (!mine || mine.blocked) return { ...base, suggested: null, reason: "blocked", view: null };
  if (!usable(mine)) return { ...base, suggested: null, reason: "no_data", view: null };
  if (weak(mine)) return { ...base, suggested: null, reason: "chosen_is_weak", view: null };
  if (mine.pctl! < CHOSEN_MIN_PCTL) return { ...base, suggested: null, reason: "chosen_below_middle", view: null };
  const cands = reads
    .filter((r) => r.quality !== chosen && usable(r) && weak(r))
    .sort((a, b) => (a.pctl! - b.pctl!) || (PITCH_QUALITIES as GoalQuality[]).indexOf(a.quality) - (PITCH_QUALITIES as GoalQuality[]).indexOf(b.quality));
  const s = cands[0];
  if (!s) return { ...base, suggested: null, reason: "no_clear_weakness", view: null };
  return { ...base, suggested: s.quality, reason: "suggest", view: priorityView(s, mine, metric) };
}

// ── Words ───────────────────────────────────────────────────────────────────

/** English quality in running text. */
const Q_EN: Record<GoalQuality, string> = { top_speed: "top speed", acceleration: "acceleration", braking: "braking", jump: "vertical jump", max_strength: "maximal strength", explosive: "explosive power", strength_power: "strength + power" };
/** Icelandic accusative ("benda á …", "skipta í …", "valdi …"). */
const Q_ACC: Record<GoalQuality, string> = { top_speed: "hámarkshraða", acceleration: "hröðun", braking: "bremsun", jump: "lóðrétt stökk", max_strength: "hámarksstyrk", explosive: "sprengikraft", strength_power: "styrk og sprengikraft" };
/** Icelandic dative ("halda …", "í …", "stakk upp á …"). */
export const Q_DAT: Record<GoalQuality, string> = { top_speed: "hámarkshraða", acceleration: "hröðun", braking: "bremsun", jump: "lóðréttu stökki", max_strength: "hámarksstyrk", explosive: "sprengikrafti", strength_power: "styrk og sprengikrafti" };

const MEASURE: Record<GoalQuality, Record<EffortMetric, Bi>> = {
  top_speed: { band3: { en: "Top speed", is: "Hámarkshraði" }, peak: { en: "Top speed", is: "Hámarkshraði" } },
  acceleration: { band3: { en: "Hard accelerations", is: "Harðar hraðaaukningar" }, peak: { en: "Hardest acceleration", is: "Mesta hröðun" } },
  braking: { band3: { en: "Hard braking", is: "Harðar bremsanir" }, peak: { en: "Hardest braking", is: "Harðasta bremsun" } },
  jump: { band3: { en: "Jump height", is: "Stökkhæð" }, peak: { en: "Jump height", is: "Stökkhæð" } },
  // Not read by the weakest-quality rule (pitch goals only); here so every goal has a name.
  max_strength: { band3: { en: "Strength test", is: "Styrkpróf" }, peak: { en: "Strength test", is: "Styrkpróf" } },
  explosive: { band3: { en: "Jump height", is: "Stökkhæð" }, peak: { en: "Jump height", is: "Stökkhæð" } },
  strength_power: { band3: { en: "Strength and jump tests", is: "Styrk- og stökkpróf" }, peak: { en: "Strength and jump tests", is: "Styrk- og stökkpróf" } },
};

export function measureName(q: GoalQuality, metric: EffortMetric): Bi {
  return MEASURE[q][metric];
}

const num = (v: number, is: boolean) => (is ? v.toFixed(1).replace(".", ",") : v.toFixed(1));

/** "32.1 km/h" / "2,1 á 90 mín". */
export function formatValue(q: GoalQuality, metric: EffortMetric, v: number): Bi {
  if (q === "top_speed") return { en: `${num(v, false)} km/h`, is: `${num(v, true)} km/klst` };
  if (q === "jump") return { en: `${num(v, false)} cm`, is: `${num(v, true)} cm` };
  return metric === "band3"
    ? { en: `${num(v, false)} per 90 min`, is: `${num(v, true)} á 90 mín` }
    : { en: `${num(v, false)} m/s²`, is: `${num(v, true)} m/s²` };
}

/** 1st, 2nd, 3rd, 11th, 21st … */
export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th"}`;
}

const oneIs = (n: number) => n % 10 === 1 && n % 100 !== 11;
/** "the 12 other players" / "12 aðra leikmenn" (accusative; 21 → "21 annan leikmann"). The player is not counted. */
const otherPlayers = (n: number): Bi => ({
  en: `the ${n} other player${n === 1 ? "" : "s"}`,
  is: oneIs(n) ? `${n} annan leikmann` : `${n} aðra leikmenn`,
});
/** "of 13 players" / "af 13 leikmönnum" (dative; 21 → "21 leikmanni"). The whole group, the player included. */
const ofPlayers = (n: number): Bi => ({
  en: `of ${n} player${n === 1 ? "" : "s"}`,
  is: `af ${n} ${oneIs(n) ? "leikmanni" : "leikmönnum"}`,
});

function howCounted(q: GoalQuality, metric: EffortMetric, r: PriorityRead): Bi {
  const n = r.n ?? 0;
  if (q === "top_speed") {
    return { en: "Top speed: your 3rd-fastest GPS day in the last 12 months (or a faster sprint test).", is: "Hámarkshraði: 3. hraðasti GPS-dagurinn þinn síðustu 12 mánuði (eða hraðara sprettpróf)." };
  }
  if (q === "jump") {
    return { en: `Jump height: your latest jump test on the force plates${r.date ? ` (${r.date})` : ""}, mean of the jumps.`, is: `Stökkhæð: nýjasta stökkprófið þitt á kraftplötunum${r.date ? ` (${r.date})` : ""}, meðaltal stökkanna.` };
  }
  const acc = q === "acceleration";
  if (metric === "band3") {
    return acc
      ? { en: `Hard accelerations: Catapult's top band (Acc band 3) per 90 minutes of GPS time, last 12 months, from ${n} days. A count of how often, not how hard.`,
          is: `Harðar hraðaaukningar: efsta þrep Catapult (Acc band 3) á hverjar 90 mín af GPS-tíma síðustu 12 mánuði, úr ${n} dögum. Talning á hve oft, ekki hve fast.` }
      : { en: `Hard braking: Catapult's top band (Dec band 3) per 90 minutes of GPS time, last 12 months, from ${n} days. A count of how often, not how hard.`,
          is: `Harðar bremsanir: efsta þrep Catapult (Dec band 3) á hverjar 90 mín af GPS-tíma síðustu 12 mánuði, úr ${n} dögum. Talning á hve oft, ekki hve fast.` };
  }
  return acc
    ? { en: "Hardest acceleration: your 3rd-highest GPS day in m/s², last 12 months.", is: "Mesta hröðun: 3. hæsti GPS-dagurinn þinn í m/s² síðustu 12 mánuði." }
    : { en: "Hardest braking: your 3rd-highest GPS day in m/s², last 12 months.", is: "Harðasta bremsun: 3. hæsti GPS-dagurinn þinn í m/s² síðustu 12 mánuði." };
}

export const PRIORITY_RULE: Bi = {
  en: "Rules decide, not AI. A suggestion shows only when another quality is in the bottom third (30th percentile or lower) of your comparison group and the one you picked is in the top half (50th or higher). Both marks are MicroPulse's rules (the 30th is the same as in the coach's player analysis), not from a study.",
  is: "Reglur ráða, ekki gervigreind. Tillaga birtist aðeins þegar annar þáttur er í neðsta þriðjungi (30. hundraðsmark eða neðar) samanburðarhópsins og sá sem þú valdir er í efri helmingnum (50. eða ofar). Bæði mörkin eru reglur MicroPulse (30. markið er það sama og í leikmannagreiningu þjálfarans), ekki úr rannsókn.",
};

function priorityView(s: PriorityRead, c: PriorityRead, metric: EffortMetric): PriorityView {
  const sName = measureName(s.quality, metric), cName = measureName(c.quality, metric);
  const sVal = formatValue(s.quality, metric, s.value!), cVal = formatValue(c.quality, metric, c.value!);
  const position = s.benchmark === "position";
  const group: Bi = position ? { en: "players in your position", is: "leikmanna í þinni stöðu" } : { en: "players on your team", is: "leikmanna liðsins" };
  const pool = otherPlayers(Math.max(0, s.poolSize - 1));
  return {
    verdict: { en: `Your data points more to ${Q_EN[s.quality]}.`, is: `Gögnin þín benda frekar á ${Q_ACC[s.quality]}.` },
    sub: { en: "You decide: switch, or keep your pick. Your coach sees this suggestion and your choice.", is: "Þú ræður: skiptu eða haltu þínu vali. Þjálfarinn sér tillöguna og val þitt." },
    facts: [
      { en: `${sName.en}: ${sVal.en}, in the bottom third of ${group.en}.`, is: `${sName.is}: ${sVal.is}, í neðsta þriðjungi ${group.is}.` },
      { en: `${cName.en}: ${cVal.en}, in the top half.`, is: `${cName.is}: ${cVal.is}, í efri helmingnum.` },
    ],
    details: [
      howCounted(s.quality, metric, s),
      howCounted(c.quality, metric, c),
      position
        ? { en: `Compared with ${pool.en} in your position on the team: ${Q_EN[s.quality]} at the ${ordinal(s.pctl!)} percentile, ${Q_EN[c.quality]} at the ${ordinal(c.pctl!)}.`,
            is: `Borið saman við ${pool.is} í þinni stöðu í liðinu: ${Q_ACC[s.quality]} á ${s.pctl}. hundraðsmarki, ${Q_ACC[c.quality]} á ${c.pctl}.` }
        : { en: `Compared with ${pool.en} on the team (fewer than 4 share your position): ${Q_EN[s.quality]} at the ${ordinal(s.pctl!)} percentile, ${Q_EN[c.quality]} at the ${ordinal(c.pctl!)}.`,
            is: `Borið saman við ${pool.is} í liðinu (færri en 4 eru í þinni stöðu): ${Q_ACC[s.quality]} á ${s.pctl}. hundraðsmarki, ${Q_ACC[c.quality]} á ${c.pctl}.` },
      { en: `The suggestion goes away once you are out of the bottom third in ${Q_EN[s.quality]}, or if you drop below the middle in ${Q_EN[c.quality]}.`,
        is: `Tillagan hverfur þegar þú ert ekki lengur í neðsta þriðjungi í ${Q_DAT[s.quality]}, eða ef þú ferð niður fyrir miðju í ${Q_DAT[c.quality]}.` },
      PRIORITY_RULE,
    ],
    switchLabel: { en: `Switch to ${Q_EN[s.quality]}`, is: `Skipta í ${Q_ACC[s.quality]}` },
    keepLabel: { en: `Keep ${Q_EN[c.quality]}`, is: `Halda ${Q_DAT[c.quality]}` },
  };
}

// ── What the coach sees (stored with the request) ──────────────────────────

export type GoalPrioritySnapshot = {
  v: 1;
  firstPick: GoalQuality;
  suggested: GoalQuality;
  outcome: "switched" | "kept";
  metric: EffortMetric;
  reads: Array<Pick<PriorityRead, "quality" | "value" | "pctl" | "benchmark" | "poolSize">>;
};

/**
 * The snapshot stored on the "requested" event. `switchedFrom` is the quality the player had picked when they
 * pressed "Switch"; it counts only when that pick's suggestion was the quality sent. Otherwise a suggestion for the
 * sent quality means the player kept it. null when there was nothing to suggest.
 */
export function prioritySnapshot(
  reads: PriorityRead[] | null,
  metric: EffortMetric,
  sent: GoalQuality,
  switchedFrom: GoalQuality | null,
): GoalPrioritySnapshot | null {
  if (!reads) return null;
  const slim = reads.map(({ quality, value, pctl, benchmark, poolSize }) => ({ quality, value, pctl, benchmark, poolSize }));
  if (switchedFrom && switchedFrom !== sent) {
    const first = goalPriority(reads, switchedFrom, metric);
    if (first.suggested === sent) return { v: 1, firstPick: switchedFrom, suggested: sent, outcome: "switched", metric, reads: slim };
  }
  const now = goalPriority(reads, sent, metric);
  if (now.suggested) return { v: 1, firstPick: sent, suggested: now.suggested, outcome: "kept", metric, reads: slim };
  return null;
}

export function isPrioritySnapshot(v: unknown): v is GoalPrioritySnapshot {
  const s = v as GoalPrioritySnapshot | null;
  const pitch = PITCH_QUALITIES as GoalQuality[];
  return !!s && s.v === 1 && pitch.includes(s.firstPick) && pitch.includes(s.suggested)
    && (s.outcome === "switched" || s.outcome === "kept") && Array.isArray(s.reads);
}

/** One line for the coach's review, plus the four numbers behind "Show details". */
export function coachPriorityText(s: GoalPrioritySnapshot): { line: Bi; details: Bi[] } {
  const get = (q: GoalQuality) => s.reads.find((r) => r.quality === q);
  const sr = get(s.suggested), cr = get(s.firstPick);
  const pIs = (r: typeof sr) => (r?.pctl != null ? `${r.pctl}.` : "–");
  const pEn = (r: typeof sr) => (r?.pctl != null ? ordinal(r.pctl) : "–");
  const where: Bi = sr?.benchmark === "position" ? { en: "in position", is: "í stöðu" } : { en: "in the team", is: "í liðinu" };
  const head: Bi = {
    en: `MicroPulse suggested ${Q_EN[s.suggested]} (${pEn(sr)} percentile ${where.en}).`,
    is: `MicroPulse stakk upp á ${Q_DAT[s.suggested]} (${pIs(sr)} hundraðsmark ${where.is}).`,
  };
  const tail: Bi = s.outcome === "switched"
    ? { en: `The player first picked ${Q_EN[s.firstPick]} (${pEn(cr)}) and switched.`, is: `Leikmaðurinn valdi fyrst ${Q_ACC[s.firstPick]} (${pIs(cr)}) og skipti.` }
    : { en: `The player kept ${Q_EN[s.firstPick]} (${pEn(cr)}).`, is: `Leikmaðurinn hélt ${Q_DAT[s.firstPick]} (${pIs(cr)}).` };
  const details: Bi[] = s.reads.map((r) => {
    const name = measureName(r.quality, s.metric);
    if (r.value == null) return { en: `${name.en}: no number`, is: `${name.is}: engin tala` };
    const val = formatValue(r.quality, s.metric, r.value);
    if (r.pctl == null) return { en: `${name.en}: ${val.en} · no comparison group`, is: `${name.is}: ${val.is} · enginn samanburðarhópur` };
    const pool = ofPlayers(r.poolSize);
    const grp: Bi = r.benchmark === "position" ? { en: "in position", is: "í stöðu" } : { en: "on the team", is: "í liðinu" };
    return { en: `${name.en}: ${val.en} · ${ordinal(r.pctl)} percentile ${pool.en} ${grp.en}`, is: `${name.is}: ${val.is} · ${r.pctl}. hundraðsmark ${pool.is} ${grp.is}` };
  });
  details.push({
    en: "Rules, not AI: suggested quality in the bottom third (30th percentile or lower), the pick in the top half (50th or higher), against the same position on the team (whole team when fewer than 4), goalkeepers only against goalkeepers. Acceleration and braking are Catapult's top band per 90 min of GPS time (or the 3rd-highest day in m/s² for teams without it). Stored when the player sent the request.",
    is: "Reglur, ekki gervigreind: tillagan í neðsta þriðjungi (30. hundraðsmark eða neðar), valið í efri helmingnum (50. eða ofar), borið saman við sömu stöðu í liðinu (allt liðið ef færri en 4), markmenn aðeins á móti markmönnum. Hröðun og bremsun eru efsta þrep Catapult á 90 mín af GPS-tíma (eða 3. hæsti dagur í m/s² hjá liðum án þess). Vistað þegar leikmaðurinn sendi beiðnina.",
  });
  return { line: { en: `${head.en} ${tail.en}`, is: `${head.is} ${tail.is}` }, details };
}
