import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecoveryProtocol } from "./types";

export type RecoveryAssignment = {
  id: string;
  protocol_id: string;
  player_id: string;
  team_id: string | null;
  assigned_at: string;
  due_at: string;
  completed_at: string | null;
  trigger_reason: string | null;
  trigger_metadata: Record<string, unknown> | null;
  notes: string | null;
};

export type RecoveryAssignmentWithProtocol = RecoveryAssignment & {
  protocol: RecoveryProtocol | null;
};

/** A coach-sent protocol the player hasn't done yet stays visible this many days
 *  (it must not vanish at the next day boundary before the player has acted on it). */
export const PENDING_COACH_ASSIGN_PERSIST_DAYS = 14;

/**
 * Load all assignments for a player within an inclusive date window.
 * Default window: today and tomorrow (so MD+1 morning bundles show up the
 * evening they're scheduled too).
 *
 * EXCEPTION: a COACH-SENT ("manual_coach") assignment the player hasn't completed
 * must not disappear at the day boundary — a rehab/recovery a coach sent stays until
 * the player does it (or it ages out after PENDING_COACH_ASSIGN_PERSIST_DAYS). Only
 * applied to the default window; an explicit from/to is honoured verbatim.
 */
export async function loadAssignmentsForPlayer(
  sb: SupabaseClient,
  args: { playerId: string; fromIso?: string; toIso?: string },
): Promise<RecoveryAssignmentWithProtocol[]> {
  const now = new Date();
  const explicitWindow = args.fromIso != null;
  const from = args.fromIso ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
  const to = args.toIso ?? new Date(now.getTime() + 36 * 3600_000).toISOString();
  // Reach further back only to pick up still-pending coach sends; completed and
  // auto (post-match) assignments are still bounded to the same-day window below.
  const queryFrom = explicitWindow
    ? from
    : new Date(now.getTime() - PENDING_COACH_ASSIGN_PERSIST_DAYS * 86_400_000).toISOString();

  const { data, error } = await sb
    .from("recovery_protocol_assignments")
    .select(
      "id, protocol_id, player_id, team_id, assigned_at, due_at, completed_at, trigger_reason, trigger_metadata, notes, " +
        "protocol:recovery_protocols(id, slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active, evidence_note)",
    )
    .eq("player_id", args.playerId)
    .gte("due_at", queryFrom)
    .lte("due_at", to)
    .order("due_at", { ascending: true });

  if (error) return [];
  const rows = (data ?? []) as unknown as RecoveryAssignmentWithProtocol[];
  if (explicitWindow) return rows; // caller asked for a specific window — return it verbatim
  // Default window: the normal same-day items, PLUS any still-pending coach-sent one
  // whose due_at has already passed (so it persists until the player completes it).
  return rows.filter(
    (r) => r.due_at >= from || (r.completed_at == null && r.trigger_reason === "manual_coach"),
  );
}

/** Idempotent: only inserts if no existing pending assignment for the same protocol on the same calendar date. */
export async function ensureAssignment(
  sb: SupabaseClient,
  args: {
    protocolId: string;
    playerId: string;
    teamId: string | null;
    dueAt: string;
    triggerReason: string;
    triggerMetadata?: Record<string, unknown>;
    assignedBy?: string | null;
  },
): Promise<{ created: boolean; id: string | null }> {
  const dayStart = new Date(args.dueAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const { data: existing } = await sb
    .from("recovery_protocol_assignments")
    .select("id")
    .eq("player_id", args.playerId)
    .eq("protocol_id", args.protocolId)
    .gte("due_at", dayStart.toISOString())
    .lt("due_at", dayEnd.toISOString())
    .maybeSingle();

  if (existing?.id) return { created: false, id: existing.id };

  const { data: inserted, error } = await sb
    .from("recovery_protocol_assignments")
    .insert({
      protocol_id: args.protocolId,
      player_id: args.playerId,
      team_id: args.teamId,
      due_at: args.dueAt,
      trigger_reason: args.triggerReason,
      trigger_metadata: args.triggerMetadata ?? null,
      assigned_by: args.assignedBy ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) return { created: false, id: null };
  return { created: true, id: inserted.id };
}
