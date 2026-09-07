/**
 * Re-screen trend — the close-the-loop credibility hook. Given a player's saved
 * screens (over time), track each variable that was ever flagged (moderate+) and
 * say whether it improved, worsened or is unchanged from the first flagged screen
 * to the latest. A compensation is trainable and should close on re-screen
 * (Bell 2013); this shows whether it did. Pure — no DB, never the readiness colour.
 */
import type { Severity } from "./registry";
import type { ScreenFinding } from "./interpret";

const RANK: Record<Severity, number> = { ok: 0, mild: 1, moderate: 2, marked: 3 };

export type TrendVerdict = "improving" | "worse" | "unchanged" | "single";
export type TrendPoint = { date: string; severity: Severity; value: number | null };
export type VariableTrend = {
  variableKey: string;
  leg: "L" | "R" | "both" | null;
  points: TrendPoint[]; // chronological
  verdict: TrendVerdict;
};

/** Trends for one test's screens (any order in; sorted oldest→newest inside). */
export function buildVariableTrends(screens: Array<{ screenDate: string; findings: ScreenFinding[] }>): VariableTrend[] {
  const sorted = [...screens].sort((a, b) => a.screenDate.localeCompare(b.screenDate));
  const map = new Map<string, VariableTrend>();
  for (const s of sorted) {
    for (const f of s.findings ?? []) {
      if (f.severity == null) continue;
      const leg = (f.leg ?? null) as VariableTrend["leg"];
      const key = `${f.variableKey}|${leg ?? ""}`;
      let t = map.get(key);
      if (!t) { t = { variableKey: f.variableKey, leg, points: [], verdict: "single" }; map.set(key, t); }
      t.points.push({ date: s.screenDate, severity: f.severity, value: f.value ?? null });
    }
  }
  const out: VariableTrend[] = [];
  for (const t of map.values()) {
    if (!t.points.some((p) => RANK[p.severity] >= RANK.moderate)) continue; // only ever-flagged
    if (t.points.length >= 2) {
      const first = RANK[t.points[0].severity];
      const last = RANK[t.points[t.points.length - 1].severity];
      t.verdict = last < first ? "improving" : last > first ? "worse" : "unchanged";
    } else {
      t.verdict = "single";
    }
    out.push(t);
  }
  return out;
}
