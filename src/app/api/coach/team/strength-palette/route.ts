/**
 * GET|POST /api/coach/team/strength-palette
 *
 * The team's per-slot strength palette (team_strength_palette.slots): the exercise
 * pool the coach picks so the individualised / auto session builds from THEIR
 * exercises. GET returns the saved palette + the eligible library options per slot;
 * POST replaces the palette (validated to eligible ids). Auth: coach token only.
 *
 * Also the structure per MD day (md_structures) and, since 2026-11-17, the weekday plan for weeks without a match
 * (no_match_week: weekday → strength / power / light / rest), and, since 2026-11-19, the reps a set per heavy MD day
 * (md_reps_per_set: MD-5 / MD-4 / MD-3 → 1–5; the week rule cuts the day's heavy reps into sets by it). Each field
 * saves independently.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { PALETTE_SLOTS, SLOT_LABEL, exercisesForSlot, sanitizePaletteSlots } from "@/lib/micropulse/strengthProgramming/palette";
import { HEAVY_MD_DAYS, MATCH_WEEK_HEAVY_REPS, REPS_PER_SET_CHOICES, sanitizeMdRepsPerSet } from "@/lib/micropulse/strengthProgramming/weekRule";
import { STRUCTURES_ALLOWED_BY_MD, DEFAULT_STRUCTURE_BY_MD, STRUCTURE_LABEL, sanitizeMdStructures, sanitizeNoMatchWeek, noMatchWeekToStore } from "@/lib/micropulse/strengthProgramming/structures";

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
  const { data, error } = await supabase.from("team_strength_palette").select("slots, md_structures, no_match_week, md_reps_per_set").eq("team_id", auth.teamId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const row = data as { slots?: unknown; md_structures?: unknown; no_match_week?: unknown; md_reps_per_set?: unknown } | null;
  const slots = sanitizePaletteSlots(row?.slots);
  const mdStructures = sanitizeMdStructures(row?.md_structures);
  const noMatchWeek = sanitizeNoMatchWeek(row?.no_match_week);
  const mdRepsPerSet = sanitizeMdRepsPerSet(row?.md_reps_per_set);
  // The week rule's numbers ride along so the picker can show how the day's reps turn into sets.
  const repsPerSetOptions = { days: HEAVY_MD_DAYS, choices: REPS_PER_SET_CHOICES, dayReps: MATCH_WEEK_HEAVY_REPS };
  return NextResponse.json({ ok: true, slots, slotOptions: slotOptions(), mdStructures, structureOptions: structureOptions(), noMatchWeek, mdRepsPerSet, repsPerSetOptions });
}

export async function POST(req: NextRequest) {
  const supabase = getSupabase();
  const auth = await getCoachAuth(req, supabase);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as { slots?: unknown; mdStructures?: unknown; noMatchWeek?: unknown; mdRepsPerSet?: unknown };
  // Merge-friendly: only overwrite the field(s) the caller sent, so the palette UI
  // and the structure UI can save independently.
  const patch: Record<string, unknown> = { team_id: auth.teamId, updated_by: auth.userId, updated_at: new Date().toISOString() };
  if ("slots" in body) patch.slots = sanitizePaletteSlots(body.slots);
  if ("mdStructures" in body) patch.md_structures = sanitizeMdStructures(body.mdStructures);
  if ("mdRepsPerSet" in body) patch.md_reps_per_set = sanitizeMdRepsPerSet(body.mdRepsPerSet);
  if ("noMatchWeek" in body) {
    // Keep when the days last changed (`since`): goal plans re-place session B by it only from the next week.
    const { data: cur } = await supabase.from("team_strength_palette").select("no_match_week").eq("team_id", auth.teamId).maybeSingle();
    patch.no_match_week = noMatchWeekToStore(body.noMatchWeek, (cur as { no_match_week?: unknown } | null)?.no_match_week, new Date().toISOString().slice(0, 10));
  }
  const { error } = await supabase.from("team_strength_palette").upsert(patch, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    slots: patch.slots,
    mdStructures: patch.md_structures,
    noMatchWeek: "no_match_week" in patch ? sanitizeNoMatchWeek(patch.no_match_week) : undefined,
    mdRepsPerSet: "md_reps_per_set" in patch ? patch.md_reps_per_set : undefined,
  });
}
