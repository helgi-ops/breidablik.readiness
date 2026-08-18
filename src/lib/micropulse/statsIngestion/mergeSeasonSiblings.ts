/**
 * Pure merge of StatsBomb season sibling rows (Squad export ⊕ Player-Stats export).
 *
 * IO-free so it can be unit-tested. Given the statsbomb_csv rows a club has stored for
 * ONE player (same team/season/name, different source_player_ref), it decides which row
 * to keep and how to union the two `metrics` bags so BOTH halves survive:
 *   - Squad export (ref sb:<SBD id>) — deeper numbers, whole roster, no position.
 *   - Player-Stats export (ref sbname:<name>) — the ONLY file with "Primary Position".
 *
 * Canonical row = the one with a stable SBD id (Squad) when present, else the first.
 * Canonical's own non-empty values win; the sibling only FILLS gaps — so a Squad-only
 * metric and the Player-Stats "Primary Position" both end up on the kept row.
 * Descriptive football data — never touches the readiness colour.
 */

export type SiblingRow = {
  id: string;
  source_player_ref: string | null;
  player_id: string | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  metrics: Record<string, number | string | null> | null;
};

export type MergePlan = {
  canonicalId: string;
  update: {
    metrics: Record<string, number | string | null>;
    player_id: string | null;
    minutes: number | null;
    goals: number | null;
    assists: number | null;
    xg: number | null;
  };
  staleIds: string[];
};

const isEmpty = (v: unknown): boolean => v == null || v === "" || (typeof v === "string" && v.trim() === "");

const firstNonNull = <T,>(...xs: (T | null | undefined)[]): T | null => {
  for (const x of xs) if (x != null) return x as T;
  return null;
};

/** Union sibling metric bags into the canonical bag: canonical wins, siblings fill gaps. */
function mergeMetrics(rows: SiblingRow[], canonical: SiblingRow): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = { ...(canonical.metrics ?? {}) };
  for (const r of rows) {
    if (r.id === canonical.id || !r.metrics) continue;
    for (const [k, v] of Object.entries(r.metrics)) {
      if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v; // only fill gaps — never overwrite canonical
    }
  }
  return out;
}

/**
 * Plan the collapse for one player's statsbomb_csv rows. Returns null when there is
 * nothing to do (0 or 1 row). Otherwise returns the canonical row id, the merged
 * update to apply to it, and the sibling ids to delete.
 */
export function mergeStatsbombSiblingRows(rows: SiblingRow[]): MergePlan | null {
  if (rows.length <= 1) return null;
  // Canonical = the row with a stable SBD id (the Squad export), else the first.
  const canonical = rows.find((r) => (r.source_player_ref ?? "").startsWith("sb:")) ?? rows[0];
  return {
    canonicalId: canonical.id,
    update: {
      metrics: mergeMetrics(rows, canonical),
      player_id: firstNonNull(canonical.player_id, ...rows.map((r) => r.player_id)),
      minutes: firstNonNull(canonical.minutes, ...rows.map((r) => r.minutes)),
      goals: firstNonNull(canonical.goals, ...rows.map((r) => r.goals)),
      assists: firstNonNull(canonical.assists, ...rows.map((r) => r.assists)),
      xg: firstNonNull(canonical.xg, ...rows.map((r) => r.xg)),
    },
    staleIds: rows.filter((r) => r.id !== canonical.id).map((r) => r.id),
  };
}
