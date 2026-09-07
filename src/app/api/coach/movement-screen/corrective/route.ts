/**
 * Send a movement-screen's corrective block to a player's Today card. The
 * prescription is rebuilt SERVER-SIDE from the player's latest stored screen
 * (never trusting a client-supplied block), serialized to the same
 * `{ block, items }` structure the Today card renders, and written to
 * `player_today_strength_override` (source coach_sent) — the existing
 * "coach sent = player sees" path.
 *
 * Screening/training only — never a diagnosis, never the readiness colour.
 * Corrective focus for a trainable compensation; the coach initiates + overrides.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerMovementScreens } from "@/lib/micropulse/movementScreen/loader";
import { prescribeCorrectives, prescribeForRegionFields, prescriptionToStructure } from "@/lib/micropulse/movementScreen/correctives/mapping";

export const runtime = "nodejs";

type Ctx = { sb: SupabaseClient; uid: string; teamId: string | null; role: string };

async function requireCoach(req: NextRequest): Promise<Ctx | { error: string; status: number }> {
  const sb = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 };
  return { sb, uid, teamId: p.team_id ?? null, role };
}

async function coachCanAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data: ct } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!ct;
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const playerId = String((body as { player_id?: string }).player_id ?? "");
  const isEN = (body as { lang?: string }).lang !== "IS";
  const source = (body as { source?: string }).source === "region" ? "region" : "screen";
  const entryDate = String((body as { entry_date?: string }).entry_date ?? new Date().toISOString().slice(0, 10));
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });

  // The player's team (players.team_id) + access check.
  const { data: pl } = await ctx.sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
  const teamId = (pl as { team_id?: string } | null)?.team_id ?? ctx.teamId ?? "";
  if (!teamId || !(await coachCanAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Rebuild the prescription SERVER-SIDE from the latest stored source.
  let prescription: ReturnType<typeof prescribeCorrectives> = null;
  let sourceLabel = "";
  let sourceDate = "";
  if (source === "region") {
    const { data: ra } = await ctx.sb
      .from("movement_region_assessments")
      .select("region, fields, assessment_date")
      .eq("player_id", playerId)
      .order("assessment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = ra as { region?: string; fields?: Array<{ fieldId: string; severity: string }>; assessment_date?: string } | null;
    if (!row?.fields?.length) return NextResponse.json({ error: "No region assessment to prescribe from." }, { status: 400 });
    prescription = prescribeForRegionFields(row.fields);
    sourceLabel = isEN ? `${(row.region ?? "").replace(/_/g, " ")} assessment` : `${(row.region ?? "").replace(/_/g, " ")} mat`;
    sourceDate = row.assessment_date ?? "";
  } else {
    const screens = await loadPlayerMovementScreens(ctx.sb, playerId, 1);
    const latest = screens[0];
    if (!latest?.result?.readings?.length) {
      return NextResponse.json({ error: "No movement-screen findings to prescribe from (or the screen was a pain / red flag)." }, { status: 400 });
    }
    prescription = prescribeCorrectives(latest.result.readings);
    sourceLabel = isEN ? `${latest.testSlug.replace(/_/g, " ")} screen` : `${latest.testSlug.replace(/_/g, " ")} skimun`;
    sourceDate = latest.screenDate;
  }
  if (!prescription) return NextResponse.json({ error: "No grounded corrective set maps to these findings yet." }, { status: 400 });

  const structure = prescriptionToStructure(prescription, isEN);
  const priorities = prescription.priorities.map((p) => (isEN ? p.label.en : p.label.is)).join(" + ");
  const title = isEN ? `Corrective — ${priorities}` : `Leiðrétting — ${priorities}`;
  const summary = isEN
    ? `Corrective block from the ${sourceLabel} (${sourceDate}). Re-screen in ~${Math.round(prescription.reScreenInDays / 7)} weeks.`
    : `Leiðréttingar-blokk úr ${sourceLabel} (${sourceDate}). Endurskima eftir ~${Math.round(prescription.reScreenInDays / 7)} vikur.`;

  const { error } = await ctx.sb.from("player_today_strength_override").upsert({
    player_id: playerId,
    team_id: teamId,
    entry_date: entryDate,
    md_context: null,
    readiness_level: null,
    title,
    description: isEN ? prescription.caveat.en : prescription.caveat.is,
    structure,
    summary,
    duration_min: 15,
    source: "coach_sent",
    coach_id: ctx.uid,
    updated_at: new Date().toISOString(),
  }, { onConflict: "player_id,entry_date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, entryDate, blocks: structure.length, priorities });
}
