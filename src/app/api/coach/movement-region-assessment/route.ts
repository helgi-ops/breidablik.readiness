/**
 * Region-based movement assessment (OsteoSport-style). The coach records each
 * assessable field of a body region; the region + priority fields are usually
 * seeded by the AI analysis carry-over. Consent-gated for a linked player.
 * Screening / training only — never a diagnosis, never the readiness colour.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REGION_KEYS, FIELD_IDS_BY_REGION } from "@/lib/micropulse/movementScreen/vision/regions";

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

async function canAccessTeam(ctx: Ctx, teamId: string): Promise<boolean> {
  if (ctx.role === "ADMIN") return true;
  if (ctx.teamId && ctx.teamId === teamId) return true;
  const { data } = await ctx.sb.from("coach_teams").select("team_id").eq("coach_id", ctx.uid).eq("team_id", teamId).maybeSingle();
  return !!data;
}

async function hasActiveConsent(ctx: Ctx, playerId: string): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const { data } = await ctx.sb
    .from("player_consents")
    .select("id")
    .eq("player_id", playerId)
    .eq("consent_type", "data_processing")
    .is("revoked_at", null)
    .or(`valid_to.is.null,valid_to.gt.${nowIso}`)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const playerId = new URL(req.url).searchParams.get("player_id");
  if (!playerId) return NextResponse.json({ error: "player_id required" }, { status: 400 });
  const { data } = await ctx.sb
    .from("movement_region_assessments")
    .select("id, player_id, assessment_date, region, fields, pain_reported, from_carryover, created_at")
    .eq("player_id", playerId)
    .order("assessment_date", { ascending: false })
    .limit(20);
  return NextResponse.json({ ok: true, assessments: data ?? [] });
}

type FieldEntry = { fieldId: string; severity: string; note?: string | null };
const SEVERITIES = new Set(["ok", "mild", "moderate", "marked"]);

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json().catch(() => ({}));
  const b = body as { team_id?: string; player_id?: string; assessment_date?: string; region?: string; fields?: unknown; pain_reported?: boolean; from_carryover?: boolean };
  const teamId = String(b.team_id ?? ctx.teamId ?? "");
  const playerId = b.player_id || null;
  const region = String(b.region ?? "");
  const date = String(b.assessment_date ?? "");
  if (!teamId || !(await canAccessTeam(ctx, teamId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!REGION_KEYS.includes(region as (typeof REGION_KEYS)[number])) return NextResponse.json({ error: "Unknown region" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Valid assessment_date required" }, { status: 400 });
  if (playerId && !(await hasActiveConsent(ctx, playerId))) {
    return NextResponse.json({ error: "Player consent (data_processing) is required before storing an assessment for this player." }, { status: 403 });
  }

  // Keep only fields that belong to this region, with an allowed severity.
  const allowed = FIELD_IDS_BY_REGION.get(region) ?? new Set<string>();
  const raw = Array.isArray(b.fields) ? (b.fields as unknown[]) : [];
  const fields: FieldEntry[] = raw
    .map((f) => {
      const o = (f ?? {}) as { fieldId?: unknown; severity?: unknown; note?: unknown };
      const fieldId = String(o.fieldId ?? "");
      const severity = String(o.severity ?? "");
      if (!allowed.has(fieldId) || !SEVERITIES.has(severity)) return null;
      const note = typeof o.note === "string" ? o.note.trim().slice(0, 400) : null;
      return { fieldId, severity, ...(note ? { note } : {}) } as FieldEntry;
    })
    .filter((x): x is FieldEntry => x != null);

  const { data: inserted, error } = await ctx.sb
    .from("movement_region_assessments")
    .insert({
      team_id: teamId,
      player_id: playerId,
      assessment_date: date,
      region,
      fields,
      pain_reported: !!b.pain_reported,
      from_carryover: !!b.from_carryover,
      created_by: ctx.uid,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: inserted?.id ?? null, saved: fields.length });
}
