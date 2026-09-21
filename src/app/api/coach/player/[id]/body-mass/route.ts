export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/coach/player/[id]/body-mass
 *   GET  → resolved body mass (coach entry preferred, else VALD CMJ weight) + history
 *   POST { massKg, heightCm?, measuredOn?, note? } → record a coach measurement
 *
 * The anthropometry input for per-kg metrics (#5). Coach-entered mass is the ground truth;
 * the VALD CMJ test weight is the fallback; nothing is ever assumed. Descriptive context —
 * it never touches the readiness colour, the load target, or the daily decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { resolveBodyMass, type BodyMassMeasurement } from "@/lib/micropulse/load/bodyMass";
import { jacksonPollock3, jacksonPollock7, navyCircumference, withLeanMass, type Sex, type Skinfolds, type Conversion } from "@/lib/micropulse/load/bodyComposition";

async function authTeam(req: NextRequest, playerId: string) {
  const sb = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "No team", status: 400 } as const;
  const { data: player } = await sb.from("players").select("id, full_name").eq("id", playerId).eq("team_id", teamId).maybeSingle();
  if (!player) return { error: "Player not on your team", status: 403 } as const;
  return { sb, teamId, userId: userRes.user.id, name: (player as { full_name: string | null }).full_name } as const;
}

/** The player's latest VALD CMJ test weight, resolved via the athlete-id link. Null if none. */
async function valdWeight(sb: ReturnType<typeof getSupabase>, playerId: string): Promise<BodyMassMeasurement | null> {
  const { data: fd } = await sb.from("vald_forcedecks_results")
    .select("vald_athlete_id").eq("microplayer_id", playerId).order("test_timestamp", { ascending: false }).limit(1).maybeSingle();
  const athleteId = (fd as { vald_athlete_id?: string } | null)?.vald_athlete_id;
  if (!athleteId) return null;
  const { data: raw } = await sb.from("vald_raw_tests")
    .select("payload, test_timestamp").eq("test_type", "CMJ").eq("vald_athlete_id", athleteId)
    .order("test_timestamp", { ascending: false }).limit(1).maybeSingle();
  const w = Number((raw as { payload?: { weight?: unknown } } | null)?.payload?.weight);
  if (!Number.isFinite(w) || w <= 0) return null;
  return { massKg: Math.round(w * 10) / 10, measuredOn: String((raw as { test_timestamp?: string }).test_timestamp ?? "").slice(0, 10) || null, source: "vald" };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const { data: manual } = await a.sb.from("player_body_metrics")
    .select("mass_kg, height_cm, measured_on, source, note, body_fat_pct, bf_method, sum_skinfolds_mm, lean_mass_kg, sex, age_years, created_by")
    .eq("player_id", playerId).order("measured_on", { ascending: false });
  const rows = (manual ?? []) as Array<Record<string, unknown>>;
  const manualMs: BodyMassMeasurement[] = rows
    .filter((m) => Number.isFinite(Number(m.mass_kg)))
    .map((m) => ({ massKg: Number(m.mass_kg), measuredOn: String(m.measured_on), source: (m.source as BodyMassMeasurement["source"]) ?? "coach" }));
  const vald = await valdWeight(a.sb, playerId);
  const resolved = resolveBodyMass([...manualMs, ...(vald ? [vald] : [])]);

  // Body-composition trend: only sessions with a computed %fat. Flag a method/tester CHANGE between
  // the two most recent — otherwise the trend is noise, not a real change.
  const bodyComp = rows
    .filter((m) => Number.isFinite(Number(m.body_fat_pct)))
    .map((m) => ({
      measuredOn: String(m.measured_on), bodyFatPct: Number(m.body_fat_pct), method: (m.bf_method as string) ?? null,
      sumSkinfoldsMm: Number.isFinite(Number(m.sum_skinfolds_mm)) ? Number(m.sum_skinfolds_mm) : null,
      leanKg: Number.isFinite(Number(m.lean_mass_kg)) ? Number(m.lean_mass_kg) : null,
      massKg: Number.isFinite(Number(m.mass_kg)) ? Number(m.mass_kg) : null,
      sex: (m.sex as string) ?? null, createdBy: (m.created_by as string) ?? null,
    }));
  let consistency: { methodChanged: boolean; testerChanged: boolean } | null = null;
  if (bodyComp.length >= 2) {
    consistency = { methodChanged: bodyComp[0].method !== bodyComp[1].method, testerChanged: !!bodyComp[0].createdBy && bodyComp[0].createdBy !== bodyComp[1].createdBy };
  }

  return NextResponse.json({ ok: true, player_id: playerId, name: a.name, resolved, history: rows, bodyComp, consistency, valdWeight: vald?.massKg ?? null });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: playerId } = await params;
  const a = await authTeam(req, playerId);
  if ("error" in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });

  const body = await req.json().catch(() => ({}));
  const measuredOnIn = typeof body?.measuredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.measuredOn) ? body.measuredOn : new Date().toISOString().slice(0, 10);

  // ── Body-composition session (skinfold / circumference → %fat). Present when `method` is set. ──
  const method = String(body?.method ?? "");
  if (method === "jp3" || method === "jp7" || method === "navy") {
    const sex = (String(body?.sex ?? "").toUpperCase() === "F" ? "F" : String(body?.sex ?? "").toUpperCase() === "M" ? "M" : null) as Sex | null;
    if (!sex) return NextResponse.json({ ok: false, error: "sex ('M'|'F') is required for the body-composition equations." }, { status: 400 });
    const ageYears = Number(body?.ageYears);
    const conversion: Conversion = body?.conversion === "brozek" ? "brozek" : "siri";
    const skinfolds = (body?.skinfolds && typeof body.skinfolds === "object" ? body.skinfolds : {}) as Skinfolds;
    const girths = (body?.girths && typeof body.girths === "object" ? body.girths : {}) as { neck?: number; waist?: number; hip?: number };

    // Resolve a mass (payload, else the player's latest known) so lean mass computes + the column is set.
    let massForRow = Number.isFinite(Number(body?.massKg)) && Number(body.massKg) > 20 && Number(body.massKg) < 200 ? Math.round(Number(body.massKg) * 10) / 10 : null;
    let heightForRow = Number.isFinite(Number(body?.heightCm)) && Number(body.heightCm) > 100 && Number(body.heightCm) < 230 ? Number(body.heightCm) : null;
    if (massForRow == null || (method === "navy" && heightForRow == null)) {
      const { data: last } = await a.sb.from("player_body_metrics").select("mass_kg, height_cm").eq("player_id", playerId)
        .not("mass_kg", "is", null).order("measured_on", { ascending: false }).limit(1).maybeSingle();
      if (massForRow == null) massForRow = Number.isFinite(Number((last as { mass_kg?: number } | null)?.mass_kg)) ? Number((last as { mass_kg: number }).mass_kg) : null;
      if (heightForRow == null) heightForRow = Number.isFinite(Number((last as { height_cm?: number } | null)?.height_cm)) ? Number((last as { height_cm: number }).height_cm) : null;
    }
    if (massForRow == null) return NextResponse.json({ ok: false, error: "Record a bodyweight first (or send massKg) — needed to store the session and compute lean mass." }, { status: 400 });

    const computed = method === "jp3"
      ? jacksonPollock3({ sex, ageYears, sites: skinfolds, conversion })
      : method === "jp7"
        ? jacksonPollock7({ sex, ageYears, sites: skinfolds, conversion })
        : navyCircumference({ sex, heightCm: heightForRow ?? NaN, neckCm: Number(girths.neck), waistCm: Number(girths.waist), hipCm: girths.hip != null ? Number(girths.hip) : undefined });
    if (!computed) return NextResponse.json({ ok: false, error: "Couldn't compute body fat — check the required sites for this method, sex, age, and that values are in a plausible range." }, { status: 400 });
    const withLean = withLeanMass(computed, massForRow);

    const { error } = await a.sb.from("player_body_metrics").insert({
      player_id: playerId, team_id: a.teamId, mass_kg: massForRow, height_cm: heightForRow, measured_on: measuredOnIn,
      source: "coach", note: typeof body?.note === "string" ? body.note.slice(0, 200) : null, created_by: a.userId,
      body_fat_pct: withLean.bodyFatPct, bf_method: method, skinfolds_mm: Object.keys(skinfolds).length ? skinfolds : null,
      girths_cm: Object.keys(girths).length ? girths : null, sum_skinfolds_mm: withLean.sumSkinfoldsMm, lean_mass_kg: withLean.leanKg,
      sex, age_years: Number.isFinite(ageYears) ? ageYears : null,
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: 1, measuredOn: measuredOnIn, bodyFatPct: withLean.bodyFatPct, method, leanKg: withLean.leanKg, fatKg: withLean.fatKg });
  }

  const massKg = Number(body?.massKg);
  if (!Number.isFinite(massKg) || massKg <= 20 || massKg >= 200) return NextResponse.json({ ok: false, error: "massKg must be a plausible bodyweight (20–200 kg)." }, { status: 400 });
  const heightCm = Number.isFinite(Number(body?.heightCm)) && Number(body.heightCm) > 100 && Number(body.heightCm) < 230 ? Number(body.heightCm) : null;
  const measuredOn = typeof body?.measuredOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.measuredOn) ? body.measuredOn : new Date().toISOString().slice(0, 10);

  const { error } = await a.sb.from("player_body_metrics").insert({
    player_id: playerId, team_id: a.teamId, mass_kg: Math.round(massKg * 10) / 10, height_cm: heightCm,
    measured_on: measuredOn, source: "coach", note: typeof body?.note === "string" ? body.note.slice(0, 200) : null, created_by: a.userId,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, imported: 1, measuredOn, massKg: Math.round(massKg * 10) / 10 });
}
