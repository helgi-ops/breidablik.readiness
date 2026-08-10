export const runtime = "nodejs";

/**
 * POST /api/coach/sb-match-summary/upload  (multipart: file, date)
 *
 * Ingests the StatsBomb IQ TEAM-level per-match "Match Stats" summary — the two-row file
 * (one row per team: Goals, xG, Shots, Possession %, Pass Completion %, Total Passes,
 * Pressures, cards) — into sb_team_match_stats for ONE game, so Single Match Analysis has
 * the team numbers (the per-player file only carries the player breakdown). Own vs
 * opponent is resolved by name; home/away is read from the fixture if present. Descriptive
 * football context only — never touches the readiness colour. Service-role write, strictly
 * scoped to the coach's own team.
 */

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";
import { mergeUpsertSbTeamRow } from "@/lib/micropulse/statsIngestion/sbTeamRowMerge";

async function getCoachTeam(req: NextRequest) {
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

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  // "488 (388)" → 488 ; "19 (21)" → 19 ; plain numbers pass through.
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  const date = String(form.get("date") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ ok: false, error: "A match date (YYYY-MM-DD) is required." }, { status: 400 });

  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return NextResponse.json({ ok: false, error: "Could not read the file." }, { status: 400 });
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }) as unknown[][];
  const header = (matrix[0] ?? []).map((h) => String(h ?? "").replace(/﻿/g, "").trim());

  // Guard: the per-player export (has a "Player" column) belongs on the whole-squad uploader.
  if (header.some((h) => /^player$/i.test(h))) {
    return NextResponse.json({ ok: false, error: "This is the per-player file — use “One match — whole squad” above. This box is for the TEAM Match Stats summary (one row per team: Goals, xG, Possession…)." }, { status: 400 });
  }
  const idx = (name: RegExp) => header.findIndex((h) => name.test(h));
  const iTeam = idx(/^team\s*name$/i);
  const iPoss = idx(/^possession/i);
  const iXg = header.findIndex((h) => /^xg$/i.test(h));
  if (iTeam < 0 || iPoss < 0 || iXg < 0) {
    return NextResponse.json({ ok: false, error: "This isn’t the StatsBomb team “Match Stats” summary (expected “Team name”, “xG”, “Possession %” columns, one row per team)." }, { status: 400 });
  }
  const col = {
    team: iTeam, goals: idx(/^goals$/i), xg: iXg, shots: idx(/^shots$/i), poss: iPoss,
    passPct: idx(/^pass completion/i), passes: idx(/^total passes/i), pressures: idx(/^pressures$/i),
    yellow: idx(/^yellow cards$/i), red: idx(/^red cards/i),
  };

  const rows = matrix.slice(1).filter((r) => r && r[iTeam] != null && String(r[iTeam]).trim() !== "");
  if (rows.length < 2) return NextResponse.json({ ok: false, error: "Expected two team rows (your team and the opponent) in the file." }, { status: 400 });

  // Resolve which row is us: match the coach team's name (accent/spelling-tolerant).
  const { data: team } = await auth.supabase.from("teams").select("name, club_short_name").eq("id", auth.teamId).maybeSingle();
  const ownNames = [team?.name, (team as { club_short_name?: string } | null)?.club_short_name].filter(Boolean).map((s) => normalizeName(String(s)));
  const ownRow = rows.find((r) => ownNames.includes(normalizeName(String(r[iTeam]))));
  if (!ownRow) return NextResponse.json({ ok: false, error: `Couldn’t find your team (${team?.name ?? "?"}) in the file — team rows are “${rows.map((r) => r[iTeam]).join('” / “')}”.` }, { status: 400 });
  const oppRow = rows.find((r) => r !== ownRow);
  if (!oppRow) return NextResponse.json({ ok: false, error: "Couldn’t find the opponent row." }, { status: 400 });

  // Home/away from the fixture if it exists (the file doesn't carry it).
  const { data: sched } = await auth.supabase.from("match_schedule").select("is_home, opponent").eq("team_id", auth.teamId).eq("match_date", date).maybeSingle();

  const patch = {
    season: date.slice(0, 4), opponent: String(oppRow[iTeam]).trim(),
    is_home: (sched as { is_home?: boolean } | null)?.is_home ?? null,
    goals: num(ownRow[col.goals]), goals_against: num(oppRow[col.goals]),
    xg: num(ownRow[col.xg]), xg_against: num(oppRow[col.xg]),
    shots: num(ownRow[col.shots]), shots_against: num(oppRow[col.shots]),
    passing_pct: num(ownRow[col.passPct]), possession_proxy_pct: num(ownRow[col.poss]),
    passes: num(ownRow[col.passes]), pressures: num(ownRow[col.pressures]),
    yellow_cards: num(ownRow[col.yellow]), red_cards: num(ownRow[col.red]),
  };
  // Merge so a prior per-player upload's OBV / set-piece numbers survive.
  const err = await mergeUpsertSbTeamRow(auth.supabase, auth.teamId, date, patch);
  if (err) return NextResponse.json({ ok: false, error: err }, { status: 500 });

  return NextResponse.json({
    ok: true, date, opponent: patch.opponent,
    score: patch.goals != null && patch.goals_against != null ? `${patch.goals}-${patch.goals_against}` : null,
    xg: patch.xg, xgAgainst: patch.xg_against,
  });
}
