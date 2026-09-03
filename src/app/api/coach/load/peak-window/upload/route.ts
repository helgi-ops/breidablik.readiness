export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/load/peak-window/upload
 *
 * POST multipart { file, phase:"preview"|"commit", match_date, hsr_threshold?, export_date? } —
 * ingest a Catapult OpenField CTR / session-summary (period) export into `player_peak_window`.
 * The CTR export is time-based and carries the high-speed data (HIR Dist, Vel B5/B6) plus each
 * period's start time, so it supplies BOTH feeds the contextualised peak-period flagship needs:
 * peak-HSR (Ju-2022 Table-2 score) and the window clock (event-time alignment).
 *
 * Athletes are matched via catapult_athlete_map (falling back to players.full_name). The HSR
 * threshold behind HIR Dist is a COACH setting in OpenField — Code does not change it; the coach
 * supplies the threshold their account uses so the Ju comparison is labelled with it (provenance).
 * Descriptive load context — it never touches the readiness colour or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseCatapultCtr } from "@/lib/micropulse/load/parseCatapultCtr";

type SupabaseClient = ReturnType<typeof getSupabase>;

async function authTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { supabase, teamId } as const;
}

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
/** Diacritic-insensitive norm — the CTR strips accents ("Örn" → "Orn"), so the
 *  surname-initial fallback must match "Dagur Orn F." to "Dagur Örn Fjeldsted". */
const normLoose = (s: string) => normName(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Roster full_name → CTR-style "First Middle L." abbreviation (last name → initial). */
function abbrevSurnameInitial(full: string): string | null {
  const parts = normName(full).split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (!last) return null;
  return [...parts.slice(0, -1), `${last[0]}.`].join(" ");
}

function readMatrix(buf: ArrayBuffer): string[][] {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", raw: false });
  return rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : []));
}

async function nameToPlayer(supabase: SupabaseClient, teamId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data: roster } = await supabase.from("players").select("id, full_name").eq("team_id", teamId);
  const rosterRows = (roster ?? []) as Array<{ id: string; full_name: string | null }>;
  for (const p of rosterRows) {
    if (p.full_name) out.set(normName(p.full_name), p.id);
  }
  // catapult_athlete_map aliases are AUTHORITATIVE (hand-mapped) — exact keys.
  const { data: map } = await supabase.from("catapult_athlete_map")
    .select("catapult_athlete_name, micropulse_player_id, source_team_id").eq("source_team_id", teamId);
  for (const m of (map ?? []) as Array<{ catapult_athlete_name: string | null; micropulse_player_id: string | null }>) {
    if (m.catapult_athlete_name && m.micropulse_player_id) out.set(normName(m.catapult_athlete_name), m.micropulse_player_id);
  }
  // Surname-initial fallback so a first-time upload matches without hand-mapping:
  // add diacritic-insensitive full-name AND "First Middle L." abbrev keys, but ONLY
  // when unambiguous across the roster and never overriding an exact/alias key.
  const looseIds = new Map<string, Set<string>>();
  const looseCandidates: Array<[string, string]> = [];
  for (const p of rosterRows) {
    if (!p.full_name) continue;
    const keys = [normLoose(p.full_name), abbrevSurnameInitial(p.full_name) && normLoose(abbrevSurnameInitial(p.full_name)!)]
      .filter((k): k is string => !!k);
    for (const k of keys) {
      (looseIds.get(k) ?? looseIds.set(k, new Set()).get(k)!).add(p.id);
      looseCandidates.push([k, p.id]);
    }
  }
  for (const [k, id] of looseCandidates) {
    if (out.has(k)) continue;                    // exact/alias key wins
    if ((looseIds.get(k)?.size ?? 0) > 1) continue; // two players share it → ambiguous, skip
    out.set(k, id);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await authTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart form" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "No file" }, { status: 400 });
  const phase = String(form.get("phase") ?? "preview") === "commit" ? "commit" : "preview";
  const matchDate = String(form.get("match_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(matchDate)) return NextResponse.json({ ok: false, error: "A match date (YYYY-MM-DD) is required — the CTR export has no date." }, { status: 400 });
  const hsrThreshold = ((): number | null => { const n = Number(form.get("hsr_threshold")); return Number.isFinite(n) && n > 0 ? n : null; })();
  const exportDate = String(form.get("export_date") ?? "").trim() || null;
  // Seconds from ACTIVITY start to kickoff — lets us express each peak-window
  // start as seconds-from-kickoff for match/event alignment. Coach-supplied, null
  // until known (then window_start_s_from_ko stays null — never faked).
  const kickoffOffsetS = ((): number | null => { const n = Number(form.get("kickoff_offset_s")); return Number.isFinite(n) ? n : null; })();

  let matrix: string[][];
  try { matrix = readMatrix(await file.arrayBuffer()); } catch (e) { return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the file" }, { status: 400 }); }

  // Pass the coach-confirmed HSR threshold as the band-5 lower edge so the parser
  // derives HSR from velocity bands (V5+V6) only when that edge IS the Ju threshold.
  const parsed = parseCatapultCtr(matrix, { hsrBand5EdgeKmh: hsrThreshold ?? undefined });
  if (parsed.rows.length === 0) return NextResponse.json({ ok: false, error: parsed.warnings[0] ?? "No period rows recognised in this file.", warnings: parsed.warnings }, { status: 422 });

  const name2player = await nameToPlayer(auth.supabase, auth.teamId);
  // Exact key first, then the diacritic-insensitive surname-initial fallback.
  const resolvePlayer = (a: string): string | undefined => name2player.get(normName(a)) ?? name2player.get(normLoose(a));
  const matched: string[] = [], unmatched: string[] = [];
  for (const a of parsed.athletes) (resolvePlayer(a) ? matched : unmatched).push(a);

  // Group by athlete so peak-DISTANCE windows are taken once (from the Session row).
  const byAthlete = new Map<string, typeof parsed.rows>();
  for (const r of parsed.rows) (byAthlete.get(r.athlete) ?? byAthlete.set(r.athlete, []).get(r.athlete)!).push(r);

  const upserts: Array<Record<string, unknown>> = [];
  let peakWindows = 0;
  for (const [athlete, rows] of byAthlete) {
    const pid = resolvePlayer(athlete);
    if (!pid) continue;
    // Per-period rows — HIR Distance + velocity bands + RHIE (period, not peak window).
    for (const r of rows) {
      upserts.push({
        player_id: pid, team_id: auth.teamId, match_date: matchDate, source: "catapult_ctr",
        window_label: r.periodName, window_min: null, window_start: null, window_end: null, window_seconds: r.durationS,
        // Native HIR wins when present (Bulk export); else the band-derived HSR (V5+V6,
        // Activity Report). hsrThresholdKmh follows: coach value, else the derived 19.8.
        hsr_m: r.hirM ?? r.hsrM, vb5_m: r.vb5M, vb6_m: r.vb6M, max_kmh: null, player_load: r.playerLoad, distance_m: r.distanceM,
        rhie_bouts: r.rhieBouts, kickoff_offset_s: kickoffOffsetS,
        hsr_threshold_kmh: hsrThreshold ?? r.hsrThresholdKmh, export_date: exportDate, raw: r,
      });
    }
    // MII peak windows (Distance + Player Load) with their clock times (the event-
    // alignment key) — from the Session row (peak over the whole match), else the
    // row carrying the most windows. The MII Player Load interval clock is the
    // preferred alignment source; both metrics are stored under distinct labels.
    const src = rows.find((r) => r.periodNumber === 0 && r.peaks.length) ?? rows.slice().sort((a, b) => b.peaks.length - a.peaks.length)[0];
    for (const pk of src?.peaks ?? []) {
      peakWindows++;
      // seconds-from-kickoff = (window start from activity start) − kickoff offset.
      const fromKo = pk.startEpoch != null && parsed.sessionUnixStart != null && kickoffOffsetS != null
        ? (pk.startEpoch - parsed.sessionUnixStart) - kickoffOffsetS
        : null;
      upserts.push({
        player_id: pid, team_id: auth.teamId, match_date: matchDate, source: "catapult_ctr",
        window_label: `Peak ${pk.windowMin}min ${pk.metric === "player_load" ? "PL" : pk.metric === "distance" ? "Dist" : pk.metric === "accel" ? "Accel" : "Decel"}`, window_min: pk.windowMin,
        window_start: pk.startEpoch != null ? String(pk.startEpoch) : null,
        window_end: pk.endEpoch != null ? String(pk.endEpoch) : null,
        window_start_s_from_ko: fromKo, kickoff_offset_s: kickoffOffsetS, window_seconds: pk.windowMin * 60,
        hsr_m: null, vb5_m: null, vb6_m: null, max_kmh: null,
        player_load: pk.metric === "player_load" ? pk.value : null, distance_m: pk.metric === "distance" ? pk.value : null,
        ima_accel: pk.metric === "accel" ? pk.value : null, ima_decel: pk.metric === "decel" ? pk.value : null,
        hsr_threshold_kmh: hsrThreshold, export_date: exportDate, raw: pk,
      });
    }
  }

  const summary = {
    detectedColumns: parsed.detectedColumns,
    athletesMatched: matched.length, athletesUnmatched: unmatched,
    rows: upserts.length, peakWindows,
    hsrThreshold,
    thresholdNote: hsrThreshold == null ? "No HSR threshold supplied — record the account's high-speed threshold (Ju uses >19.8 km/h)." : hsrThreshold !== 19.8 ? `Threshold ${hsrThreshold} km/h differs from Ju's 19.8 km/h.` : null,
    kickoffOffsetS,
    // Honest: OpenField's MII gives peak windows for Distance/Player Load only — NO peak-window HIR.
    note: "Captured per-period HIR + RHIE + the MII peak-window (Distance and Player Load) start/end clock times. The MII Player Load window clock is the preferred event-alignment key; window_start_s_from_ko is filled only when a kickoff offset is supplied. Peak-window HIR (the exact Ju-2022 Table-2 score) is still not in the CTR — that needs raw GPS; the Ju peak track stays gated.",
    warnings: parsed.warnings,
  };

  if (phase === "preview") return NextResponse.json({ ok: true, phase, ...summary });
  if (upserts.length === 0) return NextResponse.json({ ok: false, error: "Nothing to import (no matched athletes).", ...summary }, { status: 422 });

  const { error } = await auth.supabase.from("player_peak_window").upsert(upserts as never, { onConflict: "player_id,match_date,source,window_label" });
  if (error) return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });
  return NextResponse.json({ ok: true, phase, imported: upserts.length, ...summary });
}
