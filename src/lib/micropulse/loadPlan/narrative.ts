/**
 * src/lib/micropulse/loadPlan/narrative
 *
 * THE single source of the Pre-Session Report's explainability prose. Both the
 * on-screen card (LoadPlanCard) and the PDF (LoadPlanPdf) render the exact same
 * paragraphs from here, so "what the coach reads on screen is what the PDF says".
 *
 * Deterministic: every sentence is built from the numbers the rules computed.
 */

const fmt = (n: number | null | undefined): string => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

const TYPE_DESC: Record<string, string> = {
  mechanical: "force / accel-decel emphasis (short, high-effort actions — braking and explosive starts; loads tendons, quads, calves)",
  locomotive: "high-speed running emphasis (sprint and high-speed-running volume; loads hamstrings, conditions the engine)",
  mixed: "balanced — neither force nor speed dominates",
};

export type NarrativePlan = {
  hasTargets: boolean;
  mode: string;
  planned: { mdLabel: string | null; loadType: string; matchPct: number; rationaleEN: string; band: string; rpe: number; durationMin: number; sessionLoad: number };
  targets: Array<{ kpi: string; target: number | null; matchRef: number | null; pctOfMatch: number | null }>;
  adjustedTargets: Array<{ kpi: string; target: number | null }>;
  matchDaysUsed: number;
  teamAcwr: number | null;
  acutePL: number | null;
  chronicPL: number | null;
  recentLean: { lean: string | null; note: string | null; mechIdx: number | null; locoIdx: number | null };
  readinessAdjustPct: number;
  readinessNote: string | null;
  targetRpe: number | null;
  targetDurationMin: number | null;
  targetSrpe: number | null;
  srpeSource: string;
  perPlayer: Array<{ name: string; acwr: number | null; flag: string }>;
  coverage: { trainingDays: number; matchDays: number; distinctDates: number; playersWithHistory: number; totalPlayers: number; windowDays: number };
};

const cap = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * One-sentence "bottom line" for the very top of the report — the single line a
 * busy coach reads first. Deterministic, built from the same numbers.
 */
export function buildLoadPlanBottomLine(plan: NarrativePlan, redCount: number | null = null): string {
  if (!plan.hasTargets) return plan.planned.rationaleEN;
  const type = plan.mode === "microcycle" ? plan.planned.loadType : "mixed";
  const tgt = (k: string) => plan.targets.find((t) => t.kpi === k)?.target ?? null;
  const adj = (k: string) => plan.adjustedTargets.find((t) => t.kpi === k)?.target ?? null;
  const trimmed = plan.readinessAdjustPct !== 0;
  const td = trimmed ? adj("totalDistance") : tgt("totalDistance");
  const pl = trimmed ? adj("playerLoad") : tgt("playerLoad");

  const lead = plan.mode === "microcycle" && plan.planned.mdLabel
    ? `Today: ${plan.planned.mdLabel} (${type}, ${plan.planned.matchPct}% of match)`
    : `Today: a ${type} session`;
  let s = `${lead} — aim ~${fmt(td)} m total distance and ~${fmt(pl)} Player Load per player`;
  s += trimmed ? ` (already trimmed ${plan.readinessAdjustPct}% for readiness).` : ".";

  const mgmt: string[] = [];
  const reduceN = plan.perPlayer.filter((x) => x.flag === "reduce").length;
  if (reduceN) mgmt.push(`hold back ${reduceN} spiking player${reduceN === 1 ? "" : "s"}`);
  if (redCount) mgmt.push(`${redCount} red check-in${redCount === 1 ? "" : "s"} to manage individually`);
  if (mgmt.length) s += ` ${cap(mgmt.join(", "))}.`;
  return s;
}

/**
 * Build the explainability paragraphs. `checkedIn` (today's readiness check-in
 * count) is optional context for the confidence sentence.
 */
export function buildLoadPlanNarrative(plan: NarrativePlan, checkedIn: number | null = null): string[] {
  const narrative: string[] = [];
  if (!plan.hasTargets) {
    narrative.push(plan.planned.rationaleEN);
    return narrative;
  }

  const targetBy = (k: string) => plan.targets.find((t) => t.kpi === k);
  const micro = plan.mode === "microcycle";

  // 1) Intro — where today's number comes from.
  if (micro) {
    narrative.push(
      `Today is ${plan.planned.mdLabel ?? "a training day"} in the match-week microcycle. ${plan.planned.rationaleEN} It calls for a ${plan.planned.loadType} session — ${TYPE_DESC[plan.planned.loadType] ?? "a balanced session"}. The whole session is pitched at ${plan.planned.matchPct}% of match demand (target intensity ~${plan.planned.sessionLoad} AU: RPE ${plan.planned.rpe} × ${plan.planned.durationMin} min), and each KPI target below is re-weighted toward that emphasis.`,
    );
  } else {
    narrative.push(
      `No match-week (MD) structure is set up, so the target is built from the squad's recent training baseline (last 4 weeks) rather than a microcycle position — then adjusted for recent load.`,
    );
  }

  // 2) Session type — mechanical / locomotive / mixed, defined and decided.
  const typeVerdict = micro ? plan.planned.loadType : "mixed";
  let stp = `Session type today: ${typeVerdict.toUpperCase()}. Mechanical = ${TYPE_DESC.mechanical}; locomotive = ${TYPE_DESC.locomotive}; mixed = ${TYPE_DESC.mixed}.`;
  if (micro) {
    stp += ` Because this is ${plan.planned.mdLabel ?? "today's microcycle day"}, the per-KPI targets are already re-weighted toward the ${typeVerdict} emphasis (a mechanical day lifts the accel/decel targets and trims high-speed running; a locomotive day does the reverse).`;
  } else {
    stp += ` Without a match-week (MD) structure the engine can't place today in the microcycle, so it defaults to a balanced (mixed) session.`;
    if (plan.recentLean.note) stp += ` ${plan.recentLean.note}`;
    if (plan.recentLean.mechIdx != null && plan.recentLean.locoIdx != null) {
      stp += ` (recent force index ${plan.recentLean.mechIdx.toFixed(2)} vs running index ${plan.recentLean.locoIdx.toFixed(2)}, where 1.00 = a match-like share).`;
    }
  }
  narrative.push(stp);

  // 3) Per-player headline targets.
  const td = targetBy("totalDistance"); const hsr = targetBy("hsr"); const pl = targetBy("playerLoad"); const ima = targetBy("ima");
  const bits: string[] = [];
  if (td?.target != null) bits.push(`~${fmt(td.target)} m total distance per player${td.pctOfMatch != null ? ` (${td.pctOfMatch}% of a match's ${fmt(td.matchRef)} m)` : ""}`);
  if (hsr?.target != null) bits.push(`~${fmt(hsr.target)} m high-speed running`);
  if (pl?.target != null) bits.push(`~${fmt(pl.target)} Player Load`);
  if (ima?.target != null) bits.push(`~${fmt(ima.target)} m IMA high-intensity distance`);
  if (bits.length) narrative.push(`Per-player targets: ${bits.join(", ")}.${micro ? ` The match reference is the squad's average on its ${plan.matchDaysUsed} highest-load days.` : ""}`);

  // 3b) Expected internal load (session-RPE).
  if (plan.targetSrpe != null && plan.targetRpe != null) {
    if (plan.srpeSource === "recent") {
      narrative.push(`Expected internal load: aim for about sRPE ${plan.targetSrpe} AU (RPE ~${plan.targetRpe} × ${plan.targetDurationMin} min) — estimated from the squad's recent training sessions. Logging actual RPE afterwards lets the report check planned vs actual internal load.`);
    } else if (micro) {
      narrative.push(`Expected internal load: sRPE ${plan.targetSrpe} AU (RPE ${plan.targetRpe} × ${plan.targetDurationMin} min) for this microcycle day. Log actual RPE afterwards to compare planned vs actual.`);
    }
  } else if (!micro) {
    narrative.push(`No recent session-RPE submissions yet, so there is no internal-load (RPE) target — start logging session RPE and the report will estimate an expected RPE automatically.`);
  }

  // 4) Recent load (acute:chronic).
  if (plan.teamAcwr != null) {
    narrative.push(
      `Recent load: the squad's acute (7-day) Player Load is ${fmt(plan.acutePL)} against a ${fmt(plan.chronicPL)} chronic (28-day) average — an acute:chronic ratio of ${plan.teamAcwr.toFixed(2)} (${plan.teamAcwr > 1.3 ? "above the Gabbett sweet spot — keep today controlled" : plan.teamAcwr < 0.8 ? "below the sweet spot — there is room to load" : "inside the 0.8–1.3 sweet spot"}).`,
    );
  }

  // 5) Readiness modifier — spell out the adjusted prescription.
  if (plan.readinessAdjustPct !== 0) {
    const adj = (k: string) => plan.adjustedTargets.find((t) => t.kpi === k)?.target ?? null;
    narrative.push(`Today's check-ins move the prescription: ${plan.readinessNote ?? `apply ${plan.readinessAdjustPct}%`} That trims the squad target to about ${fmt(adj("totalDistance"))} m total distance, ${fmt(adj("playerLoad"))} Player Load, ${fmt(adj("hsr"))} m high-speed and ${fmt(adj("ima"))} m IMA per player.`);
  } else if (plan.readinessNote) {
    narrative.push(plan.readinessNote);
  }

  // 6) Per-player management.
  const reducePlayers = plan.perPlayer.filter((x) => x.flag === "reduce");
  if (reducePlayers.length) narrative.push(`${reducePlayers.length} player${reducePlayers.length === 1 ? "" : "s"} should hold back today (already spiking): ${reducePlayers.slice(0, 6).map((x) => `${x.name} (ACWR ${x.acwr?.toFixed(2)})`).join(", ")}. Trim their individual volume rather than the whole squad's.`);
  const buildPlayers = plan.perPlayer.filter((x) => x.flag === "build");
  if (buildPlayers.length) narrative.push(`${buildPlayers.length} player${buildPlayers.length === 1 ? "" : "s"} have room to load (under-trained, ACWR < 0.8): ${buildPlayers.slice(0, 6).map((x) => x.name).join(", ")} — they can take a little more than the squad target.`);

  // 7) Confidence / coverage.
  const cov = plan.coverage;
  narrative.push(`Confidence: this baseline rests on ${cov.trainingDays} training day${cov.trainingDays === 1 ? "" : "s"} and a ${cov.matchDays}-match reference drawn from ${cov.distinctDates} GPS days over the last ${Math.round(cov.windowDays / 7)} weeks, across ${cov.playersWithHistory}/${cov.totalPlayers} players with load history${checkedIn != null ? `, with ${checkedIn} readiness check-ins today` : ""}. ${cov.trainingDays >= 8 ? "That is a mature baseline." : "Treat the numbers as indicative until more training days accrue."}`);

  // 8) Counterfactual — how to upgrade.
  if (!micro) {
    narrative.push(`To turn this into a microcycle-specific target (a prescribed mechanical / locomotive / mixed day with an sRPE and %-of-match for the exact MD position), set up this week's match day in Week setup — the report then switches automatically.`);
  }

  return narrative;
}
