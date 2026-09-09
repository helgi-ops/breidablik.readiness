/**
 * GET|POST /api/coach/team/strength-palette
 *
 * The team's per-slot strength palette (team_strength_palette.slots): the exercise
 * pool the coach picks so the individualised / auto session builds from THEIR
 * exercises. GET returns the saved palette + the eligible library options per slot;
 * POST replaces the palette (validated to eligible ids). Auth: coach token only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { PALETTE_SLOTS, SLOT_LABEL, exercisesForSlot, sanitizePaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";

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
  return { userId: userRes.user.id, teamId } as const;
}

/** The library options per slot (id + EN/IS name), so the picker needs no second call. */
function slotOptions() {
  return PALETTE_SLOTS.map((slot) => ({
    slot,
    label: SLOT_LABEL[slot],
    options: exercisesForSlot(slot).map((e) => ({ id: e.id, nameEN: e.nameEN, nameIS: e.nameIS, unilateral: e.isUnilateral })),
  }));
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data } = await supabase.from("team_strength_palette").select("slots").eq("team_id", auth.teamId).maybeSingle();
  const slots = sanitizePaletteSlots((data as { slots?: unknown } | null)?.slots);
  return NextResponse.json({ ok: true, slots, slotOptions: slotOptions() });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { slots?: unknown };
  const slots = sanitizePaletteSlots(body.slots);
  const { error } = await supabase.from("team_strength_palette").upsert({
    team_id: auth.teamId, slots, updated_by: auth.userId, updated_at: new Date().toISOString(),
  }, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slots });
}
