/**
 * POST /api/player/exercise-swap
 *
 * Player swaps one prescribed exercise on today's session for one of its CURATED
 * SAFE ALTERNATIVES (Exercise.alternatives) — used when the sent exercise isn't
 * quite right for them (equipment, comfort, a niggle). Safe-only: the target must
 * be in the original exercise's `alternatives`, so a swap can never land on a
 * mechanically inappropriate lift.
 *
 * Two effects, atomic from the player's view:
 *   1. Logs the swap in player_exercise_swaps (the coach's window + durable record).
 *   2. Rewrites the matching item in player_today_strength_override.structure so the
 *      Today card immediately shows the new exercise (name + safe alternatives kept,
 *      dose preserved; a note records the player swap).
 *
 * DELETE reverts a swap (restores the coach-sent exercise for that slot).
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId, getPlayerTeamId } from "@/lib/session-rpe/server";
import { EXERCISES_BY_ID } from "@/lib/micropulse/strengthProgramming/exerciseLibrary";
import type { TodayStructureBlock, TodayStructureItem } from "@/lib/micropulse/strengthProgramming/toTodayStructure";

export const runtime = "nodejs";

function toMessage(e: unknown) {
  return e instanceof Error ? e.message : "Unknown error";
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Localize an exercise name EN/IS with EN fallback. */
function exName(id: string, isIS: boolean): string {
  const ex = EXERCISES_BY_ID.get(id);
  return ex ? (isIS ? ex.nameIS : ex.nameEN) || ex.nameEN : id;
}

/** Safe alternatives for the player card (curated `alternatives`, localized). */
function safeAlternatives(id: string, isIS: boolean): { id: string; name: string }[] {
  const ex = EXERCISES_BY_ID.get(id);
  return (ex?.alternatives ?? [])
    .map((altId) => EXERCISES_BY_ID.get(altId))
    .filter((a): a is NonNullable<typeof a> => !!a && a.id !== id)
    .map((a) => ({ id: a.id, name: (isIS ? a.nameIS : a.nameEN) || a.nameEN }));
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);
    const body = (await req.json().catch(() => null)) as
      | { block?: string; position?: number; fromExerciseId?: string; toExerciseId?: string; date?: string; lang?: string }
      | null;
    if (!body) return NextResponse.json({ ok: false, error: "Bad body" }, { status: 400 });

    const { block, position, fromExerciseId, toExerciseId } = body;
    const isIS = String(body.lang ?? "").toUpperCase() === "IS";
    const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayIso();
    if (!block || typeof position !== "number" || position < 0 || !fromExerciseId || !toExerciseId) {
      return NextResponse.json({ ok: false, error: "Missing block/position/from/to" }, { status: 400 });
    }

    // Safety gate: the target MUST be a curated alternative of the original.
    const from = EXERCISES_BY_ID.get(fromExerciseId);
    const to = EXERCISES_BY_ID.get(toExerciseId);
    if (!from || !to) return NextResponse.json({ ok: false, error: "Unknown exercise" }, { status: 400 });
    if (!(from.alternatives ?? []).includes(toExerciseId)) {
      return NextResponse.json({ ok: false, error: "Not a safe alternative for this exercise" }, { status: 400 });
    }

    const teamId = await getPlayerTeamId(sb, playerId);

    // 1. Log the swap (durable record + coach visibility).
    const { error: logErr } = await sb.from("player_exercise_swaps").upsert(
      {
        player_id: playerId,
        team_id: teamId,
        entry_date: date,
        block,
        position,
        from_exercise_id: fromExerciseId,
        to_exercise_id: toExerciseId,
        from_name: exName(fromExerciseId, isIS),
        to_name: exName(toExerciseId, isIS),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,entry_date,block,position" },
    );
    if (logErr) return NextResponse.json({ ok: false, error: logErr.message }, { status: 500 });

    // 2. Rewrite the matching item in today's structure so the card updates now.
    const applied = await rewriteStructure(sb, playerId, date, block, position, {
      toId: toExerciseId,
      fromId: fromExerciseId,
      newName: exName(toExerciseId, isIS),
      alternatives: safeAlternatives(toExerciseId, isIS),
      note: isIS
        ? `Þú skiptir úr ${exName(fromExerciseId, true)} (öruggur valkostur)`
        : `You swapped from ${exName(fromExerciseId, false)} (safe alternative)`,
    });

    return NextResponse.json({ ok: true, structureUpdated: applied });
  } catch (e) {
    const message = toMessage(e);
    const code = message === "Unauthorized" ? 401 : /not mapped/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

export async function DELETE(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const { playerId } = await requireAuthedPlayerId(sb, req);
    const body = (await req.json().catch(() => null)) as
      | { block?: string; position?: number; date?: string; lang?: string }
      | null;
    const block = body?.block;
    const position = body?.position;
    const isIS = String(body?.lang ?? "").toUpperCase() === "IS";
    const date = body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : todayIso();
    if (!block || typeof position !== "number") {
      return NextResponse.json({ ok: false, error: "Missing block/position" }, { status: 400 });
    }

    // Read the log row to know the original exercise, delete it, then restore the card.
    const { data: row } = await sb
      .from("player_exercise_swaps")
      .select("from_exercise_id")
      .eq("player_id", playerId)
      .eq("entry_date", date)
      .eq("block", block)
      .eq("position", position)
      .maybeSingle();
    await sb.from("player_exercise_swaps").delete()
      .eq("player_id", playerId).eq("entry_date", date).eq("block", block).eq("position", position);

    const fromId = (row as { from_exercise_id?: string } | null)?.from_exercise_id ?? null;
    let applied = false;
    if (fromId) {
      applied = await rewriteStructure(sb, playerId, date, block, position, {
        toId: fromId,
        fromId,
        newName: exName(fromId, isIS),
        alternatives: safeAlternatives(fromId, isIS),
        note: undefined, // clears the player-swap note
      });
    }
    return NextResponse.json({ ok: true, structureUpdated: applied });
  } catch (e) {
    const message = toMessage(e);
    const code = message === "Unauthorized" ? 401 : /not mapped/i.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status: code });
  }
}

/** Replace one item in the stored today-structure by (block, position). Matches the
 *  block by its localized title and the position within that block's items. Keeps the
 *  dose (sets/reps/rest/method); updates name + exerciseId + alternatives + note. */
async function rewriteStructure(
  sb: ReturnType<typeof getSupabaseAdmin>,
  playerId: string,
  date: string,
  block: string,
  position: number,
  next: { toId: string; fromId: string; newName: string; alternatives: { id: string; name: string }[]; note?: string },
): Promise<boolean> {
  const { data } = await sb
    .from("player_today_strength_override")
    .select("structure")
    .eq("player_id", playerId)
    .eq("entry_date", date)
    .maybeSingle();
  const structure = (data as { structure?: TodayStructureBlock[] } | null)?.structure;
  if (!Array.isArray(structure)) return false;

  const b = structure.find((x) => x.block === block);
  if (!b || !Array.isArray(b.items) || position < 0 || position >= b.items.length) return false;
  const item = b.items[position] as TodayStructureItem;
  // Only rewrite if this really is the slot we think (id matches the from OR the item
  // currently has no id — defensive against a re-sent session).
  const updated: TodayStructureItem = {
    ...item,
    name: next.newName,
    exerciseId: next.toId,
    alternatives: next.alternatives.length ? next.alternatives : undefined,
  };
  if (next.note) updated.note = next.note;
  else if (updated.note && /swapped from|skiptir úr/i.test(updated.note)) delete updated.note;
  b.items[position] = updated;

  const { error } = await sb
    .from("player_today_strength_override")
    .update({ structure, updated_at: new Date().toISOString() })
    .eq("player_id", playerId)
    .eq("entry_date", date);
  return !error;
}
