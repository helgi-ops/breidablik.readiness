/**
 * Read-only physio summary for one player. Powers PhysioNoteCard on the
 * return-to-training surface: the latest CONFIRMED clinical report, the active
 * risk/prevention/return-to-play flags it produced, and — for the L/R cross-check
 * — the player's actual on-pitch IMA change-of-direction left/right split. This
 * NEVER writes; it just reads confirmed data + on-pitch signal side by side so a
 * coach can see whether a physio's one-sided finding shows up in how he moves.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedClinicalReport } from "@/lib/clinical/extractReport";

export const runtime = "nodejs";

const IMA_WINDOW_DAYS = 28;
const ASYMMETRY_FLAG_PCT = 15; // Bishop 2020 — >15% inter-limb asymmetry is meaningful.

async function requireCoach(req: NextRequest) {
  const sb: SupabaseClient = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  return { sb, uid, teamId: p.team_id ?? null, role } as const;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { sb } = ctx;

  const playerId = new URL(req.url).searchParams.get("player_id");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });

  // Resolve + authorize the player's team (ADMIN sees all; else own team or coach_teams).
  const { data: pl } = await sb.from("players").select("id, team_id").eq("id", playerId).maybeSingle();
  const player = pl as { id?: string; team_id?: string | null } | null;
  if (!player?.id) return NextResponse.json({ error: "Player not found" }, { status: 404 });
  const teamId = player.team_id ?? null;
  if (ctx.role !== "ADMIN" && ctx.teamId !== teamId) {
    const { data: ct } = teamId
      ? await sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle()
      : { data: null };
    if (!ct) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Latest confirmed report (the authoritative physio note).
  const { data: repRows } = await sb
    .from("clinical_reports")
    .select("id, report_date, clinician_name, clinic, extracted_json, file_path, confirmed_at")
    .eq("player_id", playerId)
    .eq("status", "confirmed")
    .order("report_date", { ascending: false, nullsFirst: false })
    .order("confirmed_at", { ascending: false })
    .limit(1);
  const rep = (repRows?.[0] ?? null) as
    | { id: string; report_date: string | null; clinician_name: string | null; clinic: string | null; extracted_json: ExtractedClinicalReport | null; file_path: string; confirmed_at: string | null }
    | null;

  let report: null | {
    id: string; report_date: string | null; clinician_name: string | null; clinic: string | null;
    current_status: string | null; return_to_play: ExtractedClinicalReport["return_to_play"]; url: string | null;
  } = null;
  if (rep) {
    const { data: signed } = await sb.storage.from("clinical-reports").createSignedUrl(rep.file_path, 3600);
    report = {
      id: rep.id,
      report_date: rep.report_date,
      clinician_name: rep.clinician_name,
      clinic: rep.clinic,
      current_status: rep.extracted_json?.current_status ?? null,
      return_to_play: rep.extracted_json?.return_to_play ?? null,
      url: signed?.signedUrl ?? null,
    };
  }

  // Active risk flags produced by confirmed reports, grouped by category.
  const { data: flagRows } = await sb
    .from("player_risk_flags")
    .select("flag, side, category, source_report_id, created_at")
    .eq("player_id", playerId)
    .eq("active", true)
    .order("created_at", { ascending: false });
  const flags = (flagRows ?? []) as Array<{ flag: string; side: string | null; category: string; source_report_id: string | null }>;
  const byCat = (cat: string) => flags.filter((f) => f.category === cat);
  // Does the physio note report a one-sided finding? (drives the IMA cross-check).
  const findingSides = new Set(byCat("clinical_finding").map((f) => f.side).filter((s): s is string => s === "left" || s === "right"));
  const reportedSide = findingSides.size === 1 ? [...findingSides][0] : null;

  // On-pitch IMA change-of-direction L/R over the recent window (Bishop 2020).
  const since = new Date(Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) - IMA_WINDOW_DAYS * 86400000)
    .toISOString()
    .slice(0, 10);
  const { data: imaRows } = await sb
    .from("player_external_load_daily")
    .select("ima_cod_left_high, ima_cod_right_high, ima_cod_left_medium, ima_cod_right_medium, ima_cod_left_low, ima_cod_right_low")
    .eq("player_id", playerId)
    .eq("source", "catapult")
    .gte("date", since);
  let left = 0, right = 0, leftHigh = 0, rightHigh = 0, days = 0;
  for (const r of (imaRows ?? []) as Array<Record<string, unknown>>) {
    const lh = num(r.ima_cod_left_high), rh = num(r.ima_cod_right_high);
    const lo = lh + num(r.ima_cod_left_medium) + num(r.ima_cod_left_low);
    const ro = rh + num(r.ima_cod_right_medium) + num(r.ima_cod_right_low);
    if (lo + ro > 0) { left += lo; right += ro; leftHigh += lh; rightHigh += rh; days++; }
  }
  let ima: null | { leftPct: number; rightPct: number; asymmetryPct: number; heavierSide: "left" | "right"; imbalanced: boolean; days: number; windowDays: number } = null;
  if (days > 0 && left + right > 0) {
    const leftPct = Math.round((left / (left + right)) * 100);
    // Asymmetry on high-intensity CoD where available (most sensitive), else totals.
    const hi = leftHigh + rightHigh;
    const [lo, ro] = hi > 0 ? [leftHigh, rightHigh] : [left, right];
    const asymmetryPct = Math.round((Math.abs(lo - ro) / Math.max(lo, ro, 1)) * 100);
    ima = {
      leftPct,
      rightPct: 100 - leftPct,
      asymmetryPct,
      heavierSide: lo >= ro ? "left" : "right",
      imbalanced: asymmetryPct >= ASYMMETRY_FLAG_PCT,
      days,
      windowDays: IMA_WINDOW_DAYS,
    };
  }

  // Cross-check verdict: does the on-pitch lighter side match the physio's side?
  // A one-sided finding usually means he OFFLOADS that side on the pitch (does
  // less CoD on it). We only surface a plain observation — never a diagnosis.
  let crossCheck: null | { reportedSide: "left" | "right"; onPitchLighterSide: "left" | "right"; consistent: boolean } = null;
  if (reportedSide && ima) {
    const onPitchLighterSide: "left" | "right" = ima.heavierSide === "left" ? "right" : "left";
    crossCheck = { reportedSide: reportedSide as "left" | "right", onPitchLighterSide, consistent: onPitchLighterSide === reportedSide };
  }

  return NextResponse.json({
    ok: true,
    report,
    findings: byCat("clinical_finding"),
    prevention: byCat("prevention_target").map((f) => f.flag),
    returnToPlay: byCat("return_to_play").map((f) => f.flag),
    reportedSide,
    ima,
    crossCheck,
  });
}
