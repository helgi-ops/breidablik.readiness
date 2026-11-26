/**
 * /api/trainer/onboarding — the new-practice checklist (see src/lib/trainer/onboarding.ts).
 *
 *   GET  ?team_id=…                         → steps, picked programme, latest invite token,
 *                                             real clients, starter programmes by goal
 *   POST { action: "pick", programmeKey, level } → step 2: remember the starting programme
 *   POST { action: "send", clientId }       → step 3: assign the picked programme to a real
 *                                             client (their first session lands on Today)
 *
 * Progress lives in pt_onboarding (one row per team, service role only).
 */

import { NextResponse } from "next/server";
import { requireTrainerPractice } from "@/lib/trainer/requireTrainerPractice";
import { isDemoClient } from "@/lib/trainer/demoClient";
import { goalsForProgramme, resolveOnboarding, type OnboardingRow } from "@/lib/trainer/onboarding";

export const runtime = "nodejs";

const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];

type ProgrammeRow = { programme_key: string; programme_name: string | null; level: string | null; short_blurb: string | null };

export async function GET(req: Request) {
  const a = await requireTrainerPractice(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId } = a;

  const [{ data: row }, { data: invites }, { data: players }, { data: library }] = await Promise.all([
    sb.from("pt_onboarding")
      .select("picked_programme_key, picked_level, invited_at, programme_at, session_at, completed_at")
      .eq("team_id", teamId).maybeSingle(),
    sb.from("client_invitations")
      .select("token, status, client_email, client_name, created_at")
      .eq("team_id", teamId).order("created_at", { ascending: false }).limit(20),
    sb.from("players")
      .select("id, full_name, user_id, is_demo")
      .eq("team_id", teamId).eq("is_active", true).order("full_name"),
    sb.from("pt_explosive_programmes")
      .select("programme_key, programme_name, level, short_blurb")
      .eq("category", "starter_template"),
  ]);

  const real = ((players ?? []) as Array<{ id: string; full_name: string; user_id: string | null; is_demo: boolean | null }>)
    .filter((p) => !isDemoClient(p));
  const realIds = real.map((p) => p.id);

  let withProgramme = new Set<string>();
  if (realIds.length > 0) {
    const [{ data: starter }, { data: custom }] = await Promise.all([
      sb.from("pt_explosive_programme_assignments").select("client_id").in("client_id", realIds).eq("status", "active"),
      sb.from("individual_training_plans").select("player_id").in("player_id", realIds).eq("status", "active"),
    ]);
    withProgramme = new Set([
      ...((starter ?? []) as Array<{ client_id: string }>).map((r) => r.client_id),
      ...((custom ?? []) as Array<{ player_id: string }>).map((r) => r.player_id),
    ]);
  }

  const inviteRows = (invites ?? []) as Array<{ token: string | null; status: string | null; client_email: string; client_name: string | null }>;
  const state = resolveOnboarding(row as OnboardingRow | null, {
    hasInvitation: inviteRows.length > 0,
    realClientHasProgramme: withProgramme.size > 0,
  }, new Date().toISOString());

  if (Object.keys(state.patch).length > 0 || !row) {
    await sb.from("pt_onboarding").upsert({ team_id: teamId, ...state.patch, updated_at: new Date().toISOString() }, { onConflict: "team_id" });
  }

  // One entry per starter programme (lowest level offered), tagged with its goals.
  const byKey = new Map<string, { key: string; name: string; level: string; blurb: string | null; goals: string[] }>();
  for (const p of (library ?? []) as ProgrammeRow[]) {
    if (!p.programme_key) continue;
    const level = (p.level ?? "beginner").toLowerCase();
    const prev = byKey.get(p.programme_key);
    if (prev && LEVEL_ORDER.indexOf(prev.level) <= LEVEL_ORDER.indexOf(level)) continue;
    byKey.set(p.programme_key, {
      key: p.programme_key, name: p.programme_name || p.programme_key, level,
      blurb: p.short_blurb, goals: goalsForProgramme(p.programme_key),
    });
  }
  const programmes = Array.from(byKey.values()).sort((x, y) => x.name.localeCompare(y.name));

  const r = row as OnboardingRow | null;
  const picked = r?.picked_programme_key ? byKey.get(r.picked_programme_key) ?? null : null;
  const pendingInvite = inviteRows.find((i) => i.status === "pending" && i.token) ?? null;

  return NextResponse.json({
    ok: true,
    completed: state.completed,
    steps: { invite: state.invite, programme: state.programme, session: state.session },
    picked: picked ? { programmeKey: picked.key, name: picked.name, level: r?.picked_level ?? picked.level } : null,
    invite: pendingInvite ? { token: pendingInvite.token, email: pendingInvite.client_email, name: pendingInvite.client_name } : null,
    clients: real.map((p) => ({ id: p.id, name: p.full_name, hasAccount: !!p.user_id, hasProgramme: withProgramme.has(p.id) })),
    programmes,
  });
}

export async function POST(req: Request) {
  const a = await requireTrainerPractice(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, teamId, userId } = a;

  let body: { action?: string; programmeKey?: string; level?: string; clientId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const now = new Date().toISOString();

  if (body.action === "pick") {
    const key = String(body.programmeKey ?? "");
    const level = String(body.level ?? "").toLowerCase();
    const { count } = await sb.from("pt_explosive_programmes")
      .select("id", { count: "exact", head: true })
      .eq("programme_key", key).eq("level", level).eq("category", "starter_template");
    if (!count) return NextResponse.json({ error: "Unknown starter programme" }, { status: 400 });
    const { error } = await sb.from("pt_onboarding").upsert(
      { team_id: teamId, picked_programme_key: key, picked_level: level, programme_at: now, updated_at: now },
      { onConflict: "team_id" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "send") {
    const { data: row } = await sb.from("pt_onboarding")
      .select("picked_programme_key, picked_level").eq("team_id", teamId).maybeSingle();
    const pick = row as { picked_programme_key: string | null; picked_level: string | null } | null;
    if (!pick?.picked_programme_key || !pick.picked_level) {
      return NextResponse.json({ error: "Pick a starting programme first" }, { status: 400 });
    }
    // The client must be a real client of this practice (never the demo client).
    const { data: client } = await sb.from("players")
      .select("id, team_id, is_demo, is_active").eq("id", String(body.clientId ?? "")).maybeSingle();
    const c = client as { id: string; team_id: string | null; is_demo: boolean | null; is_active: boolean | null } | null;
    if (!c || c.team_id !== teamId || !c.is_active) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    if (isDemoClient(c)) return NextResponse.json({ error: "Pick a real client — the demo client is only an example" }, { status: 400 });

    // Same as /api/trainer/starter-templates POST: one active programme per client.
    await sb.from("pt_explosive_programme_assignments").delete().eq("client_id", c.id).eq("status", "active");
    await sb.from("individual_training_plans").update({ status: "archived" }).eq("player_id", c.id).eq("status", "active");
    const { error } = await sb.from("pt_explosive_programme_assignments").insert({
      trainer_id: userId,
      client_id: c.id,
      programme_key: pick.picked_programme_key,
      level: pick.picked_level,
      start_date: now.slice(0, 10),
      current_phase: 1,
      status: "active",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await sb.from("pt_onboarding").upsert({ team_id: teamId, session_at: now, updated_at: now }, { onConflict: "team_id" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
