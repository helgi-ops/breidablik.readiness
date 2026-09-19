/**
 * /api/coach/ksi-report?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * GET — GPS + IMA external-load summary per player over a date window, for the
 * authenticated coach's team. Powers the KSÍ report (national-team / youth
 * national-team call-up load summary). Aggregates the window per player and
 * returns the per-session (daily) breakdown for the detail view.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { EXCLUDE_PREV_CLUB_OR } from "@/lib/micropulse/load/previousClub";

export const runtime = "nodejs";


async function authenticate(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase
    .from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = prof?.team_id as string | null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId, supabase, userId: userRes.user.id } as const;
}

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// ── KSÍ call-up sections: injuries/factors + individual strength/prevention programme ──
// Pre-filled from player_injuries; the coach edits + confirms before sending (medical info
// leaving the club is coach-curated — see injury-status-coach-only). Icelandic, since KSÍ is
// the Icelandic federation and the request came in Icelandic; the coach can rewrite freely.
type InjuryRow = {
  player_id: string; injury_date: string | null; body_part: string | null; injury_type: string | null;
  severity: string | null; status: string | null; rtp_stage: string | null;
  estimated_return_date: string | null; actual_return_date: string | null;
};
const STATUS_IS: Record<string, string> = {
  injured: "meiddur", rehabilitation: "endurhæfing", rtp_training: "RTP-þjálfun", cleared: "laus",
};
const ACTIVE_STATUS = new Set(["injured", "rehabilitation", "rtp_training"]);

function injuryAutoText(r: InjuryRow | undefined): string {
  if (!r) return "Engin meiðsli skráð.";
  const area = [r.body_part, r.injury_type].filter(Boolean).join(" – ");
  if (r.status === "cleared" || (!ACTIVE_STATUS.has(String(r.status)) && r.actual_return_date)) {
    return area
      ? `Laus við meiðsli. Síðasta: ${area}${r.actual_return_date ? `, grætt ${r.actual_return_date}` : ""}.`
      : "Laus við meiðsli.";
  }
  const bits = [
    area || "meiðsli",
    r.injury_date ? `(frá ${r.injury_date})` : "",
    `Staða: ${STATUS_IS[String(r.status)] ?? r.status ?? "óþekkt"}`,
    r.rtp_stage ? `RTP-stig ${r.rtp_stage}` : "",
    r.estimated_return_date ? `áætluð endurkoma ${r.estimated_return_date}` : "",
  ].filter(Boolean);
  return bits.join(" · ") + ".";
}
// Latest movement-screen readings → corrective / prehab lines (finding → corrective lever).
type ScreenLite = {
  player_id: string; screen_date: string | null; red_flag: boolean | null;
  result: { readings?: Array<{ finding?: Bi | null; lever?: Bi | null }> } | null;
};
type Bi = { en?: string | null; is?: string | null };
function screenCorrectiveText(s: ScreenLite | undefined): string | null {
  if (!s) return null;
  if (s.red_flag) return "⚠️ Hreyfiskimun: rautt flagg skráð — vísa til klíníkers (engin túlkun hér).";
  const items = (s.result?.readings ?? [])
    .slice(0, 4)
    .map((r) => {
      const f = r.finding?.is ?? r.finding?.en ?? "";
      const l = r.lever?.is ?? r.lever?.en ?? "";
      return f && l ? `${f} → ${l}` : (l || f);
    })
    .filter(Boolean);
  return items.length ? `Hreyfiskimun${s.screen_date ? ` (${s.screen_date})` : ""}: ${items.join("; ")}.` : null;
}

function programAutoText(r: InjuryRow | undefined, screenText: string | null): string {
  const parts: string[] = [];
  const active = r && (ACTIVE_STATUS.has(String(r.status)) || r.rtp_stage);
  if (active) parts.push(`Fylgir endurhæfingar-/RTP-prógrammi${r?.rtp_stage ? ` (stig ${r.rtp_stage})` : ""}; samræma við sjúkraþjálfara — ekki fullt álag án samráðs.`);
  if (screenText) parts.push(screenText);
  if (!parts.length) parts.push("Fylgir almennu styrktaráætlun liðsins — Kári hefur umsjón.");
  return parts.join("\n");
}

type DayMetrics = {
  date: string;
  duration_min: number;
  total_distance: number;
  hsr: number;
  sprint: number;
  player_load: number;
  accels: number;
  decels: number;
  max_vel_kmh: number;
  ima_hsr: number; // band 5-8 total distance
  band5: number;
  band6: number;
  band7: number;
  band8: number;
  ima_acc: number; // inertial accelerations
  ima_dec: number; // inertial decelerations
  cod: number;     // inertial change-of-direction events (L+R, all tiers)
  jumps: number;   // inertial jump count (Catapult IMA)
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
// Top speed is km/h. The fastest footballers reach ~36 km/h; values above 45
// are GPS glitches (e.g. one 132 km/h training spike) — drop them to 0.
const plausibleKmh = (v: number) => (v > 45 ? 0 : v);

export async function GET(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(req.url);
  const today = new Date().toISOString().slice(0, 10);
  const toParam = url.searchParams.get("to");
  const fromParam = url.searchParams.get("from");
  const to = toParam && isIso(toParam) ? toParam : today;
  const from = fromParam && isIso(fromParam)
    ? fromParam
    : new Date(Date.parse(to + "T00:00:00Z") - 13 * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await ctx.supabase
    .from("player_external_load_daily")
    .select(
      "player_id, date, session_duration_minutes, total_distance, high_speed_distance, sprint_distance, " +
        "total_player_load, accelerations, decelerations, max_velocity, " +
        "ima_accel, ima_decel, " +
        "ima_cod_left_high, ima_cod_left_medium, ima_cod_left_low, " +
        "ima_cod_right_high, ima_cod_right_medium, ima_cod_right_low, " +
        "ima_fr_band58_total_distance, ima_fr_band5_total_distance, ima_fr_band6_total_distance, " +
        "ima_fr_band7_total_distance, ima_fr_band8_total_distance, jumps, players!inner(full_name, team_id)",
    )
    .eq("source", "catapult")
    .eq("players.team_id", ctx.teamId)
    .or(EXCLUDE_PREV_CLUB_OR) // federation report = load accrued at THIS club — exclude pre-transfer rows
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = Record<string, unknown> & {
    player_id: string;
    date: string;
    players: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  const byPlayer = new Map<string, { name: string; days: DayMetrics[] }>();
  for (const r of (data ?? []) as unknown as Row[]) {
    const p = Array.isArray(r.players) ? r.players[0] : r.players;
    if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, { name: (p?.full_name ?? "—").trim(), days: [] });
    byPlayer.get(r.player_id)!.days.push({
      date: r.date,
      duration_min: Math.round(num(r.session_duration_minutes)),
      total_distance: num(r.total_distance),
      hsr: num(r.high_speed_distance),
      sprint: num(r.sprint_distance),
      player_load: num(r.total_player_load),
      accels: Math.round(num(r.accelerations)),
      decels: Math.round(num(r.decelerations)),
      max_vel_kmh: plausibleKmh(num(r.max_velocity)), // already km/h — do NOT ×3.6; clamp GPS glitches
      ima_hsr: num(r.ima_fr_band58_total_distance),
      band5: num(r.ima_fr_band5_total_distance),
      band6: num(r.ima_fr_band6_total_distance),
      band7: num(r.ima_fr_band7_total_distance),
      band8: num(r.ima_fr_band8_total_distance),
      ima_acc: Math.round(num(r.ima_accel)),
      ima_dec: Math.round(num(r.ima_decel)),
      cod: Math.round(
        num(r.ima_cod_left_high) + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low) +
        num(r.ima_cod_right_high) + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low),
      ),
      jumps: Math.round(num(r.jumps)),
    });
  }

  const players = Array.from(byPlayer.entries()).map(([player_id, { name, days }]) => {
    const sum = (k: keyof DayMetrics) => days.reduce((s, d) => s + (d[k] as number), 0);
    return {
      player_id,
      full_name: name,
      sessions: days.length,
      agg: {
        total_distance: Math.round(sum("total_distance")),
        hsr: Math.round(sum("hsr")),
        sprint: Math.round(sum("sprint")),
        player_load: Math.round(sum("player_load")),
        accels: sum("accels"),
        decels: sum("decels"),
        max_vel_kmh: Math.round(Math.max(0, ...days.map((d) => d.max_vel_kmh)) * 10) / 10,
        ima_hsr: Math.round(sum("ima_hsr")),
        band5: Math.round(sum("band5")),
        band6: Math.round(sum("band6")),
        band7: Math.round(sum("band7")),
        band8: Math.round(sum("band8")),
        ima_acc: sum("ima_acc"),
        ima_dec: sum("ima_dec"),
        cod: sum("cod"),
        jumps: sum("jumps"),
      },
      days: days.map((d) => ({ ...d, max_vel_kmh: Math.round(d.max_vel_kmh * 10) / 10 })),
    };
  });
  players.sort((a, b) => a.full_name.localeCompare(b.full_name, "is"));

  // KSÍ sections — injuries/factors + individual programme, per player. Latest injury row
  // per player (for the team), plus any coach-saved note (which overrides the auto text).
  const ids = players.map((p) => p.player_id);
  const injByPlayer = new Map<string, InjuryRow>();
  const notesByPlayer = new Map<string, { injury_note: string | null; program_note: string | null }>();
  const screenByPlayer = new Map<string, ScreenLite>();
  if (ids.length) {
    const { data: injRows } = await ctx.supabase
      .from("player_injuries")
      .select("player_id, injury_date, body_part, injury_type, severity, status, rtp_stage, estimated_return_date, actual_return_date")
      .eq("team_id", ctx.teamId).in("player_id", ids)
      .order("injury_date", { ascending: false });
    for (const r of (injRows ?? []) as InjuryRow[]) if (!injByPlayer.has(r.player_id)) injByPlayer.set(r.player_id, r); // first = latest
    const { data: noteRows } = await ctx.supabase
      .from("player_ksi_notes").select("player_id, injury_note, program_note").in("player_id", ids);
    for (const r of (noteRows ?? []) as Array<{ player_id: string; injury_note: string | null; program_note: string | null }>)
      notesByPlayer.set(r.player_id, { injury_note: r.injury_note, program_note: r.program_note });
    // Latest movement screen per player → corrective / prehab levers for the programme section.
    const { data: scrRows } = await ctx.supabase
      .from("movement_screens")
      .select("player_id, screen_date, red_flag, result")
      .eq("team_id", ctx.teamId).in("player_id", ids)
      .order("screen_date", { ascending: false });
    for (const r of (scrRows ?? []) as ScreenLite[]) if (!screenByPlayer.has(r.player_id)) screenByPlayer.set(r.player_id, r); // first = latest
  }

  const playersOut = players.map((p) => {
    const inj = injByPlayer.get(p.player_id);
    const saved = notesByPlayer.get(p.player_id);
    return {
      ...p,
      injuryAuto: injuryAutoText(inj),
      programAuto: programAutoText(inj, screenCorrectiveText(screenByPlayer.get(p.player_id))),
      injuryNote: saved?.injury_note ?? null,
      programNote: saved?.program_note ?? null,
    };
  });

  return NextResponse.json({ from, to, players: playersOut });
}

// Save a player's coach-curated KSÍ notes (injury/factors + individual programme).
export async function POST(req: NextRequest) {
  const ctx = await authenticate(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  let body: { playerId?: string; injuryNote?: string | null; programNote?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  const playerId = String(body.playerId ?? "");
  if (!playerId) return NextResponse.json({ error: "playerId required" }, { status: 400 });

  // Player must belong to the coach's team.
  const { data: player } = await ctx.supabase.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  if (!player || (player as { team_id?: string }).team_id !== ctx.teamId) {
    return NextResponse.json({ error: "Player not on your team" }, { status: 404 });
  }
  const injuryNote = body.injuryNote == null ? null : String(body.injuryNote).slice(0, 4000);
  const programNote = body.programNote == null ? null : String(body.programNote).slice(0, 4000);
  const { error } = await ctx.supabase.from("player_ksi_notes").upsert(
    { player_id: playerId, team_id: ctx.teamId, injury_note: injuryNote, program_note: programNote, updated_at: new Date().toISOString(), updated_by: ctx.userId },
    { onConflict: "player_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
