/**
 * Pure merge of StatsBomb season sibling rows (Squad export ⊕ Player-Stats export).
 *
 * IO-free so it can be unit-tested. Given the statsbomb_csv rows a club has stored for
 * ONE player (same team/season/name, different source_player_ref), it decides which row
 * to keep and how to union the two `metrics` bags so BOTH halves survive:
 *   - Squad export (ref sb:<SBD id>) — deeper numbers, whole roster, no position.
 *   - Player-Stats export (ref sbname:<name>) — the ONLY file with "Primary Position".
 *
 * Canonical row (the DB id we keep) = the one with a stable SBD id (Squad) when present,
 * else the first — so the surviving row keeps a stable identity. But the DATA is merged
 * by FRESHNESS: for every metric/scalar the value from the most recently synced sibling
 * wins, and complementary keys from the other export are unioned in. Ties (equal/absent
 * synced_at) fall to the canonical row. This is what makes a re-upload actually update
 * the numbers — before, the Squad row was frozen as the authority, so re-uploading the
 * Player-Stats export with newer numbers was silently discarded.
 *
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
  /** When this row was last imported. Drives freshness; absent → treated as oldest. */
  synced_at?: string | null;
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

/**
 * Order rows oldest → freshest so a later fold overwrites an earlier value. ISO
 * timestamps compare lexically = chronologically; a missing synced_at sorts oldest.
 * On a tie the canonical row is placed LAST so it wins (preserves the old
 * "Squad is the authority" behaviour whenever freshness can't decide).
 */
function orderedByFreshness(rows: SiblingRow[], canonical: SiblingRow): SiblingRow[] {
  return [...rows].sort((a, b) => {
    const fa = a.synced_at ?? "", fb = b.synced_at ?? "";
    if (fa !== fb) return fa < fb ? -1 : 1;
    if (a.id === canonical.id) return 1;
    if (b.id === canonical.id) return -1;
    return 0;
  });
}

/** Union the sibling metric bags: the freshest non-empty value wins per key. */
function mergeMetrics(ordered: SiblingRow[]): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  for (const r of ordered) {
    if (!r.metrics) continue;
    for (const [k, v] of Object.entries(r.metrics)) {
      if (!isEmpty(v)) out[k] = v; // later (fresher) non-empty value wins
    }
  }
  return out;
}

/** The freshest non-null scalar across the ordered rows (last-non-null in oldest→freshest order). */
function freshestNonNull<T>(ordered: SiblingRow[], pick: (r: SiblingRow) => T | null): T | null {
  let val: T | null = null;
  for (const r of ordered) { const v = pick(r); if (v != null) val = v; }
  return val;
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
  const ordered = orderedByFreshness(rows, canonical);
  return {
    canonicalId: canonical.id,
    update: {
      metrics: mergeMetrics(ordered),
      player_id: freshestNonNull(ordered, (r) => r.player_id),
      minutes: freshestNonNull(ordered, (r) => r.minutes),
      goals: freshestNonNull(ordered, (r) => r.goals),
      assists: freshestNonNull(ordered, (r) => r.assists),
      xg: freshestNonNull(ordered, (r) => r.xg),
    },
    staleIds: rows.filter((r) => r.id !== canonical.id).map((r) => r.id),
  };
}
