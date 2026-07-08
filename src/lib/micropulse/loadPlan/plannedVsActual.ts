/**
 * src/lib/micropulse/loadPlan/plannedVsActual
 *
 * Post-training "did we hit the plan?" comparison. Takes the pre-session load
 * PLAN (what the system recommended) and the ACTUAL session GPS means, and
 * reports the variance per KPI — at team level and per player — so a coach can
 * see where the squad (or an individual) ran hotter or lighter than prescribed.
 *
 * Deterministic and self-contained: the plan numbers come from buildLoadPlan
 * (rules decide), this only diffs them against what was captured.
 */

export const PVA_KPIS = ["totalDistance", "playerLoad", "hsr", "sprint", "accel", "decel", "efforts", "ima"] as const;
export type PvaKpi = (typeof PVA_KPIS)[number];

export const PVA_LABEL: Record<PvaKpi, string> = {
  totalDistance: "Total distance (m)",
  playerLoad: "Player Load",
  hsr: "HSR (m)",
  sprint: "Sprint (m)",
  accel: "Accel B2-3",
  decel: "Decel B2-3",
  efforts: "Hard efforts",
  ima: "IMA COD (m)",
};

export type PvaStatus = "on" | "over" | "well_over" | "under" | "well_under" | "na";

export type KpiCompare = {
  kpi: PvaKpi;
  planned: number | null;   // per-player target (readiness-adjusted)
  actual: number | null;    // per-player actual (team mean, or this player's value)
  pctOfPlan: number | null; // actual / planned, %
  status: PvaStatus;
};

export type PlayerCompare = {
  player_id: string;
  name: string;
  byKpi: Record<PvaKpi, KpiCompare>;
  /** Headline adherence on Player Load (the "how hard" metric). */
  status: PvaStatus;
  pctOfPlan: number | null;
};

export type PlannedVsActual = {
  hasPlan: boolean;
  mode: string;
  mdLabel: string | null;
  loadType: string;
  matchPct: number;
  readinessAdjustPct: number;
  team: KpiCompare[];
  players: PlayerCompare[];
  summary: string;
  /** KPIs that have planned-or-actual data (capability-aware) — card filters by this. */
  availableKpis: PvaKpi[];
};

export type ActualKpis = {
  totalDistance: number | null; playerLoad: number | null; hsr: number | null;
  sprint: number | null; accel: number | null; decel: number | null; efforts: number | null; ima: number | null;
};

type PlanTarget = { kpi: string; target: number | null };
type PlanPlayer = {
  player_id: string; name: string;
  totalDistance: number | null; playerLoad: number | null; hsr: number | null;
  sprint: number | null; accel: number | null; decel: number | null; efforts: number | null; ima: number | null;
};
export type PlanForCompare = {
  hasTargets: boolean;
  mode: string;
  planned: { mdLabel: string | null; loadType: string; matchPct: number };
  targets: PlanTarget[];
  adjustedTargets: PlanTarget[];
  readinessAdjustPct: number;
  perPlayer: PlanPlayer[];
};

/** Adherence classification for actual-vs-planned. Shared with the player recap
 *  so its verdict uses the SAME thresholds as the coach planned-vs-actual. */
export function statusOf(planned: number | null, actual: number | null): { pct: number | null; status: PvaStatus } {
  if (planned == null || planned <= 0 || actual == null) return { pct: null, status: "na" };
  const pct = Math.round((actual / planned) * 100);
  let status: PvaStatus;
  if (pct >= 85 && pct <= 115) status = "on";
  else if (pct > 140) status = "well_over";
  else if (pct > 115) status = "over";
  else if (pct >= 60) status = "under";
  else status = "well_under";
  return { pct, status };
}

const compare = (kpi: PvaKpi, planned: number | null, actual: number | null): KpiCompare => {
  const { pct, status } = statusOf(planned, actual);
  return { kpi, planned: planned != null ? Math.round(planned) : null, actual: actual != null ? Math.round(actual) : null, pctOfPlan: pct, status };
};

/**
 * @param plan        the pre-session plan (from buildLoadPlan / load-plan API)
 * @param teamActual  team-mean actual KPIs for the session
 * @param actualById  per-player actual KPIs for the session, keyed by player_id
 */
export function buildPlannedVsActual(
  plan: PlanForCompare | null,
  teamActual: ActualKpis,
  actualById: Map<string, ActualKpis>,
): PlannedVsActual {
  const empty: PlannedVsActual = {
    hasPlan: false, mode: "unavailable", mdLabel: null, loadType: "mixed", matchPct: 0,
    readinessAdjustPct: 0, team: [], players: [], availableKpis: [], summary: "No pre-session plan was available for this date, so there is nothing to compare against.",
  };
  if (!plan || !plan.hasTargets) return empty;

  const adjFactor = 1 + (plan.readinessAdjustPct || 0) / 100;
  // Team planned = readiness-adjusted team target per KPI.
  const teamPlannedBy = new Map<string, number | null>();
  for (const t of plan.adjustedTargets) teamPlannedBy.set(t.kpi, t.target);

  const team: KpiCompare[] = PVA_KPIS.map((k) =>
    compare(k, teamPlannedBy.get(k) ?? null, teamActual[k]),
  );
  // Capability-aware: only KPIs with planned-or-actual data (Lite lacks the
  // accel/decel split + IMA but has the combined "efforts").
  const availableKpis = team.filter((c) => c.planned != null || c.actual != null).map((c) => c.kpi);

  // Per-player planned = that player's KPI target × the squad readiness factor.
  const players: PlayerCompare[] = plan.perPlayer.map((pp) => {
    const act = actualById.get(pp.player_id) ?? { totalDistance: null, playerLoad: null, hsr: null, sprint: null, accel: null, decel: null, efforts: null, ima: null };
    const byKpi = {} as Record<PvaKpi, KpiCompare>;
    for (const k of PVA_KPIS) {
      const plannedRaw = pp[k];
      const planned = plannedRaw != null ? plannedRaw * adjFactor : null;
      byKpi[k] = compare(k, planned, act[k]);
    }
    return { player_id: pp.player_id, name: pp.name, byKpi, status: byKpi.playerLoad.status, pctOfPlan: byKpi.playerLoad.pctOfPlan };
  }).sort((a, b) => (b.pctOfPlan ?? 0) - (a.pctOfPlan ?? 0));

  // Team summary sentence — headline adherence on Player Load + distance.
  const pl = team.find((t) => t.kpi === "playerLoad");
  const dist = team.find((t) => t.kpi === "totalDistance");
  const overN = players.filter((p) => p.status === "over" || p.status === "well_over").length;
  const underN = players.filter((p) => p.status === "under" || p.status === "well_under").length;
  let summary: string;
  if (pl?.pctOfPlan == null) {
    summary = "The session was captured but the plan could not be matched to it for a comparison.";
  } else {
    const adh = pl.status === "on" ? "landed on plan" : pl.status === "over" || pl.status === "well_over" ? "ran hotter than planned" : "came in lighter than planned";
    summary = `The squad ${adh}: Player Load reached ${pl.pctOfPlan}% of target${dist?.pctOfPlan != null ? ` and total distance ${dist.pctOfPlan}%` : ""}.`;
    if (overN || underN) summary += ` ${overN} player${overN === 1 ? "" : "s"} ran above plan and ${underN} below — see the per-player table for who.`;
  }

  return {
    hasPlan: true,
    mode: plan.mode,
    mdLabel: plan.planned.mdLabel,
    loadType: plan.planned.loadType,
    matchPct: plan.planned.matchPct,
    readinessAdjustPct: plan.readinessAdjustPct,
    team,
    players,
    availableKpis,
    summary,
  };
}
