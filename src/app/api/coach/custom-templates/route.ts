export const runtime = "nodejs";

/**
 * /api/coach/custom-templates
 *
 * GET  — list all custom template sets for the authenticated coach's team
 * POST — create a new template set (creates dynamic table + saves records)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";


/**
 * Authenticate the coach and resolve which team to operate on.
 *
 * If `targetTeamId` is supplied (non-null), we verify the coach has access to
 * that team (either via profiles.team_id OR a coach_teams row).
 * If `targetTeamId` is null we fall back to profiles.team_id (primary team).
 */
async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Aðeins staff getur gert þetta", status: 403 };

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach er ekki tengdur liði", status: 400 };

  // If no specific team requested, use primary
  if (!targetTeamId) return { userId, teamId: primaryTeamId };

  // Requested team is same as primary — fine
  if (targetTeamId === primaryTeamId) return { userId, teamId: targetTeamId };

  // Check coach_teams for access to the requested team
  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();

  if (!coachRow)
    return { error: "Þú hefur ekki aðgang að þessu liði", status: 403 };

  return { userId, teamId: targetTeamId };
}

// ── GET ────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Optional ?team_id= so multi-team coaches can list sets for a specific team
  const requestedTeamId = req.nextUrl.searchParams.get("team_id") || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const supabase = getSupabase();

  // Determine whether the team is a personal-trainer team. For PT teams,
  // every custom template is private to its creator — two PTs on the same
  // internal team (or any future cross-PT sharing) must never see each
  // other's programmes. For football/team coaches the whole staff shares
  // the template library, so no extra filter is applied.
  const { data: teamRow } = await supabase
    .from("teams")
    .select("team_type")
    .eq("id", auth.teamId)
    .maybeSingle();
  const isPtTeam = String((teamRow as { team_type?: string } | null)?.team_type ?? "").toLowerCase()
    === "personal_trainer";

  // ?table_name=xxx  →  return GREEN records for that table (for editing)
  const table_name = req.nextUrl.searchParams.get("table_name");
  if (table_name) {
    if (!/^[a-z][a-z0-9_]*$/.test(table_name))
      return NextResponse.json({ ok: false, error: "Ógilt table_name" }, { status: 400 });

    // PT ownership check — the metadata row for this table must belong to
    // the calling trainer. Otherwise return 403 (don't leak existence with
    // a 404). Bypass for non-PT teams: any team coach may read team-level
    // templates.
    if (isPtTeam) {
      const { data: ownerRow } = await supabase
        .from("custom_template_sets")
        .select("created_by")
        .eq("team_id", auth.teamId)
        .eq("table_name", table_name)
        .maybeSingle();
      const ownerId = (ownerRow as { created_by?: string | null } | null)?.created_by ?? null;
      if (ownerId && ownerId !== auth.userId) {
        return NextResponse.json({ ok: false, error: "Engin heimild" }, { status: 403 });
      }
    }

    const season_phase = req.nextUrl.searchParams.get("season_phase") || undefined;

    const rpcParams: Record<string, unknown> = {
      p_table_name: table_name,
      p_team_id:    auth.teamId,
    };
    if (season_phase) rpcParams.p_season_phase = season_phase;

    const { data: records, error: rErr } = await supabase.rpc("read_custom_template_records", rpcParams);
    if (rErr) return NextResponse.json({ ok: false, error: rErr.message }, { status: 500 });

    // Return only GREEN records so UI can pre-populate the builder
    const green = (records ?? []).filter((r: { readiness_level: string }) => r.readiness_level === "GREEN");
    return NextResponse.json({ ok: true, records: green });
  }

  // No table_name  →  list all sets (metadata only).
  // Splits team templates (player_id IS NULL) vs player overrides (player_id NOT NULL)
  // so the UI can render them in separate sections.
  //
  // PT teams: scope by created_by so each PT sees only their own templates.
  // Non-PT teams: list everything for the team.
  let listQuery = supabase
    .from("custom_template_sets")
    .select(
      "id, set_name, sport, gender, season_phase, table_name, md_days, created_at, " +
        "player_id, parent_table_name, start_date, end_date, note, created_by",
    )
    .eq("team_id", auth.teamId)
    .order("created_at", { ascending: false });
  if (isPtTeam) {
    // Show rows the caller authored OR legacy rows without created_by (so
    // pre-migration work isn't orphaned). Other PTs' rows are hidden.
    listQuery = listQuery.or(`created_by.eq.${auth.userId},created_by.is.null`);
  }
  const { data, error } = await listQuery;

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Supabase-generated types don't yet know about the new player override columns,
  // so cast to a permissive shape. Schema is enforced in the migration + DB layer.
  const all = ((data ?? []) as unknown) as Array<Record<string, unknown> & { player_id?: string | null }>;
  const team = all.filter((r) => !r.player_id);
  const player = all.filter((r) => !!r.player_id);

  // For player templates, hydrate the player name in a single batched lookup
  let playerNameById: Record<string, string> = {};
  if (player.length > 0) {
    const ids = Array.from(new Set(player.map((r) => r.player_id).filter(Boolean) as string[]));
    if (ids.length > 0) {
      const { data: players } = await supabase
        .from("players")
        .select("id, full_name")
        .in("id", ids);
      playerNameById = Object.fromEntries(
        ((players ?? []) as Array<{ id: string; full_name: string }>).map((p) => [p.id, p.full_name]),
      );
    }
  }
  const playerHydrated = player.map((r) => ({
    ...r,
    player_name: r.player_id ? playerNameById[r.player_id as string] ?? null : null,
  }));

  return NextResponse.json({ ok: true, sets: team, playerSets: playerHydrated });
}

// ── POST ───────────────────────────────────────────────────────────────────────
type PostBody = {
  team_id?: string | null;  // optional — for multi-team coaches
  set_name: string;
  sport: string;
  gender?: string | null;
  season_phase?: string | null;
  table_name: string;   // pre-computed slug from client
  md_days: string[];
  records: Array<{
    md_day: string;
    readiness_level: string;
    title: string;
    description?: string;
    structure: unknown[];
    variant: string;
  }>;

  // Player override fields (all four required together, all four NULL together)
  player_id?: string | null;
  parent_table_name?: string | null;
  start_date?: string | null;   // YYYY-MM-DD
  end_date?:   string | null;   // YYYY-MM-DD
  note?:       string | null;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<PostBody>;
  // Allow multi-team coaches to save for a specific team
  const requestedTeamId = (body.team_id ?? "").trim() || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const set_name     = (body.set_name   ?? "").trim();
  const sport        = (body.sport      ?? "").trim();
  const gender       = body.gender === "M" || body.gender === "F" ? body.gender : null;
  const table_name   = (body.table_name ?? "").trim().toLowerCase();
  const md_days      = Array.isArray(body.md_days) ? body.md_days : [];
  const records      = Array.isArray(body.records) ? body.records : [];
  const VALID_PHASES = ["preseason", "inseason", "playoffs", "offseason"] as const;
  const season_phase = VALID_PHASES.includes(body.season_phase as typeof VALID_PHASES[number])
    ? body.season_phase as string
    : null;

  // Optional player-scope payload — all four required together
  const player_id         = (body.player_id ?? "").trim() || null;
  const parent_table_name = (body.parent_table_name ?? "").trim().toLowerCase() || null;
  const start_date        = (body.start_date ?? "").trim() || null;
  const end_date          = (body.end_date ?? "").trim() || null;
  const note              = (body.note ?? "").trim() || null;

  if (!set_name || !sport || !table_name)
    return NextResponse.json({ ok: false, error: "set_name, sport og table_name vantar" }, { status: 400 });

  if (!/^[a-z][a-z0-9_]*$/.test(table_name))
    return NextResponse.json({ ok: false, error: "Ógilt table_name — aðeins lágstafir, tölur og _" }, { status: 400 });

  if (records.length === 0)
    return NextResponse.json({ ok: false, error: "Engar færslur til að vista" }, { status: 400 });

  // Validate player-scope fields — must be all-or-none
  if (player_id || parent_table_name || start_date || end_date) {
    if (!player_id || !parent_table_name || !start_date || !end_date) {
      return NextResponse.json(
        { ok: false, error: "Player template krefst player_id, parent_table_name, start_date og end_date." },
        { status: 400 },
      );
    }
    if (!/^[a-z][a-z0-9_]*$/.test(parent_table_name)) {
      return NextResponse.json({ ok: false, error: "Ógilt parent_table_name." }, { status: 400 });
    }
    const sd = Date.parse(start_date);
    const ed = Date.parse(end_date);
    if (!Number.isFinite(sd) || !Number.isFinite(ed)) {
      return NextResponse.json({ ok: false, error: "Ógildar dagsetningar." }, { status: 400 });
    }
    if (sd > ed) {
      return NextResponse.json({ ok: false, error: "start_date verður að vera ≤ end_date." }, { status: 400 });
    }
  }

  const supabase = getSupabase();

  // 1) Create the dynamic table
  const { error: createErr } = await supabase.rpc("create_custom_microdose_table", {
    p_table_name: table_name,
  });
  if (createErr) return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });

  // 2) Save records (with season_phase so the RPC uses correct ON CONFLICT)
  const saveParams: Record<string, unknown> = {
    p_table_name: table_name,
    p_team_id:    auth.teamId,
    p_records:    records as unknown as string,
  };
  if (season_phase) saveParams.p_season_phase = season_phase;

  const { error: saveErr } = await supabase.rpc("save_custom_template_records", saveParams);
  if (saveErr) return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });

  // 3) Upsert metadata — merge md_days so existing days are preserved
  // First read current md_days if set already exists
  let existingQuery = supabase
    .from("custom_template_sets")
    .select("md_days")
    .eq("team_id", auth.teamId)
    .eq("table_name", table_name);
  if (season_phase) {
    existingQuery = existingQuery.eq("season_phase", season_phase);
  } else {
    existingQuery = existingQuery.is("season_phase", null);
  }
  const { data: existing } = await existingQuery.maybeSingle();

  const existingDays: string[] = Array.isArray(existing?.md_days) ? existing.md_days : [];
  const mergedDays = Array.from(new Set([...existingDays, ...md_days]));

  const { error: metaErr } = await supabase
    .from("custom_template_sets")
    .upsert(
      {
        team_id:           auth.teamId,
        set_name,
        sport,
        gender,
        season_phase,
        table_name,
        md_days:           mergedDays,
        created_by:        auth.userId,
        // Player override fields — NULL on team templates
        player_id,
        parent_table_name,
        start_date,
        end_date,
        note,
      },
      { onConflict: "team_id,table_name,season_phase" }
    );
  if (metaErr) return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    table_name,
    records_saved: records.length,
    md_days_total: mergedDays,
  });
}
