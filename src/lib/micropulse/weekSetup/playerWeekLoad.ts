/**
 * Per-player planned load for the Week plan PDF: every variable, per training day and for the week, with
 * the week's matches counted. Pure, deterministic, IO-free. Descriptive planning, never the readiness colour.
 *
 * Training day:
 *   - Player Load, distance, HSR, sprint, Acc/Dec B2-3: the player's recent training baseline × the day's
 *     planned-load ratio (the week's MD-day taper). With no recent training, the player's match value × the
 *     day's share of a match, never a full match on every training day.
 *   - IMA accelerations, decelerations, CoD, Free Running, Stride: the player's own match value × targetShare,
 *     the exact target "Did we do enough?" judges afterwards, so plan and review print the same number.
 *     Without a match value, an MD context or an IMA feed these fall back to baseline × ratio.
 * Match: own match value × how much of it the player usually plays × the week's match count.
 * Week: training + matches.
 *
 * Stevens 2017 + Martín-García 2018 (Acc/Dec/CoD by day-type); Buchheit 2024 (MD-day shares).
 */

import { STARTER_MINUTES, TOPUP_MATCH_PCT, targetShare, type EnoughDayType, type EnoughVar } from "@/lib/micropulse/sessionEnough";

export const PLAYER_WEEK_VARS = ["pl", "distance", "hsr", "sprint", "accel", "decel", "cod", "fr", "stride", "accHi", "decHi"] as const;
export type PlayerWeekVar = (typeof PLAYER_WEEK_VARS)[number];
export type PlayerWeekValues = Record<PlayerWeekVar, number | null>;

export const PLAYER_WEEK_VAR_LABEL: Record<PlayerWeekVar, { short: { en: string; is: string }; plain: { en: string; is: string } }> = {
  pl: { short: { en: "PL", is: "PL" }, plain: { en: "Player Load", is: "Player Load" } },
  distance: { short: { en: "Dist km", is: "Vegal. km" }, plain: { en: "total distance", is: "heildarvegalengd" } },
  hsr: { short: { en: "HSR m", is: "HSR m" }, plain: { en: "high-speed running", is: "háhraðahlaup" } },
  sprint: { short: { en: "Spr m", is: "Spr m" }, plain: { en: "sprint distance", is: "sprettvegalengd" } },
  accel: { short: { en: "Acc", is: "Hröð." }, plain: { en: "accelerations", is: "hraðaaukningar" } },
  decel: { short: { en: "Dec", is: "Heml." }, plain: { en: "braking actions", is: "hemlanir" } },
  cod: { short: { en: "CoD", is: "Stefnubr." }, plain: { en: "changes of direction", is: "stefnubreytingar" } },
  fr: { short: { en: "FR m", is: "FR m" }, plain: { en: "fast running, IMA Free Running bands 5-8", is: "hraðhlaup, IMA Free Running bönd 5-8" } },
  stride: { short: { en: "Stride", is: "Skref" }, plain: { en: "fast strides, IMA bands 6-8", is: "hröð skref, IMA bönd 6-8" } },
  accHi: { short: { en: "Acc B2-3", is: "Hröð. B2-3" }, plain: { en: "hard accelerations, bands 2-3", is: "kröftugar hraðaaukningar, bönd 2-3" } },
  decHi: { short: { en: "Dec B2-3", is: "Heml. B2-3" }, plain: { en: "hard braking, bands 2-3", is: "kröftugar hemlanir, bönd 2-3" } },
};

/** The IMA variables that share a target with the post-training card. */
const CARD_VAR: Partial<Record<PlayerWeekVar, EnoughVar>> = { accel: "imaAccel", decel: "imaDecel", cod: "imaCod", fr: "frDistance", stride: "strideHi" };

export type PlayerWeekInput = {
  name: string;
  position: string | null;
  /** Mean minutes over recent matches, including short appearances (recentMinutesAvg). */
  usualMinutes: number | null;
  /** Minutes behind the match values (the near-full-match median). */
  matchMinutes: number | null;
  baseline: Partial<PlayerWeekValues> | null;
  match: Partial<PlayerWeekValues> | null;
};

export type PlayerWeekDay = {
  /** Planned load relative to the week's mean. 0 = a rest day. */
  ratio: number;
  /** planSessionLoad's share of a match; null when the day has no MD context. */
  matchPct: number | null;
  dayType: EnoughDayType | null;
};

export type PlayerWeekRole = "starter" | "rotation" | "low" | null;
export type PlayerWeekRow = {
  name: string;
  position: string | null;
  role: PlayerWeekRole;
  usualMinutes: number | null;
  perDay: PlayerWeekValues[];
  training: PlayerWeekValues;
  /** Expected from ONE match at the player's usual minutes. All null when usual minutes are unknown. */
  perMatch: PlayerWeekValues;
  /** perMatch × the week's match count. */
  matches: PlayerWeekValues;
  week: PlayerWeekValues;
};
export type PlayerWeekLoad = {
  matchCount: number;
  /** Variables with a value for at least one player, in display order. Others self-hide. */
  vars: PlayerWeekVar[];
  /** Sorted by the week's Player Load, highest first. */
  players: PlayerWeekRow[];
};

const empty = (): PlayerWeekValues => Object.fromEntries(PLAYER_WEEK_VARS.map((k) => [k, null])) as PlayerWeekValues;
const sumOrNull = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export function roleOfMinutes(min: number | null): PlayerWeekRole {
  if (min == null) return null;
  return min >= STARTER_MINUTES ? "starter" : min >= 30 ? "rotation" : "low";
}

/** The share of a match this player should deliver on this day, or null when the day has no MD context. */
function dayTarget(key: EnoughVar, day: PlayerWeekDay, usualMinutes: number | null): number | null {
  if (day.matchPct == null) return null;
  if (day.dayType === "topup") {
    // Same split as the card: a usual starter is on the MD-day recovery level, the rest are topped up.
    return (usualMinutes ?? 0) >= STARTER_MINUTES
      ? targetShare(key, day.matchPct, null).share
      : targetShare(key, Math.max(day.matchPct, TOPUP_MATCH_PCT), "topup").share;
  }
  return targetShare(key, day.matchPct, day.dayType).share;
}

function buildRow(p: PlayerWeekInput, days: PlayerWeekDay[], matchCount: number): PlayerWeekRow {
  // Recent training × the day's ratio; with no recent training, the match value × the day's share of a match.
  const fromBase = (k: PlayerWeekVar, day: PlayerWeekDay): number | null => {
    const b = p.baseline?.[k] ?? null;
    if (b != null) return b * day.ratio;
    const m = p.match?.[k] ?? null;
    if (m == null || day.matchPct == null) return null;
    return day.ratio > 0 ? (m * day.matchPct) / 100 : 0;
  };
  const hasImaFeed = p.match?.cod != null || p.match?.fr != null || p.match?.stride != null;
  const perDay = days.map((day) => {
    const out = empty();
    for (const k of PLAYER_WEEK_VARS) {
      const card = CARD_VAR[k];
      const matchValue = p.match?.[k] ?? null;
      // A match value of 0 means the feed had no such data, same as the card treats it.
      const share = card && hasImaFeed && (matchValue ?? 0) > 0 && day.ratio > 0 ? dayTarget(card, day, p.usualMinutes) : null;
      const b = share != null ? (matchValue as number) * share : fromBase(k, day);
      out[k] = b == null ? null : Math.round(b);
    }
    return out;
  });

  // Never above a full match: the match values already come from near-full matches.
  const minutesFactor = p.usualMinutes == null || !p.matchMinutes ? null : Math.min(1, p.usualMinutes / p.matchMinutes);
  const training = empty(), perMatch = empty(), matches = empty(), week = empty();
  for (const k of PLAYER_WEEK_VARS) {
    training[k] = sumOrNull(perDay.map((d) => d[k]));
    const mv = p.match?.[k] ?? null;
    perMatch[k] = mv == null || minutesFactor == null ? null : Math.round(mv * minutesFactor);
    matches[k] = perMatch[k] == null ? null : (perMatch[k] as number) * matchCount;
    week[k] = sumOrNull([training[k], matches[k]]);
  }
  return { name: p.name, position: p.position, role: roleOfMinutes(p.usualMinutes), usualMinutes: p.usualMinutes, perDay, training, perMatch, matches, week };
}

export function buildPlayerWeekLoad(input: { players: PlayerWeekInput[]; days: PlayerWeekDay[]; matchCount: number }): PlayerWeekLoad {
  const matchCount = Math.max(0, input.matchCount);
  const players = input.players
    .map((p) => buildRow(p, input.days, matchCount))
    .filter((r) => PLAYER_WEEK_VARS.some((k) => r.week[k] != null))
    .sort((a, b) => (b.week.pl ?? -1) - (a.week.pl ?? -1));
  const vars = PLAYER_WEEK_VARS.filter((k) => players.some((r) => r.week[k] != null));
  return { matchCount, vars, players };
}

/** One plain line on what a day's numbers mean, for the PDF's per-day tables. */
export function dayTargetNote(day: PlayerWeekDay, hasIma = true): { en: string; is: string } {
  if (!hasIma) return { en: "Each player's recent training load, scaled by the day's planned load.", is: "Nýlegt æfingaálag hvers leikmanns, kvarðað með áætluðu álagi dagsins." };
  if (day.dayType && day.matchPct != null) {
    const pct = Math.round(targetShare("imaAccel", day.matchPct, day.dayType).share * 100);
    return {
      en: `Accelerations, braking and changes of direction at about ${pct}% of each player's own match, the same target the post-training report judges.`,
      is: `Hraðaaukningar, hemlanir og stefnubreytingar um ${pct}% af eigin leik hvers leikmanns, sama markmið og eftiræfingaskýrslan metur.`,
    };
  }
  return { en: "Sized by the MD-day, because no day-type is planned.", is: "Stærðin ræðst af MD-deginum, því engin dagsgerð er skipulögð." };
}
