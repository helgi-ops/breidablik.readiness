import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * customProgrammeActive — does the team have an authored Custom Programme that covers TODAY for a player?
 *
 * Standard-mode sends (and auto-send) use this to decide whether to STAND ASIDE: when a Custom Programme
 * covers the day, the send does NOT write an engine-template override into `player_today_strength_override`
 * (which would shadow it). The player's existing Today resolution (`PlayerClient.fetchStage4Plan` layer 3)
 * then delivers the authored programme — readiness-reactive at view time, from the single source of truth.
 *
 * This mirrors how the player resolves the template table EXACTLY (team default table + per-player override
 * window + season_phase), so the server's "stand aside" decision agrees with what the player will actually
 * see. It only checks COVERAGE (does a row exist for this MD day or GENERIC), not content — content and the
 * readiness variant stay the player's layer-3 job. Pure reads; any failure → false (safe → engine path).
 *
 * Reference: PlayerClient.tsx:5402-5432 (season_phase + team table), :4849-4878 (per-player window + read).
 */

const VALID_PHASES = ["preseason", "inseason", "playoffs", "offseason"] as const;
const DEFAULT_TABLE = "microdose_templates";

/** Monday (ISO) of the week containing `todayIso` — matches PlayerClient's week_start_date key. */
function mondayOf(todayIso: string): string {
  const d = new Date(`${todayIso}T00:00:00Z`);
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((dow + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type TeamCtx = {
  /** The week's season_phase (always resolved, default "inseason"). */
  seasonPhase: string;
  /** The team's authored custom table, or null when it resolves to the shared default (no team programme).
   *  A per-player override window can still supply a table even when this is null. */
  tableName: string | null;
};

/**
 * The team's week season_phase + its active custom template table (null when it is the shared
 * `microdose_templates` default — the engine's ambient fallback, not an authored programme).
 * Team-level — resolve once per team (e.g. in the auto-send loop), then pass to `customProgrammeCoversDay`.
 */
export async function resolveTeamCustomTable(
  sb: SupabaseClient,
  teamId: string,
  todayIso: string,
): Promise<TeamCtx> {
  try {
    const weekStart = mondayOf(todayIso);
    const [wsRes, ctRes] = await Promise.all([
      sb.from("coach_week_setup").select("season_phase").eq("team_id", teamId).eq("week_start_date", weekStart).maybeSingle(),
      sb.from("custom_template_sets").select("table_name").eq("team_id", teamId).is("player_id", null).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const sp = (wsRes.data as { season_phase?: string } | null)?.season_phase;
    const seasonPhase = (VALID_PHASES as readonly string[]).includes(sp ?? "") ? (sp as string) : "inseason";
    const raw = (ctRes.data as { table_name?: string } | null)?.table_name ?? DEFAULT_TABLE;
    return { seasonPhase, tableName: raw === DEFAULT_TABLE ? null : raw };
  } catch {
    return { seasonPhase: "inseason", tableName: null };
  }
}

/**
 * Does an authored Custom Programme cover this player TODAY? True when the resolved custom table (team
 * default, or a per-player override window whose md_days include today's MD day) has at least one row for
 * `mdDay` OR `GENERIC` in the active season_phase. Pass the pre-resolved `team` table to avoid re-querying
 * the team-level bits per player (auto-send); omit it and it resolves them itself (manual sends).
 */
export async function customProgrammeCoversDay(
  sb: SupabaseClient,
  args: { teamId: string; playerId: string; mdDay: string; todayIso: string; ctx?: TeamCtx },
): Promise<boolean> {
  try {
    const { teamId, playerId, mdDay, todayIso } = args;
    const ctx = args.ctx ?? (await resolveTeamCustomTable(sb, teamId, todayIso));

    // Per-player override window swaps to the player's own table when it covers today's MD day.
    let tableName = ctx.tableName;
    const seasonPhase = ctx.seasonPhase;
    const { data: ovr } = await sb
      .from("custom_template_sets")
      .select("table_name, md_days")
      .eq("player_id", playerId)
      .lte("start_date", todayIso)
      .gte("end_date", todayIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ovrRow = ovr as { table_name?: string; md_days?: string[] } | null;
    if (ovrRow?.table_name && Array.isArray(ovrRow.md_days) && ovrRow.md_days.includes(mdDay)) {
      tableName = ovrRow.table_name;
    }

    // Only a genuine authored table counts — never the shared default / no table.
    if (!tableName || tableName === DEFAULT_TABLE) return false;

    // Dynamic (per-set) table name → the typed client can't know it; use a minimal fluent interface.
    const builder = sb.from(tableName as never) as unknown as DynTable;
    const { data } = await builder
      .select("id")
      .eq("team_id", teamId)
      .in("md_day", [mdDay, "GENERIC"])
      .eq("season_phase", seasonPhase)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** Minimal fluent shape for reading a dynamically-named custom template table. */
type DynTable = {
  select: (columns: string) => DynTable;
  eq: (column: string, value: string) => DynTable;
  in: (column: string, values: string[]) => DynTable;
  limit: (n: number) => Promise<{ data: unknown[] | null }>;
};
