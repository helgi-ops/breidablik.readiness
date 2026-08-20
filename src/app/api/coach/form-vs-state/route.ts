export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/form-vs-state
 *   ?list=1                 → active players who have per-match tactical output (picker)
 *   ?playerId=&lang=        → the "Form vs State" read for one player
 *
 * Reads a player's recent per-match tactical output (OBV) against his READINESS colour on
 * each match date + match CONTEXT (home/away, result, opponent level), and tags whether a
 * recent trend is a genuine form change or a state/context artifact. Football / StatsBomb.
 * ADVISORY / READ-ONLY — never reads-as or writes the readiness colour or the daily decision.
 *
 * Data note: per-match minutes are not populated, so the match OBV total (≈ a starter's
 * per-90 rate) is compared to his season OBV per-90 norm — an honest approximation, imperfect
 * for part-appearances. Sparse per-match data today → most players read "not enough matches".
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeFormVsState, type TaggedMatch, type OpponentLevel } from "@/lib/micropulse/formVsState";

type AuthProfile = { role: string | null; team_id: string | null };
const WINDOW = 12;                 // most-recent matches considered
const OBV_KEY = "OBV";

function env(name: string): string { const v = process.env[name]; if (!v) throw new Error(`Missing env: ${name}`); return v; }
function getAdminClient() { return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } }); }
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const resultOf = (gf: number | null, ga: number | null): "W" | "D" | "L" | null => (gf == null || ga == null ? null : gf > ga ? "W" : gf < ga ? "L" : "D");
/** Besta deild = 12 teams: top third high, middle med, bottom low. Unknown when unscouted. */
const levelOf = (pos: number | null): OpponentLevel | null => (pos == null ? null : pos <= 4 ? "high" : pos <= 8 ? "med" : "low");

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof, error: profErr } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  if (profErr) throw new Error(profErr.message);
  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

const obvOf = (metrics: unknown): number | null => (metrics && typeof metrics === "object" ? num((metrics as Record<string, unknown>)[OBV_KEY]) : null);

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const sb = getAdminClient();
    const url = new URL(req.url);

    // ── Picker: active players who have at least one per-match OBV row ──
    if (url.searchParams.get("list")) {
      const { data: pmRows } = await sb.from("player_match_stats")
        .select("player_id, metrics").eq("team_id", teamId).not("player_id", "is", null);
      const count = new Map<string, number>();
      for (const r of (pmRows ?? []) as Array<Record<string, unknown>>) {
        if (obvOf(r.metrics) == null) continue;
        const pid = String(r.player_id ?? ""); if (pid) count.set(pid, (count.get(pid) ?? 0) + 1);
      }
      const ids = [...count.keys()];
      if (!ids.length) return NextResponse.json({ ok: true, players: [] });
      const { data: pl } = await sb.from("players").select("id, full_name, position").in("id", ids).eq("is_active", true);
      const players = ((pl ?? []) as Array<Record<string, unknown>>)
        .map((p) => ({ playerId: String(p.id), name: (p.full_name as string) ?? "—", position: (p.position as string) ?? null, matches: count.get(String(p.id)) ?? 0 }))
        .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
      return NextResponse.json({ ok: true, players });
    }

    const playerId = (url.searchParams.get("playerId") ?? "").trim();
    if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });

    const { data: me } = await sb.from("players").select("id, full_name, position").eq("id", playerId).eq("team_id", teamId).maybeSingle();
    if (!me) return NextResponse.json({ ok: false, error: "Player not on this team." }, { status: 404 });

    // Per-match output rows (one per match_date; prefer the row carrying OBV).
    const { data: pmData } = await sb.from("player_match_stats")
      .select("match_date, opponent, home_away, minutes, xg, duels_won, metrics")
      .eq("team_id", teamId).eq("player_id", playerId).order("match_date", { ascending: false });
    const byDate = new Map<string, Record<string, unknown>>();
    for (const r of (pmData ?? []) as Array<Record<string, unknown>>) {
      const d = String(r.match_date ?? ""); if (!d) continue;
      const prev = byDate.get(d);
      if (!prev || (obvOf(prev.metrics) == null && obvOf(r.metrics) != null)) byDate.set(d, r);
    }
    const rows = [...byDate.values()].sort((a, b) => (String(a.match_date) < String(b.match_date) ? 1 : -1)).slice(0, WINDOW);
    const dates = rows.map((r) => String(r.match_date));

    // Baseline: his season OBV (already per-90).
    const { data: seasonRows } = await sb.from("player_season_stats")
      .select("metrics, source").eq("team_id", teamId).eq("player_id", playerId);
    let baseline: number | null = null;
    for (const s of (seasonRows ?? []) as Array<Record<string, unknown>>) { const v = obvOf(s.metrics); if (v != null) { baseline = v; break; } }

    // Readiness colour on each match date + schedule results + opponent levels (parallel).
    const [readRes, schedRes, scoutRes] = await Promise.all([
      dates.length ? sb.from("readiness_entries").select("entry_date, color, is_imputed").eq("team_id", teamId).eq("player_id", playerId).in("entry_date", dates) : Promise.resolve({ data: [] }),
      sb.from("match_schedule").select("match_date, goals_for, goals_against").eq("team_id", teamId),
      sb.from("scout_team_season").select("opponent_name, league_position").eq("owner_team_id", teamId).not("league_position", "is", null),
    ]);
    const readByDate = new Map<string, { color: string | null; imputed: boolean }>();
    for (const r of (readRes.data ?? []) as Array<Record<string, unknown>>) readByDate.set(String(r.entry_date), { color: (r.color as string) ?? null, imputed: r.is_imputed === true });
    const resByDate = new Map<string, "W" | "D" | "L" | null>();
    for (const r of (schedRes.data ?? []) as Array<Record<string, unknown>>) resByDate.set(String(r.match_date), resultOf(num(r.goals_for), num(r.goals_against)));
    const levelByOpp = new Map<string, OpponentLevel | null>();
    for (const r of (scoutRes.data ?? []) as Array<Record<string, unknown>>) levelByOpp.set(String(r.opponent_name).toLowerCase(), levelOf(num(r.league_position)));

    const matches: TaggedMatch[] = rows.map((r) => {
      const d = String(r.match_date);
      const rd = readByDate.get(d) ?? { color: null, imputed: false };
      const opp = (r.opponent as string) ?? null;
      const output = obvOf(r.metrics);
      return {
        date: d, opponent: opp, output, outputPer90: output, minutes: num(r.minutes),
        readinessColor: rd.color, readinessImputed: rd.imputed,
        homeAway: (r.home_away as "home" | "away") ?? null,
        result: resByDate.get(d) ?? null,
        opponentLevel: opp ? (levelByOpp.get(opp.toLowerCase()) ?? null) : null,
      };
    });

    const read = computeFormVsState({
      playerId, name: (me.full_name as string) ?? "—", position: (me.position as string) ?? null,
      primaryMetric: { key: OBV_KEY, label: { en: "OBV", is: "OBV" } },
      baselinePer90: baseline, matches,
    });

    return NextResponse.json({ ok: true, player: { id: playerId, name: me.full_name, position: me.position }, read });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("team") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
