/**
 * GET / POST /api/coach/team/strength-send-mode
 *
 * The team's DEFAULT strength-send mode (teams.strength_send_mode):
 *   'individualised' — data + screen driven session (readiness + MD-aware, plus the
 *     player's movement-screen corrective + deficit-ledger emphases + F-V driver).
 *   'standard' — the MD template, still readiness/MD-tuned, without those per-player
 *     layers (a clean squad session).
 * The team send may still override this per send; this is only the default.
 * Auth: coach token only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";

async function getCoachAuth(req: NextRequest, supabase: ReturnType<typeof getSupabase>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof?.team_id as string | null) ?? null;
  if (!teamId) return { error: "Coach not linked to team", status: 400 } as const;
  return { teamId } as const;
}

const normalize = (v: unknown): "individualised" | "standard" => (v === "standard" ? "standard" : "individualised");

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data } = await supabase.from("teams").select("strength_send_mode, strength_auto_send").eq("id", auth.teamId).maybeSingle();
  const row = (data ?? {}) as { strength_send_mode?: string; strength_auto_send?: boolean };
  return NextResponse.json({ ok: true, mode: normalize(row.strength_send_mode), autoSend: !!row.strength_auto_send });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { mode?: string; autoSend?: boolean };
  const patch: { strength_send_mode?: string; strength_auto_send?: boolean } = {};
  if (body.mode !== undefined) {
    if (body.mode !== "individualised" && body.mode !== "standard") {
      return NextResponse.json({ error: "mode must be 'individualised' or 'standard'" }, { status: 400 });
    }
    patch.strength_send_mode = body.mode;
  }
  if (typeof body.autoSend === "boolean") patch.strength_auto_send = body.autoSend;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  const { error } = await supabase.from("teams").update(patch).eq("id", auth.teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...patch });
}
