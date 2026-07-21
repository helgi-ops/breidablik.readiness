/**
 * Game-density week model for basketball — pure, side-effect free.
 *
 * Basketball has no MD-day microcycle. A week is defined by how many games fall
 * in it (0–3), and the load pattern is counter-intuitive: external load ranks
 * W3 > W0 > W2 > W1, while the highest *internal* (perceived) response is in
 * weeks with NO game at all (Salazar et al. 2020). Reusing football's MD model
 * would give actively wrong expectations, so this module encodes the basketball
 * shape as guidance instead.
 *
 * Every function is a NO-OP for football: `expectedWeekShape` returns null and
 * the anomaly/bench helpers return empty. The football MD-day model stays the
 * single authority and its behaviour must not change.
 *
 * Provenance (per the explainability manifesto, every rule carries its source):
 *   Salazar 2020   — external W3>W0>W2>W1; internal peaks in no-game weeks.
 *   Conte 2018     — 1-game weeks carry MORE total load than 2-game weeks;
 *                    starters > bench; bench needs topping up (esp. 2-game).
 *   Power 2024     — congested weeks are tapered; the 3rd game of a 3-game week
 *                    is the heaviest single event.
 *   Paulauskas 2019 — a well-run team moves CHRONIC load ≤10% week-on-week;
 *                     the spikes live in acute load, not chronic.
 *
 * Deliberately NOT modelled here (see the task brief): the ACWR 1.0–1.5 "sweet
 * spot" (Weiss 2017 — all mean differences "unclear"), normative women's
 * benchmarks (Power 2022 — un-poolable), and hormonal monitoring (Kamarauskas
 * 2021 — no significant load/wellness link). Surfacing any of those would
 * oversell the evidence.
 */

import type { SportId } from "../sportProfiles";
import type { WeekType } from "./weekType";

/** A plain-language string in both UI languages. */
export type Bi = { en: string; is: string };

/** A well-run team moves chronic load by at most this fraction week-on-week. */
export const CHRONIC_DRIFT_THRESHOLD = 0.10;

/** Bench players falling below this fraction of the squad's median game minutes
 *  are materially under-loaded in a two-game week and may need topping up. */
export const BENCH_TOPUP_FRACTION = 0.5;

// ── expectedWeekShape ────────────────────────────────────────────────────────

export interface WeekShape {
  weekType: WeekType;
  /** The ~5s verdict sentence. */
  headline: Bi;
  /** The plain "why" behind it (Layer 1 of the layered read). */
  detail: Bi;
  citation: string;
}

const BASKETBALL_SHAPES: Record<WeekType, WeekShape> = {
  NO_MATCH: {
    weekType: "NO_MATCH",
    headline: {
      en: "No game this week — your build window.",
      is: "Enginn leikur í vikunni — uppbyggingargluggi.",
    },
    detail: {
      en: "External load ranks second-highest of any week type, yet perceived (internal) load often peaks when there is no game to pace the week. Plan the work — then watch it doesn't quietly spike.",
      is: "Ytra álag er næst-hæst allra vikugerða, en upplifað (innra) álag toppar oft þegar enginn leikur stýrir vikunni. Skipuleggðu álagið — og fylgstu með að það rjúki ekki hljóðlega upp.",
    },
    citation: "Salazar et al. 2020",
  },
  ONE_MATCH: {
    weekType: "ONE_MATCH",
    headline: {
      en: "One game — don't under-plan it.",
      is: "Einn leikur — ekki vanáætla vikuna.",
    },
    detail: {
      en: "One-game weeks often carry MORE total weekly load than two-game weeks, and external load is the lowest of the four week types — so training makes up the difference.",
      is: "Vikur með einum leik bera oft MEIRA heildarálag en vikur með tveimur leikjum, og ytra álag er lægst allra fjögurra vikugerða — æfingarnar brúa bilið.",
    },
    citation: "Conte et al. 2018 · Salazar et al. 2020",
  },
  TWO_MATCHES: {
    weekType: "TWO_MATCHES",
    headline: {
      en: "Two games — top up the bench.",
      is: "Tveir leikir — bættu á varamennina.",
    },
    detail: {
      en: "External load sits low across the week; starters accumulate far more than bench players, who may need topping up. Taper training between the two games.",
      is: "Ytra álag er lágt yfir vikuna; byrjunarliðið safnar mun meira en varamenn, sem gætu þurft aukaálag. Minnkaðu æfingaálag milli leikjanna tveggja.",
    },
    citation: "Conte et al. 2018 · Power et al. 2024",
  },
  THREE_MATCHES: {
    weekType: "THREE_MATCHES",
    headline: {
      en: "Three games — the heaviest week type.",
      is: "Þrír leikir — þyngsta vikugerðin.",
    },
    detail: {
      en: "This is the highest external-load week. Taper training between games and expect the third game to be the single heaviest event.",
      is: "Þetta er hæsta ytra-álags vikan. Minnkaðu æfingaálag milli leikja og bústu við að þriðji leikurinn verði þyngsti einstaki atburðurinn.",
    },
    citation: "Salazar et al. 2020 · Power et al. 2024",
  },
};

/**
 * The expected load shape for a week. Basketball only — returns null for
 * football (the MD-day model is authoritative there, and this must be a no-op).
 */
export function expectedWeekShape(sport: SportId, weekType: WeekType): WeekShape | null {
  if (sport !== "basketball") return null;
  return BASKETBALL_SHAPES[weekType];
}

// ── flagWeekAnomaly ──────────────────────────────────────────────────────────

export type WeekFlagKind = "chronic_drift" | "shape_mismatch";

export interface WeekFlag {
  kind: WeekFlagKind;
  headline: Bi;
  citation: string;
  severity: "watch";
  /** Signed week-on-week chronic drift as a fraction (chronic_drift only). */
  driftPct?: number;
}

export interface WeekAnomalyInput {
  sport: SportId;
  weekType: WeekType;
  /** Chronic weekly-load series, oldest → newest; the last entry is this week. */
  weeklyLoads: number[];
}

export interface WeekAnomalyResult {
  flags: WeekFlag[];
}

function pct1(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

/**
 * Flag the week against the basketball shape. Two independent, personal-norm
 * signals — no normative benchmark is used (there are none worth trusting for
 * basketball; personal norm is the only defensible comparison):
 *
 *   1. CHRONIC DRIFT — chronic load moved more than ~10% week-on-week
 *      (Paulauskas 2019). This is the signal worth surfacing; acute spikes are
 *      normal in basketball and are deliberately NOT flagged.
 *   2. SHAPE MISMATCH — a THREE_MATCHES week (unambiguously the peak week type)
 *      that came in BELOW the team's own recent average week. Compared only to
 *      the team's own history, framed as "check why", never a verdict.
 *
 * No-op for football.
 */
export function flagWeekAnomaly(input: WeekAnomalyInput): WeekAnomalyResult {
  const { sport, weekType, weeklyLoads } = input;
  if (sport !== "basketball") return { flags: [] };

  const flags: WeekFlag[] = [];
  const loads = (weeklyLoads ?? []).filter((n) => typeof n === "number" && isFinite(n));
  const n = loads.length;

  // 1. Chronic drift, week-on-week (needs a previous week with real load).
  if (n >= 2) {
    const prev = loads[n - 2];
    const cur = loads[n - 1];
    if (prev > 0) {
      const drift = (cur - prev) / prev;
      if (Math.abs(drift) > CHRONIC_DRIFT_THRESHOLD) {
        const up = drift > 0;
        flags.push({
          kind: "chronic_drift",
          severity: "watch",
          driftPct: drift,
          citation: "Paulauskas et al. 2019",
          headline: {
            en: `Chronic load moved ${up ? "up" : "down"} ${pct1(Math.abs(drift))} on last week — a well-run team keeps this under ~10%.`,
            is: `Krónískt álag ${up ? "hækkaði" : "lækkaði"} um ${pct1(Math.abs(drift))} frá síðustu viku — vel rekið lið heldur þessu undir ~10%.`,
          },
        });
      }
    }
  }

  // 2. Shape mismatch — three-game week below the team's own average week.
  if (weekType === "THREE_MATCHES" && n >= 3) {
    const cur = loads[n - 1];
    const priors = loads.slice(0, n - 1);
    const mean = priors.reduce((a, b) => a + b, 0) / priors.length;
    if (mean > 0 && cur < mean) {
      flags.push({
        kind: "shape_mismatch",
        severity: "watch",
        citation: "Salazar et al. 2020",
        headline: {
          en: "A three-game week is the heaviest week type, but this one came in below your usual week — check whether a game ran short on minutes or a session was dropped.",
          is: "Vika með þremur leikjum er þyngsta vikugerðin, en þessi var undir þinni venjulegu viku — athugaðu hvort leikur hafi verið mínútu-stuttur eða æfing dottið út.",
        },
      });
    }
  }

  return { flags };
}

// ── benchTopUpCandidates ─────────────────────────────────────────────────────

export interface PlayerMinutes {
  playerId: string;
  minutes: number;
}

export interface BenchTopUpResult {
  candidates: PlayerMinutes[];
  /** Bilingual reason, or null when there are no candidates. */
  reason: Bi | null;
  citation: string;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * In a TWO_MATCHES week, identify players whose game minutes leave them
 * materially under the squad (below half the squad's median minutes) — bench
 * players who may need topping up (Conte 2018). Does NOT prescribe a session;
 * `plannedSessionLoad.ts` owns compensation. No-op for any other week type.
 */
export function benchTopUpCandidates(input: {
  weekType: WeekType;
  minutesByPlayer: PlayerMinutes[];
}): BenchTopUpResult {
  const citation = "Conte et al. 2018";
  const empty: BenchTopUpResult = { candidates: [], reason: null, citation };

  if (input.weekType !== "TWO_MATCHES") return empty;

  const players = (input.minutesByPlayer ?? []).filter(
    (p) => p && typeof p.minutes === "number" && isFinite(p.minutes),
  );
  if (players.length < 2) return empty;

  const med = median(players.map((p) => p.minutes));
  if (med <= 0) return empty;

  const cutoff = med * BENCH_TOPUP_FRACTION;
  const candidates = players
    .filter((p) => p.minutes < cutoff)
    .sort((a, b) => a.minutes - b.minutes);

  if (candidates.length === 0) return empty;

  return {
    candidates,
    citation,
    reason: {
      en: `${candidates.length} player${candidates.length > 1 ? "s" : ""} played under half the squad's median game minutes this two-game week — bench players who typically need topping up so their load doesn't fall away.`,
      is: `${candidates.length} leikm${candidates.length > 1 ? "enn" : "aður"} spilaði undir helmingi af miðgildi liðsins í leikmínútum þessa tveggja-leikja viku — varamenn sem þurfa yfirleitt aukaálag svo álagið detti ekki niður.`,
    },
  };
}
