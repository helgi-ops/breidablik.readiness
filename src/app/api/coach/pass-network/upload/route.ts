export const runtime = "nodejs";

/**
 * /api/coach/pass-network/upload — the two StatsBomb OBV passing exports.
 *
 * Two-phase, multipart/form-data (file + fields season?, team_id?, match_date):
 *   phase="preview" → parse, tag each row own/opp (own = the coach's team), resolve
 *                     own-side names to the squad, return a summary. NO writes.
 *   phase="commit"  → upsert into sb_match_player_passing (Pass network, per-player)
 *                     or sb_pass_combinations (Passing Combinations, edges).
 *
 * Both files carry no Match/Date column, so the coach supplies match_date. Descriptive
 * football data — never touches the readiness colour. Coach-scoped, service-role writes.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { isEliteTeam, ELITE_REQUIRED_RESPONSE } from "@/lib/micropulse/elite";
import { normTeam } from "@/lib/micropulse/statsIngestion/wyscoutTeamStats";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import type { SquadPlayer } from "@/lib/micropulse/statsIngestion/types";
import { isStatsbombPassNetworkHeader, parseStatsbombPassNetwork } from "@/lib/micropulse/statsIngestion/statsbombPassNetwork";
import { isStatsbombPassCombinationsHeader, parseStatsbombPassCombinations } from "@/lib/micropulse/statsIngestion/statsbombPassCombinations";

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const userId = userRes.user.id;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userId).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach not linked to a team", status: 400 } as const;
  if (!targetTeamId || targetTeamId === primaryTeamId) return { userId, teamId: primaryTeamId } as const;
  const { data: coachRow } = await supabase.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", targetTeamId).maybeSingle();
  if (!coachRow) return { error: "No access to that team", status: 403 } as const;
  return { userId, teamId: targetTeamId } as const;
}

type Row = Record<string, unknown>;
function readRows(buf: ArrayBuffer): Row[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true });
}

/** The coach's team aliases (team name + any sb_team_map names) for own/opp tagging. */
async function ownTeamAliases(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<Set<string>> {
  const set = new Set<string>();
  const { data: t } = await supabase.from("teams").select("name").eq("id", teamId).maybeSingle();
  const nm = (t as { name?: string } | null)?.name;
  if (nm) set.add(normTeam(nm));
  const { data: maps } = await supabase.from("sb_team_map").select("sb_name").eq("team_id", teamId);
  for (const m of (maps ?? []) as Array<{ sb_name: string }>) if (m.sb_name) set.add(normTeam(m.sb_name));
  return set;
}

async function loadSquad(supabase: ReturnType<typeof getSupabase>, teamId: string): Promise<SquadPlayer[]> {
  const { data } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; is_active: boolean | null }>)
    .filter((p) => p.is_active !== false)
    .map((p) => ({ id: p.id, fullName: p.full_name ?? "—" }));
}

/** name → player_id for exact (initial, surname) matches only (own side). */
function resolveRefs(names: Set<string>, squad: SquadPlayer[]): Map<string, string> {
  const byName = new Map<string, string>();
  for (const name of names) {
    const m = matchByInitialSurname(name, squad);
    if (m.playerId && m.confidence === "exact") byName.set(name, m.playerId);
  }
  return byName;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const phase = String(form.get("phase") ?? "preview");
  const matchDate = String(form.get("match_date") ?? "").trim();
  const requestedTeamId = String(form.get("team_id") ?? "").trim() || null;
  const file = form.get("file");

  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (!(await isEliteTeam(getSupabase(), auth.teamId))) return NextResponse.json(ELITE_REQUIRED_RESPONSE.body, { status: ELITE_REQUIRED_RESPONSE.status });
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return NextResponse.json({ ok: false, error: "A match date (YYYY-MM-DD) is required — these files carry no date." }, { status: 400 });

  const rows = readRows(await file.arrayBuffer());
  const headers = rows.length ? Object.keys(rows[0] as Row) : [];
  const isCombos = isStatsbombPassCombinationsHeader(headers);
  const isNetwork = !isCombos && isStatsbombPassNetworkHeader(headers);
  if (!isCombos && !isNetwork) {
    return NextResponse.json({ ok: false, error: "Not a StatsBomb Pass network (Team/Player/Passes/OBV) or Passing Combinations (Team/Passer/Receiver/Passes/OBV) file." }, { status: 400 });
  }

  const supabase = getSupabase();
  const aliases = await ownTeamAliases(supabase, auth.teamId);
  const isOwn = (team: string) => aliases.has(normTeam(team));
  const squad = await loadSquad(supabase, auth.teamId);

  if (isNetwork) {
    const { players, skipped } = parseStatsbombPassNetwork(rows);
    const ownNames = new Set(players.filter((p) => isOwn(p.teamName)).map((p) => p.playerName));
    const refToId = resolveRefs(ownNames, squad);
    const dbRows = players.map((p) => {
      const own = isOwn(p.teamName);
      return {
        team_id: auth.teamId, match_date: matchDate, source: "statsbomb", side: own ? "own" : "opp",
        team_name: p.teamName, player_name: p.playerName, player_ref: p.playerRef,
        player_id: own ? (refToId.get(p.playerName) ?? null) : null,
        passes: p.passes, obv: p.obv, raw: p.raw, updated_at: new Date().toISOString(),
      };
    });
    // Collapse duplicate keys (last wins) so the batch upsert doesn't abort.
    const byKey = new Map<string, (typeof dbRows)[number]>();
    for (const r of dbRows) byKey.set(`${r.side}|${r.player_ref}`, r);
    const own = dbRows.filter((r) => r.side === "own");
    if (phase === "preview") {
      return NextResponse.json({ ok: true, phase: "preview", kind: "pass_network", players: dbRows.length, own: own.length, opp: dbRows.length - own.length, mapped: own.filter((r) => r.player_id).length, skipped });
    }
    const { error } = await supabase.from("sb_match_player_passing").upsert([...byKey.values()] as never, { onConflict: "team_id,match_date,source,side,player_ref" });
    if (error) return NextResponse.json({ ok: false, error: `Upsert: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "commit", kind: "pass_network", rowsUpserted: byKey.size, mapped: own.filter((r) => r.player_id).length });
  }

  // Passing combinations (edges).
  const { combinations, skipped } = parseStatsbombPassCombinations(rows);
  const ownNames = new Set<string>();
  for (const c of combinations) if (isOwn(c.teamName)) { ownNames.add(c.passerName); ownNames.add(c.receiverName); }
  const refToId = resolveRefs(ownNames, squad);
  const dbRows = combinations.map((c) => {
    const own = isOwn(c.teamName);
    return {
      team_id: auth.teamId, match_date: matchDate, source: "statsbomb", side: own ? "own" : "opp",
      team_name: c.teamName,
      passer_name: c.passerName, passer_ref: c.passerRef, passer_player_id: own ? (refToId.get(c.passerName) ?? null) : null,
      receiver_name: c.receiverName, receiver_ref: c.receiverRef, receiver_player_id: own ? (refToId.get(c.receiverName) ?? null) : null,
      passes: c.passes, obv: c.obv, raw: c.raw, updated_at: new Date().toISOString(),
    };
  });
  const byKey = new Map<string, (typeof dbRows)[number]>();
  for (const r of dbRows) byKey.set(`${r.side}|${r.passer_ref}|${r.receiver_ref}`, r);
  const own = dbRows.filter((r) => r.side === "own");
  if (phase === "preview") {
    return NextResponse.json({ ok: true, phase: "preview", kind: "pass_combinations", edges: dbRows.length, own: own.length, opp: dbRows.length - own.length, mappedPlayers: refToId.size, skipped });
  }
  const { error } = await supabase.from("sb_pass_combinations").upsert([...byKey.values()] as never, { onConflict: "team_id,match_date,source,side,passer_ref,receiver_ref" });
  if (error) return NextResponse.json({ ok: false, error: `Upsert: ${error.message}` }, { status: 500 });
  return NextResponse.json({ ok: true, phase: "commit", kind: "pass_combinations", rowsUpserted: byKey.size, mappedPlayers: refToId.size });
}
