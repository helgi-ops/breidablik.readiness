/**
 * When a VALD result may still be read as today's state, and what a jump is
 * compared with. Pure and client-safe, so the snapshot, the coach panel and the
 * squad read all apply one rule.
 *
 * The windows and the baseline rule are a coaching rule, not numbers from a study.
 * The jump as a read of neuromuscular state: Claudino 2017. The strength-gap read:
 * Opar 2015 (hamstring), Hägglund 2013 (groin).
 */

import type { ValdFlag, ValdFreshnessStatus } from "./types";

/** How long a test counts as today's state. Past this it is history that needs a new test. */
export const VALD_FLAG_WINDOW_DAYS = { cmjDays: 7, nordbordDays: 14, forceframeDays: 21 };

/** A left/right gap at or above this flags yellow on both the NordBord and the ForceFrame. */
export const VALD_ASYMMETRY_WATCH_PCT = 10;

/**
 * What a jump is compared with: the player's last 5 tests from the past 90 days, at
 * least 3 of them, and the last one no more than 21 days old. Past that gap the player
 * is returning, and an older level says more about the training block than about fatigue.
 */
export const CMJ_BASELINE_RULE = { windowDays: 90, maxTests: 5, minTests: 3, maxGapDays: 21 };

export type CmjBaselineStatus = "ready" | "too_few" | "gap" | "no_prior";

export type CmjBaselineSelection<T> = {
  status: CmjBaselineStatus;
  /** Newest first, at most `maxTests`. A jump may only flag against these when `ready`. */
  tests: T[];
  /** Days back to the last test on an earlier day; null when there is none in the window. */
  daysSincePrevious: number | null;
};

const dayMs = (iso: string): number => Date.UTC(
  Number(iso.slice(0, 4)),
  Number(iso.slice(5, 7)) - 1,
  Number(iso.slice(8, 10)),
);

const daysBetween = (laterIso: string, earlierIso: string): number =>
  Math.round((dayMs(laterIso) - dayMs(earlierIso)) / 86400000);

/** `priors` are the player's earlier tests, newest first. */
export function selectCmjBaseline<T extends { testTimestamp: string }>(
  latestAt: string | null | undefined,
  priors: T[],
): CmjBaselineSelection<T> {
  if (!latestAt) return { status: "no_prior", tests: [], daysSincePrevious: null };
  const inWindow = priors.filter((p) => daysBetween(latestAt, p.testTimestamp) <= CMJ_BASELINE_RULE.windowDays);
  const tests = inWindow.slice(0, CMJ_BASELINE_RULE.maxTests);
  const previous = inWindow.find((p) => daysBetween(latestAt, p.testTimestamp) > 0);
  const daysSincePrevious = previous ? daysBetween(latestAt, previous.testTimestamp) : null;
  if (!tests.length) return { status: "no_prior", tests, daysSincePrevious };
  if (daysSincePrevious != null && daysSincePrevious > CMJ_BASELINE_RULE.maxGapDays) return { status: "gap", tests, daysSincePrevious };
  if (tests.length < CMJ_BASELINE_RULE.minTests) return { status: "too_few", tests, daysSincePrevious };
  return { status: "ready", tests, daysSincePrevious };
}

/** A flag only counts as today's state while its test is inside the freshness window. */
export function currentValdFlag(testFlag: ValdFlag, freshness: ValdFreshnessStatus): ValdFlag {
  return freshness === "fresh" ? testFlag : null;
}

export function worstValdFlag(flags: ValdFlag[]): ValdFlag {
  if (flags.includes("red")) return "red";
  if (flags.includes("yellow")) return "yellow";
  if (flags.includes("green")) return "green";
  return null;
}

export type CmjReturnRead = {
  baseline: number | null;
  delta_percent: number | null;
  compared_tests: number;
  days_since_previous_test: number;
  message: { en: string; is: string };
};

const fmt1 = (n: number): string => n.toFixed(1);

/**
 * A first jump after a gap: the plain comparison, without a flag or a trim. A lighter
 * week answers fatigue, while a player back from a gap needs building up again.
 */
export function buildCmjReturnRead(input: {
  latest: number;
  baseline: number | null;
  comparedTests: number;
  daysSincePrevious: number;
}): CmjReturnRead {
  const { latest, baseline, comparedTests, daysSincePrevious: d } = input;
  const delta = baseline != null && baseline > 0 ? ((latest - baseline) / baseline) * 100 : null;
  const en = `First jump test in ${d} days: ${fmt1(latest)} cm`;
  const is = `Fyrsta hoppróf í ${d} daga: ${fmt1(latest)} cm`;
  const testsEn = comparedTests === 1 ? "the last test" : `the last ${comparedTests} tests`;
  const testsIs = comparedTests === 1 ? "síðasta prófi" : `síðustu ${comparedTests} prófum`;
  const cmpEn = delta == null ? "" : `, ${fmt1(Math.abs(delta))}% ${delta < 0 ? "below" : "above"} ${testsEn}`;
  const cmpIs = delta == null ? "" : `, ${fmt1(Math.abs(delta))}% ${delta < 0 ? "undir" : "yfir"} ${testsIs}`;
  return {
    baseline,
    delta_percent: delta,
    compared_tests: comparedTests,
    days_since_previous_test: d,
    message: {
      en: `${en}${cmpEn}. Too long a gap to read as fatigue, so no flag and no trim. Test again within a week.`,
      is: `${is}${cmpIs}. Of langt hlé til að lesa sem þreytu, svo ekkert flagg og engin lækkun. Prófaðu aftur innan viku.`,
    },
  };
}

export type RetestEntry = { playerId: string; ageDays: number; asymPct: number };

/**
 * Players whose newest strength test showed a left/right gap but is too old to read
 * today. `rows` are newest first, as the snapshot reads them.
 */
export function strengthRetestList(
  rows: Array<{ playerId: string; testTimestamp: string; asymPct: number | null }>,
  asOfDate: string,
  windowDays: number,
): RetestEntry[] {
  const seen = new Set<string>();
  const out: RetestEntry[] = [];
  for (const row of rows) {
    if (!row.playerId || seen.has(row.playerId)) continue;
    seen.add(row.playerId);
    const ageDays = daysBetween(asOfDate, row.testTimestamp);
    if (row.asymPct != null && row.asymPct >= VALD_ASYMMETRY_WATCH_PCT && ageDays > windowDays) {
      out.push({ playerId: row.playerId, ageDays, asymPct: row.asymPct });
    }
  }
  return out;
}
