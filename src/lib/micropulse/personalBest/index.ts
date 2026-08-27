/**
 * Personal-best detection — a small motivation engine. Pure / IO-free.
 *
 * When a player's latest test beats their own history by a real margin, that's a
 * personal best worth celebrating. Deliberately conservative so a PB feels
 * earned, not handed out: a genuine improvement over ALL prior tests, past a
 * measurement-noise margin, never a first-ever test, and recent.
 *
 * Ships with CMJ jump height (the flagship — the "how high can you jump" number
 * everyone understands). Extend by adding higher-is-better metrics later; the
 * shape + gates are metric-agnostic.
 */

export type Bi = { en: string; is: string };
export type PbMetric = "cmj_jump_height";

/** One CMJ test reduced to its best jump (max jump_height_cm across the test's trials). */
export type CmjTestBest = { testId: string; at: string; bestJumpCm: number };

export type PersonalBest = {
  metric: PbMetric;
  value: number;
  unit: string;
  priorBest: number;
  improvement: number;      // value - priorBest (absolute, in `unit`)
  improvementPct: number;   // improvement / priorBest
  achievedAt: string;       // the winning test's timestamp (ISO)
  testId: string;           // de-dup identity
};

export type PbOptions = {
  /** Minimum absolute gain to count (measurement-noise floor). Default 0.5 cm. */
  marginCm?: number;
  /** Minimum relative gain to count. Default 1%. */
  marginPct?: number;
  /** Only celebrate a best achieved within this many days of `now`. Default 3. */
  recencyDays?: number;
  /** Current time (ISO). Required for the recency gate; omit to skip recency. */
  now?: string;
};

export const PB_DEFAULTS = { marginCm: 0.5, marginPct: 0.01, recencyDays: 3 } as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Detect a CMJ jump-height PB from a player's test history. Returns the PB or
 * null. `tests` = one entry per CMJ test (its best jump); order doesn't matter.
 */
export function detectCmjPersonalBest(tests: CmjTestBest[], opts: PbOptions = {}): PersonalBest | null {
  const marginCm = opts.marginCm ?? PB_DEFAULTS.marginCm;
  const marginPct = opts.marginPct ?? PB_DEFAULTS.marginPct;
  const recencyDays = opts.recencyDays ?? PB_DEFAULTS.recencyDays;

  const valid = tests
    .filter((t) => t && t.testId && t.at && Number.isFinite(t.bestJumpCm) && t.bestJumpCm > 0)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // Need at least one PRIOR test — a first-ever test is never a "personal best".
  if (valid.length < 2) return null;

  const latest = valid[valid.length - 1];
  const priorBest = Math.max(...valid.slice(0, -1).map((t) => t.bestJumpCm));
  const improvement = latest.bestJumpCm - priorBest;

  // Must clear BOTH the absolute and relative noise floor.
  if (improvement < marginCm) return null;
  if (priorBest > 0 && improvement / priorBest < marginPct) return null;

  // Recency: don't fire on stale history the first time the detector runs.
  if (opts.now) {
    const ageMs = new Date(opts.now).getTime() - new Date(latest.at).getTime();
    if (Number.isFinite(ageMs) && ageMs > recencyDays * 86_400_000) return null;
  }

  return {
    metric: "cmj_jump_height",
    value: round1(latest.bestJumpCm),
    unit: "cm",
    priorBest: round1(priorBest),
    improvement: round1(improvement),
    improvementPct: priorBest > 0 ? improvement / priorBest : 0,
    achievedAt: latest.at,
    testId: latest.testId,
  };
}

const METRIC_LABEL: Record<PbMetric, Bi> = {
  cmj_jump_height: { en: "jump height", is: "stökkhæð" },
};

/** Trim a trailing ".0" so "52.0" reads as "52". */
const nCm = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** Celebratory PUSH copy (title + body), bilingual. */
export function pbPushCopy(pb: PersonalBest, lang: "en" | "is"): { title: string; body: string } {
  if (lang === "is") {
    return { title: "🎉 Nýtt persónulegt met!", body: `Þú stökkst ${nCm(pb.value)} cm — hæsta stökkið þitt (+${nCm(pb.improvement)} cm) 💪` };
  }
  return { title: "🎉 New personal best!", body: `You jumped ${nCm(pb.value)} cm — your highest yet (+${nCm(pb.improvement)} cm) 💪` };
}

/** In-app celebratory CARD copy (headline + subline), bilingual. */
export function pbCardCopy(pb: PersonalBest, lang: "en" | "is"): { headline: string; sub: string } {
  const label = METRIC_LABEL[pb.metric] ?? { en: pb.metric, is: pb.metric };
  if (lang === "is") {
    return {
      headline: `🎉 Nýtt persónulegt met — ${nCm(pb.value)} cm ${label.is}`,
      sub: `+${nCm(pb.improvement)} cm frá fyrra meti þínu (${nCm(pb.priorBest)} cm).`,
    };
  }
  return {
    headline: `🎉 New personal best — ${nCm(pb.value)} cm ${label.en}`,
    sub: `Up ${nCm(pb.improvement)} cm on your previous best (${nCm(pb.priorBest)} cm).`,
  };
}
