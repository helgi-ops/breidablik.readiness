/**
 * Coach notification preview / send-test (proactive delivery).
 *   GET  ?kind=digest|weekly  → compose the content for the coach's team WITHOUT sending.
 *   POST { kind }             → deliver a one-off TEST to the calling coach only.
 *
 * Lets a coach see the morning digest / weekly report on demand instead of waiting
 * for the cron. Deterministic content needs PRO+; the weekly AI narrative needs ELITE
 * (omitted, not blocked, for PRO). Tests bypass opt-in + dedupe (the coach asked for it)
 * but still respect tier. Descriptive only — never touches the readiness colour.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getTeamPlanTier, isEliteTeam } from "@/lib/micropulse/elite";
import { previewDigest, sendTestDigest } from "@/lib/notifications/coachDigest";
import { previewWeeklyReport, sendTestWeeklyReport } from "@/lib/notifications/coachWeeklyReport";

export const runtime = "nodejs";

function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

async function requireCoach(sb: ReturnType<typeof getSupabaseAdmin>, req: Request): Promise<{ profileId: string; teamId: string }> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { profileId: userRes.user.id, teamId };
}

function errStatus(m: string): number { return m === "Forbidden" ? 403 : m.includes("team") ? 400 : 401; }

async function coachEmail(sb: ReturnType<typeof getSupabaseAdmin>, teamId: string, profileId: string): Promise<string | null> {
  const { data } = await sb.rpc("get_team_coaches_with_email", { p_team_id: teamId });
  for (const r of (data ?? []) as Array<{ profile_id: string; email: string | null }>) {
    if (r.profile_id === profileId) return r.email ?? null;
  }
  return null;
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  let profileId: string, teamId: string;
  try { ({ profileId, teamId } = await requireCoach(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: errStatus(m) }); }
  void profileId;

  const kind = new URL(req.url).searchParams.get("kind") ?? "digest";
  const tier = await getTeamPlanTier(sb, teamId);
  if (tier !== "PRO" && tier !== "ELITE") {
    return NextResponse.json({ error: "PRO_REQUIRED", message: "Proactive delivery requires the PRO plan." }, { status: 403 });
  }
  const today = todayInReykjavik();

  if (kind === "weekly") {
    const elite = await isEliteTeam(sb, teamId);
    const { rollup, narrative } = await previewWeeklyReport(sb, teamId, today, elite);
    return NextResponse.json({ ok: true, kind: "weekly", elite, rollup, narrative });
  }
  const digest = await previewDigest(sb, teamId, today);
  return NextResponse.json({ ok: true, kind: "digest", digest });
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  let profileId: string, teamId: string;
  try { ({ profileId, teamId } = await requireCoach(sb, req)); }
  catch (e) { const m = e instanceof Error ? e.message : "Unauthorized"; return NextResponse.json({ error: m }, { status: errStatus(m) }); }

  const body = (await req.json().catch(() => ({}))) as { kind?: string };
  const kind = body.kind === "weekly" ? "weekly" : "digest";
  const tier = await getTeamPlanTier(sb, teamId);
  if (tier !== "PRO" && tier !== "ELITE") {
    return NextResponse.json({ error: "PRO_REQUIRED", message: "Proactive delivery requires the PRO plan." }, { status: 403 });
  }
  const today = todayInReykjavik();
  const email = await coachEmail(sb, teamId, profileId);

  if (kind === "weekly") {
    if (!email) return NextResponse.json({ ok: false, error: "No email on your account for the report." }, { status: 400 });
    const elite = await isEliteTeam(sb, teamId);
    const sent = await sendTestWeeklyReport(sb, { teamId, dateKey: today, email, elite });
    return NextResponse.json({ ok: sent, kind: "weekly", sentTo: sent ? email : null, elite });
  }

  const { data: pref } = await sb
    .from("coach_notification_preferences").select("channel").eq("profile_id", profileId).maybeSingle();
  const channel = (pref as { channel?: string } | null)?.channel ?? "push";
  const delivered = await sendTestDigest(sb, { profileId, teamId, dateKey: today, channel, email });
  return NextResponse.json({ ok: delivered.push || delivered.email, kind: "digest", channel, delivered });
}
