/**
 * basketballPhysical — the PHYSICAL axis for a basketball player, from the Titan indoor IMU feed
 * (player_external_load_daily, source "titan"). Pure (no IO).
 *
 * Basketball has no GPS and (for now) no strength tests, so the "athlete" side of a Total Player
 * Analysis comes from what the indoor pods DO report: session player-load (volume), impacts
 * (landing/contact load) and jumps (explosiveness proxy). Each player is averaged per session, then
 * ranked WITHIN THEIR OWN SQUAD (percentiles) — the same within-squad lens as the production axis.
 *
 * DESCRIPTIVE ONLY — a physical-output context beside the box score; never the readiness colour,
 * the load target, or the daily decision. More load/impacts/jumps is "more physically involved",
 * not "better" or "fitter" — it is read as output, not a verdict.
 */

export type TitanLine = { playerId: string; playerLoad: number | null; impacts: number | null; jumps: number | null };

export type PhysMetricKey = "playerLoad" | "impacts" | "jumps";

export const PHYS_LABELS: Record<PhysMetricKey, { en: string; is: string }> = {
  playerLoad: { en: "Player load / session", is: "Álag / æfingu" },
  impacts: { en: "Impacts / session", is: "Höggálag / æfingu" },
  jumps: { en: "Jumps / session", is: "Stökk / æfingu" },
};
const PHYS_ORDER: PhysMetricKey[] = ["playerLoad", "impacts", "jumps"];

export type PhysicalPlayer = { playerId: string; sessions: number; playerLoad: number | null; impacts: number | null; jumps: number | null };

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Average each Titan metric per player over the sessions that reported it (blank cells don't drag
 *  the mean). One row per player. */
export function aggregatePhysical(lines: TitanLine[]): PhysicalPlayer[] {
  type Acc = { sessions: number; pl: { s: number; n: number }; im: { s: number; n: number }; ju: { s: number; n: number } };
  const by = new Map<string, Acc>();
  const add = (b: { s: number; n: number }, v: number | null) => { if (typeof v === "number" && Number.isFinite(v)) { b.s += v; b.n += 1; } };
  for (const l of lines) {
    if (!l.playerId) continue;
    const a = by.get(l.playerId) ?? { sessions: 0, pl: { s: 0, n: 0 }, im: { s: 0, n: 0 }, ju: { s: 0, n: 0 } };
    a.sessions += 1; add(a.pl, l.playerLoad); add(a.im, l.impacts); add(a.ju, l.jumps);
    by.set(l.playerId, a);
  }
  const mean = (b: { s: number; n: number }): number | null => (b.n > 0 ? r1(b.s / b.n) : null);
  return [...by.entries()].map(([playerId, a]) => ({ playerId, sessions: a.sessions, playerLoad: mean(a.pl), impacts: mean(a.im), jumps: mean(a.ju) }));
}

/** Percentile of a value within the pool (share at/below). Higher output = higher percentile. */
function percentile(pool: PhysicalPlayer[], k: PhysMetricKey, value: number): number {
  const vals = pool.map((p) => p[k]).filter((v): v is number => v != null);
  if (vals.length <= 1) return 50;
  return Math.round((vals.filter((v) => v <= value).length / vals.length) * 100);
}

export type PhysMetricCell = { key: PhysMetricKey; label: { en: string; is: string }; value: number | null; percentile: number | null };
export type PhysicalRead = { sessions: number; avgPercentile: number | null; metrics: PhysMetricCell[]; poolSize: number };

/** The physical read for one player within the squad. Null when the player has no Titan sessions. */
export function buildPhysical(pool: PhysicalPlayer[], playerId: string): PhysicalRead | null {
  const picked = pool.find((p) => p.playerId === playerId);
  if (!picked || picked.sessions === 0) return null;
  const metrics: PhysMetricCell[] = PHYS_ORDER.map((k) => {
    const value = picked[k];
    return { key: k, label: PHYS_LABELS[k], value, percentile: value == null ? null : percentile(pool, k, value) };
  });
  const pcs = metrics.map((m) => m.percentile).filter((v): v is number => v != null);
  return { sessions: picked.sessions, avgPercentile: pcs.length ? Math.round(pcs.reduce((a, b) => a + b, 0) / pcs.length) : null, metrics, poolSize: pool.length };
}
