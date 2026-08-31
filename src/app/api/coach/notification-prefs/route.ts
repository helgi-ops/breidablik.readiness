/**
 * GET/PUT /api/coach/notification-prefs — a coach's own proactive-delivery opt-ins
 * (morning digest today; threshold alerts / weekly report reserved for Additions 2–3).
 * Off by default; self-scoped to the authenticated coach's profile.
 * Descriptive delivery only — never touches the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const CHANNELS = ["push", "email", "both"] as const;
type Channel = (typeof CHANNELS)[number];

type Prefs = { morning_digest: boolean; threshold_alerts: boolean; weekly_report: boolean; channel: Channel };
const DEFAULTS: Prefs = { morning_digest: false, threshold_alerts: false, weekly_report: false, channel: "push" };

async function requireCoach(sb: ReturnType<typeof getSupabaseAdmin>, req: Request): Promise<{ profileId: string; teamId: string | null }> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  return { profileId: userRes.user.id, teamId: (prof as { team_id?: string } | null)?.team_id ?? null };
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let profileId: string;
  try { ({ profileId } = await requireCoach(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: m === "Forbidden" ? 403 : 401 }); }

  const { data } = await sb
    .from("coach_notification_preferences")
    .select("morning_digest, threshold_alerts, weekly_report, channel")
    .eq("profile_id", profileId).maybeSingle();
  const row = data as Prefs | null;
  return NextResponse.json({ ok: true, prefs: row ?? DEFAULTS });
}

export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  let profileId: string; let teamId: string | null;
  try { ({ profileId, teamId } = await requireCoach(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: m === "Forbidden" ? 403 : 401 }); }

  const body = (await req.json().catch(() => ({}))) as Partial<Prefs>;
  const patch: Record<string, unknown> = { profile_id: profileId, team_id: teamId, updated_at: new Date().toISOString() };
  if (typeof body.morning_digest === "boolean") patch.morning_digest = body.morning_digest;
  if (typeof body.threshold_alerts === "boolean") patch.threshold_alerts = body.threshold_alerts;
  if (typeof body.weekly_report === "boolean") patch.weekly_report = body.weekly_report;
  if (body.channel && (CHANNELS as readonly string[]).includes(body.channel)) patch.channel = body.channel;

  const { error } = await sb
    .from("coach_notification_preferences")
    .upsert(patch, { onConflict: "profile_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = await sb
    .from("coach_notification_preferences")
    .select("morning_digest, threshold_alerts, weekly_report, channel")
    .eq("profile_id", profileId).maybeSingle();
  return NextResponse.json({ ok: true, prefs: (data as Prefs | null) ?? DEFAULTS });
}
