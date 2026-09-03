/**
 * POST /api/coach/load/peak-context/upload  (multipart)
 *   playerEvents  (File, required) — Wyscout "Download SportsCode XML" for PLAYER events
 *   teamEvents    (File, optional) — the TEAM-events XML (tactical-phase labels)
 *   match_date    (required)
 *   half_time_gap_s   (optional, default 900)  — half-time length on the Catapult session clock
 *   first_half_end_s  (optional, default 2850) — session-clock second where H1 ends (incl. stoppage)
 *
 * The physical × tactical FUSION read, made repeatable for coaches. Aligns the already-loaded
 * Catapult peak windows (player_peak_window, with a kickoff-relative clock) to the time-stamped
 * Wyscout events: for each of a player's peak windows it reports his on-ball actions in that window
 * (peakPeriodContext) + the team's tactical phase around it (labelsInWindow).
 *
 * Clock note: the Catapult window clock is real elapsed (includes half-time); Wyscout play-time
 * removes it. First-half windows align exactly; SECOND-half windows are shifted back by
 * half_time_gap_s to the Wyscout play-time clock and flagged "approx" (never faked).
 *
 * On success the computed read is SAVED (peak_context_reads, one per team+match; re-upload
 * replaces it) so the team overview + player bars reappear on page load without re-uploading.
 * Descriptive tactical context; never the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { parseSportscodeXml, decodeSportscodeBuffer, labelsInWindow } from "@/lib/micropulse/wyscoutEvents/parseSportscode";
import { instanceToEvent, matchCodesToPlayers } from "@/lib/micropulse/wyscoutEvents/toMatchEvents";
import { computePeakPeriodContext, type PeakWindow } from "@/lib/micropulse/peakPeriodContext";

export const runtime = "nodejs";

async function authCoachTeam(req: Request): Promise<{ sb: ReturnType<typeof getSupabaseAdmin>; teamId: string; userId: string }> {
  const sb = getSupabaseAdmin();
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const userId = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { sb, teamId, userId };
}

async function parseFile(f: FormDataEntryValue | null) {
  if (!f || typeof f === "string") return [];
  const buf = Buffer.from(await (f as File).arrayBuffer());
  return parseSportscodeXml(decodeSportscodeBuffer(buf));
}

type Bi = { en: string; is: string };
type Act = { label: Bi; count: number; offBall: boolean };

/**
 * Compose a plain "what was happening" sentence for a peak window — the Óli Valur read:
 * the team's tactical phase + the key set-piece / event context (from the team-events labels)
 * combined with his own on-ball actions. Honest phrasing of labels already present; invents nothing.
 * Returns null when there's no team-events context to narrate.
 */
function windowStory(teamLabels: Record<string, number>, actions: Act[], windowMin: number): Bi | null {
  const entries = Object.entries(teamLabels);
  if (entries.length === 0) return null;
  const sum = (re: RegExp) => entries.filter(([l]) => re.test(l.toLowerCase())).reduce((s, [, n]) => s + n, 0);
  const defend = sum(/defend/), attack = sum(/attack|possession|build/);
  const phase: Bi | null = defend > attack ? { en: "defending", is: "að verjast" }
    : attack > defend ? { en: "attacking", is: "í sókn" } : null;

  const ev: Bi[] = [];
  if (sum(/corner/) > 0) ev.push({ en: "a corner", is: "horn" });
  if (sum(/cross/) > 0) ev.push({ en: "crosses", is: "fyrirgjafir" });
  if (sum(/shot/) > 0) ev.push({ en: "a shot", is: "skot" });
  if (sum(/counter|transition/) > 0) ev.push({ en: "a transition", is: "skyndisókn" });
  if (sum(/free.?kick|set.?piece/) > 0) ev.push({ en: "a set-piece", is: "fastan leikþátt" });

  const his = [...actions].filter((a) => a.count > 0).sort((a, b) => b.count - a.count).slice(0, 2);
  const ctxEn = ev.length ? ` (${ev.map((e) => e.en).join(", ")})` : "";
  const ctxIs = ev.length ? ` (${ev.map((e) => e.is).join(", ")})` : "";
  const hisEn = his.length ? `; his ball: ${his.map((a) => a.label.en.toLowerCase()).join(", ")}` : "";
  const hisIs = his.length ? `; hans bolti: ${his.map((a) => a.label.is.toLowerCase()).join(", ")}` : "";
  const phEn = phase ? `the team was ${phase.en}` : "open play";
  const phIs = phase ? `liðið var ${phase.is}` : "opinn leikur";
  return {
    en: `${windowMin}-min peak — ${phEn}${ctxEn}${hisEn}.`,
    is: `${windowMin}-mín peak — ${phIs}${ctxIs}${hisIs}.`,
  };
}

export async function POST(req: Request) {
  let sb: ReturnType<typeof getSupabaseAdmin>, teamId: string, userId: string;
  try { ({ sb, teamId, userId } = await authCoachTeam(req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ ok: false, error: m }, { status: /forbidden/i.test(m) ? 403 : /team/i.test(m) ? 400 : 401 }); }

  const form = await req.formData();
  const matchDate = String(form.get("match_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return NextResponse.json({ ok: false, error: "match_date (YYYY-MM-DD) required" }, { status: 400 });
  const halfTimeGapS = Number(form.get("half_time_gap_s")) || 900;
  const firstHalfEndS = Number(form.get("first_half_end_s")) || 2850;

  const playerInstances = await parseFile(form.get("playerEvents"));
  const teamInstances = await parseFile(form.get("teamEvents"));
  if (playerInstances.length === 0) return NextResponse.json({ ok: false, error: "No player events parsed — is this a Wyscout SportsCode XML?" }, { status: 422 });

  // Match Wyscout player codes → roster players (by surname, unambiguous only).
  const codes = [...new Set(playerInstances.map((i) => i.code).filter(Boolean))];
  const { data: rosterData } = await sb.from("players").select("id, full_name, position").eq("team_id", teamId).eq("is_active", true);
  const roster = (rosterData ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
  const nameById = new Map(roster.map((p) => [p.id, p.full_name ?? "Player"]));
  const posById = new Map(roster.map((p) => [p.id, p.position ?? null]));
  const codeToPlayer = matchCodesToPlayers(codes, roster);

  // Peak windows with a kickoff-relative clock (window_min set = the MII peak intervals).
  const { data: pwData } = await sb
    .from("player_peak_window")
    .select("player_id, window_min, window_seconds, window_start_s_from_ko, window_label, distance_m, player_load, hsr_m")
    .eq("team_id", teamId).eq("match_date", matchDate)
    .not("window_min", "is", null).not("window_start_s_from_ko", "is", null);
  type PwRow = { player_id: string; window_min: number; window_seconds: number | null; window_start_s_from_ko: number; window_label: string | null; distance_m: number | null; player_load: number | null; hsr_m: number | null };
  const windowsByPlayer = new Map<string, PwRow[]>();
  for (const r of (pwData ?? []) as PwRow[]) {
    (windowsByPlayer.get(r.player_id) ?? windowsByPlayer.set(r.player_id, []).get(r.player_id)!).push(r);
  }

  // Starting XI for this match (match_player_minutes.started). Sparse — many matches have no
  // recorded lineup (started all null) → hasStarterData gates the client's "starters only" toggle.
  const { data: mpmData } = await sb
    .from("match_player_minutes")
    .select("player_id, started")
    .eq("team_id", teamId).eq("match_date", matchDate).eq("started", true);
  const starterIds = new Set(((mpmData ?? []) as Array<{ player_id: string }>).map((r) => r.player_id));
  const hasStarterData = starterIds.size > 0;

  const players: Array<Record<string, unknown>> = [];
  for (const [code, playerId] of codeToPlayer) {
    const wins = windowsByPlayer.get(playerId);
    if (!wins || wins.length === 0) continue;
    const hisEvents = playerInstances.filter((i) => i.code === code).map((i) => instanceToEvent(i, true));

    const windows = wins.map((w) => {
      const secondHalf = w.window_start_s_from_ko > firstHalfEndS;
      const startSec = secondHalf ? w.window_start_s_from_ko - halfTimeGapS : w.window_start_s_from_ko;
      const endSec = startSec + (w.window_seconds ?? w.window_min * 60);
      const metric = w.distance_m != null ? "distance" : w.player_load != null ? "player_load" : "hsr";
      const value = w.distance_m ?? w.player_load ?? w.hsr_m ?? null;
      const pw: PeakWindow = { windowMin: w.window_min, startSec, endSec, metric, value };
      const read = computePeakPeriodContext([pw], hisEvents);
      const teamLabels = labelsInWindow(teamInstances, startSec, endSec);
      // When he had NO on-ball events in his peak window but the feed IS present, that's an
      // off-ball peak (running/positioning) — an honest finding, not a missing feed. Reword it
      // (the engine can't tell "no feed" from "he didn't touch the ball" — it only sees his events).
      const offBallPeak = read.events === 0 && playerInstances.length > 0;
      const hasTeamCtx = Object.keys(teamLabels).length > 0;
      const verdict = offBallPeak
        ? (hasTeamCtx
            ? { en: "No on-ball actions in his peak window — his peak was off-ball (running / positioning), which event feeds can't capture. The team context below is what was happening around him.",
                is: "Engar on-ball aðgerðir í hámarksglugganum — hans peak var off-ball (hlaup / staðsetning), sem event-straumar ná ekki. Liðs-samhengið að neðan sýnir hvað var í gangi í kringum hann." }
            : { en: "No on-ball actions in his peak window — his peak was off-ball (running / positioning), which event feeds can't capture.",
                is: "Engar on-ball aðgerðir í hámarksglugganum — hans peak var off-ball (hlaup / staðsetning), sem event-straumar ná ekki." })
        : read.verdict;
      return {
        windowMin: w.window_min, metric, value,
        secondHalf, alignment: secondHalf ? "approx (half-time gap subtracted)" : "exact",
        verdict, offBallPeak, actions: read.actions, events: read.events, onBallEvents: read.onBallEvents,
        confidence: read.confidence, teamLabels,
        story: windowStory(teamLabels, read.actions, w.window_min),
      };
    });

    players.push({ playerId, name: nameById.get(playerId), position: posById.get(playerId) ?? null, started: starterIds.has(playerId), wyscoutCode: code, windows });
  }

  const payload = {
    matchDate,
    playerInstances: playerInstances.length,
    teamInstances: teamInstances.length,
    codesMatched: codeToPlayer.size,
    codesTotal: codes.length,
    hasStarterData,
    players,
    note: "Fusion read: each peak window (Catapult) × the tactical content around it (Wyscout events). First-half windows align exactly; second-half shifted by the half-time gap (flagged approx). Peak-window HSR stays gated (MII carries distance + Player Load only). Descriptive — never the readiness colour.",
  };

  // Persist so the team overview + player bars reappear on page load without re-uploading
  // (one saved read per team+match; a re-upload replaces it). Best-effort — a save failure
  // must not lose the just-computed result the coach is looking at.
  let saved = false;
  if (players.length > 0) {
    const { error: upsertErr } = await sb
      .from("peak_context_reads")
      .upsert({ team_id: teamId, match_date: matchDate, payload, created_by: userId, updated_at: new Date().toISOString() }, { onConflict: "team_id,match_date" });
    saved = !upsertErr;
  }

  return NextResponse.json({ ok: true, saved, ...payload });
}
