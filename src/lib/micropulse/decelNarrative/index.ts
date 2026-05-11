/**
 * Decel Narrative pipeline.
 *
 * Coach feedback (2026-04-30): the Decel Intel page shows 6 numbers + chips
 * but coaches without S&C background can't read them. They want a
 * 2-3 sentence plain-language explanation that translates the metrics into
 * coach speak ("Aron is braking more than he's accelerating — one-sided
 * movement; spread the high-intensity work out").
 *
 * Architecture (lessons from 2026-04-29 hallucination day):
 *   1. Pre-compute interpretation labels in TypeScript here. The LLM does
 *      NOT compute its own interpretation of the numbers — that's where
 *      every previous AI mistake came from (HMLD-as-HIR, scale flips,
 *      cleared-when-injured).
 *   2. The LLM receives labeled inputs ("ad_coupling.direction =
 *      'below_healthy', coach_phrase = 'braking exceeds acceleration'")
 *      and only writes prose around those labels.
 *   3. Validator checks each metric's claim against the pre-computed
 *      direction — if direction = "below_healthy" then text must not
 *      contain "healthy", "in range", "balanced", "good range".
 *
 * Cost: Claude Haiku 4.5, ~$0.0023 per call, cached 4h per (player, window).
 */

// ─── Public types ──────────────────────────────────────────────────────────

export type Flag = "green" | "yellow" | "red" | "unknown";

export type Severity = "ok" | "watch" | "concern";

export type RawDecelInputs = {
  player_name: string;
  position?: string | null;
  overload?: { flag: Flag; cumulative_28d_count: number; baseline_daily_mean: number } | null;
  underload?: { flag: Flag; cumulative_7d_count: number; match_day_demand: number; match_days_observed: number } | null;
  accel_coupling?: { flag: Flag; recent_ratio: number; healthy_range: string } | null;
  sprint_coupling?: { flag: Flag; recent_ratio: number; healthy_range: string } | null;
  concentration?: { flag: Flag; peak_day_pct_of_28d: number; distinct_high_intensity_days: number } | null;
  sharp_cut?: { cuts_7d: number; cuts_28d: number; cuts_personal_z: number | null; cuts_flag: Flag | "insufficient" } | null;
  mpe_recovery?: { recent_7d_avg_s: number | null; baseline_28d_avg_s: number | null; z_score: number | null; flag: Flag } | null;
};

type MetricLabel = {
  label: string;
  value_text: string;
  direction:
    | "above_baseline"
    | "below_baseline"
    | "at_baseline"
    | "above_healthy"
    | "below_healthy"
    | "in_range"
    | "underprepared"
    | "adequate"
    | "well_prepared"
    | "concentrated"
    | "distributed"
    | "lengthening"
    | "stable"
    | "shortening"
    | "spike"
    | "no_data";
  severity: Severity;
  coach_phrase: string;
  /** Forbidden words/phrases when this metric appears in the AI text — used
   *  by the validator to catch direction-flips. */
  forbidden_when_used: string[];
};

export type DecelInterpretation = {
  player: { name: string; position: string | null };
  metrics: {
    overload?:        MetricLabel;
    underload?:       MetricLabel;
    ad_coupling?:     MetricLabel;
    d_sprint?:        MetricLabel;
    concentration?:   MetricLabel;
    sharp_cut?:       MetricLabel;
    mpe_recovery?:    MetricLabel;
  };
  overall: {
    concern_count: number;
    has_any_red: boolean;
    has_any_yellow: boolean;
    /** Top-priority phrase the AI should lead with. Empty if all-green. */
    headline_phrase: string;
  };
};

// ─── Per-metric interpretation builders ────────────────────────────────────

function buildOverload(o: NonNullable<RawDecelInputs["overload"]>): MetricLabel {
  const expected_28d = o.baseline_daily_mean * 28;
  const ratio = expected_28d > 0 ? o.cumulative_28d_count / expected_28d : 0;
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (ratio >= 1.5 || o.flag === "red") {
    direction = "above_baseline";
    severity = "concern";
    coach_phrase = `well above his usual daily decel rate (${ratio.toFixed(1)}× expected over 28 days)`;
  } else if (ratio >= 1.15 || o.flag === "yellow") {
    direction = "above_baseline";
    severity = "watch";
    coach_phrase = `slightly above his typical decel volume`;
  } else if (ratio < 0.7) {
    direction = "below_baseline";
    severity = "ok";
    coach_phrase = `decel volume is below his usual rate`;
  } else {
    direction = "at_baseline";
    severity = "ok";
    coach_phrase = `decel volume is in line with his usual rate`;
  }
  return {
    label: "Overload",
    value_text: `${o.cumulative_28d_count.toFixed(0)} decels over 28 days (baseline ~${o.baseline_daily_mean.toFixed(1)}/day)`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "above_baseline"
        ? ["normal", "in line", "below baseline", "underloaded", "low decel"]
        : direction === "below_baseline"
          ? ["overloaded", "spike", "well above"]
          : [],
  };
}

function buildUnderload(u: NonNullable<RawDecelInputs["underload"]>): MetricLabel {
  const ratio = u.match_day_demand > 0 ? u.cumulative_7d_count / u.match_day_demand : 0;
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (ratio < 0.5 || u.flag === "red") {
    direction = "underprepared";
    severity = "concern";
    coach_phrase = `well under match-day decel demand (only ~${Math.round(ratio * 100)}% of what a match would ask)`;
  } else if (ratio < 0.8 || u.flag === "yellow") {
    direction = "underprepared";
    severity = "watch";
    coach_phrase = `below match-day decel demand`;
  } else {
    direction = "adequate";
    severity = "ok";
    coach_phrase = `7-day decel exposure is at or above match-day demand`;
  }
  return {
    label: "Underload (match readiness)",
    value_text: `${u.cumulative_7d_count.toFixed(0)} of ~${u.match_day_demand.toFixed(0)} match-day decels in last 7 days`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "underprepared"
        ? ["well prepared", "match-ready", "exceeds match demand", "at full match exposure"]
        : ["underprepared", "below match demand"],
  };
}

function buildAdCoupling(a: NonNullable<RawDecelInputs["accel_coupling"]>): MetricLabel {
  const r = a.recent_ratio;
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (r < 0.8 || a.flag === "red") {
    direction = "below_healthy";
    severity = r < 0.6 ? "concern" : "watch";
    coach_phrase = `braking exceeds acceleration (${r.toFixed(2)} vs healthy 0.8–1.2) — one-sided movement, decel-heavy`;
  } else if (r > 1.2) {
    direction = "above_healthy";
    severity = r > 1.5 ? "concern" : "watch";
    coach_phrase = `acceleration exceeds braking (${r.toFixed(2)} vs healthy 0.8–1.2) — accel-heavy, may lack braking control`;
  } else {
    direction = "in_range";
    severity = "ok";
    coach_phrase = `decel and accel are balanced`;
  }
  return {
    label: "Decel:Accel coupling",
    value_text: `${r.toFixed(2)} (healthy 0.8–1.2)`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "below_healthy"
        ? ["healthy coupling", "in range", "balanced", "good range", "exceeds acceleration", "acceleration heavy"]
        : direction === "above_healthy"
          ? ["healthy coupling", "in range", "balanced", "decel heavy", "braking heavy"]
          : ["one-sided", "imbalanced"],
  };
}

function buildDSprint(d: NonNullable<RawDecelInputs["sprint_coupling"]>): MetricLabel {
  const r = d.recent_ratio;
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (r < 0.5 || d.flag === "red") {
    direction = "below_healthy";
    severity = r < 0.3 ? "concern" : "watch";
    coach_phrase = `sprinting without proportional braking (D:Sprint ${r.toFixed(2)}) — classic high-speed injury pattern`;
  } else if (r > 1.5 || d.flag === "yellow") {
    direction = "above_healthy";
    severity = "watch";
    coach_phrase = `lots of braking relative to sprinting (D:Sprint ${r.toFixed(2)}) — may signal short, choppy movement`;
  } else {
    direction = "in_range";
    severity = "ok";
    coach_phrase = `decel and sprint volumes are proportional`;
  }
  return {
    label: "Decel:Sprint coupling",
    value_text: `${r.toFixed(2)} (healthy 0.5–1.5)`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "below_healthy"
        ? ["healthy", "balanced", "proportional"]
        : direction === "above_healthy"
          ? ["sprinting without braking", "classic injury pattern"]
          : ["choppy", "sprint without braking"],
  };
}

function buildConcentration(c: NonNullable<RawDecelInputs["concentration"]>): MetricLabel {
  const pct = c.peak_day_pct_of_28d;
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (pct >= 25 || c.flag === "red") {
    direction = "concentrated";
    severity = pct >= 35 ? "concern" : "watch";
    coach_phrase = `${Math.round(pct)}% of his 28-day decel volume came from a single day — tall-thin force pattern that increases injury risk`;
  } else if (pct >= 15 || c.flag === "yellow") {
    direction = "concentrated";
    severity = "watch";
    coach_phrase = `decel volume is moderately concentrated in single sessions`;
  } else {
    direction = "distributed";
    severity = "ok";
    coach_phrase = `decel volume is well distributed across sessions`;
  }
  return {
    label: "Exposure concentration",
    value_text: `${pct.toFixed(0)}% of 28d came from peak session`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "concentrated"
        ? ["well distributed", "spread across sessions", "balanced exposure"]
        : ["concentrated", "single-session spike", "tall-thin"],
  };
}

function buildSharpCut(s: NonNullable<RawDecelInputs["sharp_cut"]>): MetricLabel {
  const z = s.cuts_personal_z;
  if (z == null || s.cuts_flag === "insufficient") {
    return {
      label: "Sharp cuts",
      value_text: `${s.cuts_7d} cuts in 7 days (baseline still building)`,
      direction: "no_data",
      severity: "ok",
      coach_phrase: `not enough baseline data to compare cutting volume to his personal norm`,
      forbidden_when_used: ["above his norm", "below his norm", "spike", "elevated"],
    };
  }
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (z >= 1.5 || s.cuts_flag === "red") {
    direction = "spike";
    severity = "concern";
    coach_phrase = `sharp braking work spiked above his personal range (z=${z.toFixed(1)}) — ACL/groin injury window`;
  } else if (z >= 1.0 || s.cuts_flag === "yellow") {
    direction = "spike";
    severity = "watch";
    coach_phrase = `sharp braking work is above his usual range`;
  } else {
    direction = "stable";
    severity = "ok";
    coach_phrase = `sharp braking volume is in his normal range`;
  }
  return {
    label: "Sharp cuts",
    value_text: `${s.cuts_7d} cuts in 7 days (z=${z.toFixed(1)} vs personal norm)`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "spike"
        ? ["normal range", "in his usual", "no concern"]
        : ["spike", "ACL window", "above his usual"],
  };
}

function buildMpeRecovery(m: NonNullable<RawDecelInputs["mpe_recovery"]>): MetricLabel {
  const z = m.z_score;
  if (z == null) {
    return {
      label: "MPE recovery",
      value_text: "no recovery-time data this window",
      direction: "no_data",
      severity: "ok",
      coach_phrase: `recovery-time data not available`,
      forbidden_when_used: [],
    };
  }
  let direction: MetricLabel["direction"];
  let severity: Severity;
  let coach_phrase: string;
  if (z >= 1.0 || m.flag === "red") {
    direction = "lengthening";
    severity = z >= 1.5 ? "concern" : "watch";
    coach_phrase = `recovery time between high-intensity bursts is lengthening (z=${z.toFixed(1)}) — early fatigue signal`;
  } else if (z <= -1.0) {
    direction = "shortening";
    severity = "ok";
    coach_phrase = `recovery time between bursts is shorter than usual — fitness signal`;
  } else {
    direction = "stable";
    severity = "ok";
    coach_phrase = `recovery time between bursts is stable`;
  }
  return {
    label: "MPE recovery",
    value_text: `recent 7d avg ${m.recent_7d_avg_s ?? "?"}s vs 28d ${m.baseline_28d_avg_s ?? "?"}s (z=${z.toFixed(1)})`,
    direction,
    severity,
    coach_phrase,
    forbidden_when_used:
      direction === "lengthening"
        ? ["recovering quickly", "shorter recovery", "fitness signal"]
        : direction === "shortening"
          ? ["lengthening", "early fatigue"]
          : [],
  };
}

// ─── Top-level interpretation ──────────────────────────────────────────────

export function buildDecelInterpretation(input: RawDecelInputs): DecelInterpretation {
  const m: DecelInterpretation["metrics"] = {};
  if (input.overload)        m.overload        = buildOverload(input.overload);
  if (input.underload)       m.underload       = buildUnderload(input.underload);
  if (input.accel_coupling)  m.ad_coupling     = buildAdCoupling(input.accel_coupling);
  if (input.sprint_coupling) m.d_sprint        = buildDSprint(input.sprint_coupling);
  if (input.concentration)   m.concentration   = buildConcentration(input.concentration);
  if (input.sharp_cut)       m.sharp_cut       = buildSharpCut(input.sharp_cut);
  if (input.mpe_recovery)    m.mpe_recovery    = buildMpeRecovery(input.mpe_recovery);

  const all = Object.values(m);
  const concerns = all.filter((x) => x?.severity === "concern");
  const watches  = all.filter((x) => x?.severity === "watch");
  const has_any_red    = concerns.length > 0;
  const has_any_yellow = watches.length > 0;
  const concern_count  = concerns.length + watches.length;

  // Build a top-priority headline phrase.
  let headline_phrase = "";
  if (has_any_red) {
    // Pick the most urgent concern by metric importance (sharp cuts > ad/d-sprint coupling > overload > concentration > underload > mpe)
    const priority: Array<keyof typeof m> = [
      "sharp_cut",
      "ad_coupling",
      "d_sprint",
      "overload",
      "concentration",
      "underload",
      "mpe_recovery",
    ];
    for (const k of priority) {
      const x = m[k];
      if (x && x.severity === "concern") {
        headline_phrase = x.coach_phrase;
        break;
      }
    }
  } else if (has_any_yellow) {
    const w = all.find((x) => x?.severity === "watch");
    if (w) headline_phrase = w.coach_phrase;
  } else {
    headline_phrase = "decel signals are all in his normal range";
  }

  return {
    player: { name: input.player_name, position: input.position ?? null },
    metrics: m,
    overall: { concern_count, has_any_red, has_any_yellow, headline_phrase },
  };
}

// ─── Deterministic fallback narrative ──────────────────────────────────────

/**
 * Build a non-AI narrative from the structured interpretation. Used when:
 *   - The Claude call fails (rate-limit, network, 5xx)
 *   - Or the AI output fails validation twice in a row
 *
 * Stitches the per-metric `coach_phrase` fields together. Direction and
 * severity come straight from the data, so this can never hallucinate or
 * contradict the chips above the card. Capped at ~3 sentences so it reads
 * like the AI version, just less personalised.
 */
export function buildFallbackNarrative(interp: DecelInterpretation): string {
  const concernEntries = Object.values(interp.metrics)
    .filter((m): m is MetricLabel => Boolean(m && m.severity !== "ok"))
    // Concern (red) before watch (yellow). Stable order preserved otherwise.
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      if (a.severity === "concern") return -1;
      if (b.severity === "concern") return 1;
      return 0;
    });

  const firstName = interp.player.name.split(/\s+/)[0] || interp.player.name;

  if (concernEntries.length === 0) {
    return `${firstName}'s decel metrics all sit in his healthy range — overload, underload, coupling and concentration are all green. Nothing flagged today; train as planned.`;
  }

  // Up to 2 concerning phrases in the body, plus a closing recommendation.
  const top = concernEntries.slice(0, 2);
  const lead = top
    .map((m) => m.coach_phrase)
    .join("; ");

  const tail =
    concernEntries.some((m) => m.severity === "concern")
      ? "Worth a coach conversation before today's session — adjust intensity if it lines up with how he's feeling."
      : "Watch closely — not yet a hard concern, but trending in a direction worth noting.";

  return `${firstName}: ${lead}. ${tail}`;
}

// ─── Validator ─────────────────────────────────────────────────────────────

/** Returns the first validation issue, or null if the text is acceptable. */
export function validateDecelNarrative(
  text: string,
  interp: DecelInterpretation,
): string | null {
  const lower = text.toLowerCase();

  // Length: 2-4 sentences. Catches both terse fragments and runaway prose.
  const sentenceCount = text.split(/[.!?]+/).filter((s) => s.trim().length > 5).length;
  if (sentenceCount < 1 || sentenceCount > 6) {
    return `Sentence count out of bounds (${sentenceCount}, expected 2-4)`;
  }

  // For every metric the AI references, check direction-aligned forbidden phrases.
  // We approximate "AI references this metric" by checking whether any of the
  // metric's distinctive value tokens (numbers, key words from coach_phrase)
  // appear in the text, OR by always checking when the metric has severity != ok.
  for (const [, label] of Object.entries(interp.metrics)) {
    if (!label) continue;
    // Always check labels with non-ok severity — those are the ones the
    // narrative is most likely to discuss.
    const shouldCheck =
      label.severity !== "ok" ||
      label.label
        .toLowerCase()
        .split(/\s+/)
        .some((w) => w.length > 3 && lower.includes(w));
    if (!shouldCheck) continue;
    for (const forbidden of label.forbidden_when_used) {
      if (forbidden && lower.includes(forbidden.toLowerCase())) {
        return `Direction mismatch on "${label.label}" (${label.direction}): contains forbidden phrase "${forbidden}"`;
      }
    }
  }

  // If overall has_any_red, the narrative must NOT lead with "everything looks fine"
  if (interp.overall.has_any_red) {
    const fineLeaders = [
      "everything looks fine",
      "everything is fine",
      "all signals look good",
      "no concerns",
      "no concerns today",
      "all in his normal range",
      "all clear",
    ];
    for (const re of fineLeaders) {
      if (lower.includes(re)) {
        return `Contradicts ${interp.overall.concern_count} concerning metric(s): contains "${re}"`;
      }
    }
  }

  return null;
}
