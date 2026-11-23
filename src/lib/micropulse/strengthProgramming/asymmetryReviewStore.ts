import "server-only";

/**
 * Reads and writes the coach's decisions on left/right asymmetry (asymmetry_reviews, brief §4b).
 *
 *  - fetchAsymmetryReview: the player's newest decision, for the engine snapshot.
 *  - loadTeamAsymmetryQueue: the team's players with a gap ≥ 10% and what is in force, for the coach's card. The gap
 *    comes from the same reads the engine uses (fetchCodAsymmetry / fetchValdAsymmetry), so the card and the session
 *    show the same number. Read on demand only (the card), never in the morning cron.
 *  - recordAsymmetryReview: append one decision (the audit trail), then rebuild today's automatic session so the
 *    decision reaches it the same day (untouched auto rows only, no push).
 *
 * Never the readiness colour.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCodAsymmetry, fetchValdAsymmetry } from "@/lib/micropulse/playerContext/domains";
import { ASYMMETRY_REVIEW_PCT, activeReview, asymmetryRead, type AsymmetryDecision, type AsymmetryReview } from "./asymmetryReview";
import { refreshAutoSessionAfterCheckin } from "./autoSession";

type Row = { player_id: string; decision: AsymmetryDecision; decided_at: string; asym_pct: number | null; reason: string | null };
const toReview = (r: Row): AsymmetryReview => ({ decision: r.decision, decidedAt: r.decided_at, asymPct: r.asym_pct == null ? null : Number(r.asym_pct), reason: r.reason });

export async function fetchAsymmetryReview(sb: SupabaseClient, playerId: string): Promise<AsymmetryReview | null> {
  try {
    const { data } = await sb
      .from("asymmetry_reviews")
      .select("player_id, decision, decided_at, asym_pct, reason")
      .eq("player_id", playerId)
      .order("decided_at", { ascending: false })
      .limit(1);
    const r = (data ?? [])[0] as Row | undefined;
    return r ? toReview(r) : null;
  } catch {
    return null;
  }
}

export type AsymmetryQueueItem = {
  playerId: string;
  name: string;
  pct: number;
  source: "VALD" | "IMA CoD";
  weaker: "L" | "R" | null;
  /** The decision in force today (≤ 28 days), or null = waiting for review. */
  review: AsymmetryReview | null;
};

export async function loadTeamAsymmetryQueue(sb: SupabaseClient, teamId: string, todayIso: string): Promise<AsymmetryQueueItem[]> {
  const { data: roster } = await sb.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true).limit(200);
  const players = (roster ?? []) as Array<{ id: string; full_name: string | null }>;
  if (!players.length) return [];

  const { data: rows } = await sb
    .from("asymmetry_reviews")
    .select("player_id, decision, decided_at, asym_pct, reason")
    .eq("team_id", teamId)
    .order("decided_at", { ascending: false })
    .limit(1000);
  const newest = new Map<string, AsymmetryReview>();
  for (const r of (rows ?? []) as Row[]) if (!newest.has(r.player_id)) newest.set(r.player_id, toReview(r));

  const out: AsymmetryQueueItem[] = [];
  for (let i = 0; i < players.length; i += 5) {
    const chunk = players.slice(i, i + 5);
    const reads = await Promise.all(chunk.map(async (p) => {
      const [cod, vald] = await Promise.all([fetchCodAsymmetry(sb, p.id, todayIso), fetchValdAsymmetry(sb, p.id, todayIso)]);
      return asymmetryRead({ codAsymmetryPct: cod.pct, codWeakerSide: cod.weakerSide, valdAsymmetryPct: vald.pct, valdWeakerSide: vald.weakerSide });
    }));
    chunk.forEach((p, k) => {
      const a = reads[k];
      if (!a || a.pct < ASYMMETRY_REVIEW_PCT) return;
      const review = activeReview({ asymmetryReview: newest.get(p.id), todayIso });
      out.push({ playerId: p.id, name: p.full_name ?? "", pct: a.pct, source: a.source, weaker: a.weaker, review });
    });
  }
  // Waiting first, then the biggest gap.
  return out.sort((a, b) => Number(!!a.review) - Number(!!b.review) || b.pct - a.pct);
}

export async function recordAsymmetryReview(
  sb: SupabaseClient,
  args: { teamId: string; playerId: string; decision: AsymmetryDecision; asymPct: number | null; source: string | null; reason: string | null; decidedBy: string; todayIso: string },
): Promise<{ ok: true; refreshed: unknown } | { ok: false; error: string }> {
  const { error } = await sb.from("asymmetry_reviews").insert({
    team_id: args.teamId, player_id: args.playerId, decision: args.decision,
    asym_pct: args.asymPct, source: args.source, reason: args.reason?.slice(0, 300) || null, decided_by: args.decidedBy,
  });
  if (error) return { ok: false, error: error.message };
  const refreshed = await refreshAutoSessionAfterCheckin(sb, args.playerId, args.todayIso).catch(() => null);
  return { ok: true, refreshed };
}
