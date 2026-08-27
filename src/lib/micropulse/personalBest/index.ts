/**
 * Personal-best detection — a small motivation engine. Pure / IO-free.
 *
 * When a player's latest test beats their own history by a real margin, that's a
 * personal best worth celebrating. Deliberately conservative so a PB feels
 * earned, not handed out: a genuine improvement over ALL prior tests, past a
 * measurement-noise margin, never a first-ever test, and recent.
 *
 * Metrics (all higher-is-better): CMJ jump height, Nordic (NordBord) peak force,
 * IMTP peak force. The gates + copy are metric-driven — add a metric by adding a
 * METRIC_CONFIG entry.
 */

export type Bi = { en: string; is: string };
export type PbMetric = "cmj_jump_height" | "nordic_peak_force" | "imtp_peak_force";

/** One test reduced to its best value (max across the test's trials / limbs). */
export type TestBest = { testId: string; at: string; value: number };
/** @deprecated CMJ-specific alias kept for existing callers. */
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
  /** Only celebrate a best achieved within this many days of `now`. Default 3. */
  recencyDays?: number;
  /** Current time (ISO). Required for the recency gate; omit to skip recency. */
  now?: string;
};

type MetricConfig = { unit: string; marginAbs: number; marginPct: number; decimals: number; label: Bi };

/** Per-metric noise floors + display. `marginAbs` is in the metric's own unit. */
export const METRIC_CONFIG: Record<PbMetric, MetricConfig> = {
  cmj_jump_height:   { unit: "cm", marginAbs: 0.5, marginPct: 0.01, decimals: 1, label: { en: "jump height", is: "stökkhæð" } },
  nordic_peak_force: { unit: "N",  marginAbs: 15,  marginPct: 0.03, decimals: 0, label: { en: "Nordic strength", is: "Nordic styrkur" } },
  imtp_peak_force:   { unit: "N",  marginAbs: 40,  marginPct: 0.03, decimals: 0, label: { en: "IMTP strength", is: "IMTP styrkur" } },
};

export const PB_DEFAULTS = { recencyDays: 3 } as const;

const roundTo = (n: number, d: number) => { const f = 10 ** d; return Math.round(n * f) / f; };

/** Detect a PB for `metric` from `tests` (one entry per test = its best value). */
export function detectPersonalBest(metric: PbMetric, tests: TestBest[], opts: PbOptions = {}): PersonalBest | null {
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return null;
  const recencyDays = opts.recencyDays ?? PB_DEFAULTS.recencyDays;

  const valid = tests
    .filter((t) => t && t.testId && t.at && Number.isFinite(t.value) && t.value > 0)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  // Need at least one PRIOR test — a first-ever test is never a "personal best".
  if (valid.length < 2) return null;

  const latest = valid[valid.length - 1];
  const priorBest = Math.max(...valid.slice(0, -1).map((t) => t.value));
  const improvement = latest.value - priorBest;

  // Must clear BOTH the absolute and relative noise floor.
  if (improvement < cfg.marginAbs) return null;
  if (priorBest > 0 && improvement / priorBest < cfg.marginPct) return null;

  // Recency: don't fire on stale history the first time the detector runs.
  if (opts.now) {
    const ageMs = new Date(opts.now).getTime() - new Date(latest.at).getTime();
    if (Number.isFinite(ageMs) && ageMs > recencyDays * 86_400_000) return null;
  }

  return {
    metric,
    value: roundTo(latest.value, cfg.decimals),
    unit: cfg.unit,
    priorBest: roundTo(priorBest, cfg.decimals),
    improvement: roundTo(improvement, cfg.decimals),
    improvementPct: priorBest > 0 ? improvement / priorBest : 0,
    achievedAt: latest.at,
    testId: latest.testId,
  };
}

/** CMJ jump-height convenience wrapper (kept for existing callers). */
export function detectCmjPersonalBest(tests: CmjTestBest[], opts: PbOptions = {}): PersonalBest | null {
  return detectPersonalBest("cmj_jump_height", tests.map((t) => ({ testId: t.testId, at: t.at, value: t.bestJumpCm })), opts);
}

/** Trim a trailing ".0" so "52.0" reads as "52". */
const fmt = (n: number, decimals: number) => n.toFixed(decimals).replace(/\.0$/, "");

/** Celebratory PUSH copy (title + body), bilingual, metric-aware. */
export function pbPushCopy(pb: PersonalBest, lang: "en" | "is"): { title: string; body: string } {
  const cfg = METRIC_CONFIG[pb.metric];
  const v = fmt(pb.value, cfg.decimals), imp = fmt(pb.improvement, cfg.decimals), u = cfg.unit;
  const title = lang === "is" ? "🎉 Nýtt persónulegt met!" : "🎉 New personal best!";
  const bodyByMetric: Record<PbMetric, { en: string; is: string }> = {
    cmj_jump_height: {
      en: `You jumped ${v} ${u} — your highest yet (+${imp} ${u}) 💪`,
      is: `Þú stökkst ${v} ${u} — hæsta stökkið þitt (+${imp} ${u}) 💪`,
    },
    nordic_peak_force: {
      en: `Your strongest Nordic yet — ${v} ${u} (+${imp} ${u}) 💪`,
      is: `Sterkasti Nordic hjá þér — ${v} ${u} (+${imp} ${u}) 💪`,
    },
    imtp_peak_force: {
      en: `Your strongest IMTP pull yet — ${v} ${u} (+${imp} ${u}) 💪`,
      is: `Sterkasta IMTP togið hjá þér — ${v} ${u} (+${imp} ${u}) 💪`,
    },
  };
  return { title, body: bodyByMetric[pb.metric][lang] };
}

/** In-app celebratory CARD copy (headline + subline), bilingual, metric-aware. */
export function pbCardCopy(pb: PersonalBest, lang: "en" | "is"): { headline: string; sub: string } {
  const cfg = METRIC_CONFIG[pb.metric];
  const v = fmt(pb.value, cfg.decimals), imp = fmt(pb.improvement, cfg.decimals), prev = fmt(pb.priorBest, cfg.decimals), u = cfg.unit;
  const label = lang === "is" ? cfg.label.is : cfg.label.en;
  if (lang === "is") {
    return { headline: `🎉 Nýtt persónulegt met — ${v} ${u} ${label}`, sub: `+${imp} ${u} frá fyrra meti þínu (${prev} ${u}).` };
  }
  return { headline: `🎉 New personal best — ${v} ${u} ${label}`, sub: `Up ${imp} ${u} on your previous best (${prev} ${u}).` };
}
