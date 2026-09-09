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
import { STRUCTURES_ALLOWED_BY_MD, DEFAULT_STRUCTURE_BY_MD, STRUCTURE_LABEL, sanitizeMdStructures } from "@/lib/micropulse/strengthProgramming/structures";

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

/** Which methods the coach may pick per configurable MD day (+ the default), so
 *  the structure picker needs no second call. */
function structureOptions() {
  return Object.entries(STRUCTURES_ALLOWED_BY_MD).map(([md, keys]) => ({
    md,
    defaultKey: DEFAULT_STRUCTURE_BY_MD[md as keyof typeof DEFAULT_STRUCTURE_BY_MD] ?? null,
    options: (keys ?? []).map((k) => ({ key: k, label: STRUCTURE_LABEL[k] })),
  }));
}

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { data } = await supabase.from("team_strength_palette").select("slots, md_structures").eq("team_id", auth.teamId).maybeSingle();
  const row = data as { slots?: unknown; md_structures?: unknown } | null;
  const slots = sanitizePaletteSlots(row?.slots);
  const mdStructures = sanitizeMdStructures(row?.md_structures);
  return NextResponse.json({ ok: true, slots, slotOptions: slotOptions(), mdStructures, structureOptions: structureOptions() });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { slots?: unknown; mdStructures?: unknown };
  // Merge-friendly: only overwrite the field(s) the caller sent, so the palette UI
  // and the structure UI can save independently.
  const patch: Record<string, unknown> = { team_id: auth.teamId, updated_by: auth.userId, updated_at: new Date().toISOString() };
  if ("slots" in body) patch.slots = sanitizePaletteSlots(body.slots);
  if ("mdStructures" in body) patch.md_structures = sanitizeMdStructures(body.mdStructures);
  const { error } = await supabase.from("team_strength_palette").upsert(patch, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, slots: patch.slots, mdStructures: patch.md_structures });
}
