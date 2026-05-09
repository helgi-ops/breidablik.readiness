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

/**
 * Load all assignments for a player within an inclusive date window.
 * Default window: today and tomorrow (so MD+1 morning bundles show up the
 * evening they're scheduled too).
 */
export async function loadAssignmentsForPlayer(
  sb: SupabaseClient,
  args: { playerId: string; fromIso?: string; toIso?: string },
): Promise<RecoveryAssignmentWithProtocol[]> {
  const now = new Date();
  const from = args.fromIso ?? new Date(now.getTime() - 24 * 3600_000).toISOString();
  const to = args.toIso ?? new Date(now.getTime() + 36 * 3600_000).toISOString();

  const { data, error } = await sb
    .from("recovery_protocol_assignments")
    .select(
      "id, protocol_id, player_id, team_id, assigned_at, due_at, completed_at, trigger_reason, trigger_metadata, notes, " +
        "protocol:recovery_protocols(id, slug, title, category, evidence_tier, duration_min, when_to_use, goal, trigger_hint, sections, citations, active)",
    )
    .eq("player_id", args.playerId)
    .gte("due_at", from)
    .lte("due_at", to)
    .order("due_at", { ascending: true });

  if (error) return [];
  return (data ?? []) as unknown as RecoveryAssignmentWithProtocol[];
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
