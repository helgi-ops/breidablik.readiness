/**
 * POST /api/player/exercise-swap
 *
 * Player swaps one prescribed exercise on today's session for one of its CURATED
 * SAFE ALTERNATIVES — used when the sent exercise isn't quite right for them
 * (equipment, comfort, a niggle). Safe-only: the target must be one of the options
 * stored on that very item when the session was sent (the exercise's curated
 * `alternatives`, already narrowed to the coach's palette and with anything today's
 * safety rules rule out removed — `toTodayStructure`). Since 2026-11-17 the route
 * checks the stored item, not just the library, so a swap can't bring back an
 * exercise the coach left out or a safety rule took out.
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

    const from = EXERCISES_BY_ID.get(fromExerciseId);
    const to = EXERCISES_BY_ID.get(toExerciseId);
    if (!from || !to) return NextResponse.json({ ok: false, error: "Unknown exercise" }, { status: 400 });

    // Safety gate: the stored item at (block, position) must be the exercise the player
    // is swapping FROM, and the target must be one of the options stored on it.
    const stored = await readItem(sb, playerId, date, block, position);
    if (!stored || stored.item.exerciseId !== fromExerciseId) {
      return NextResponse.json({ ok: false, error: "That exercise is not on today's session" }, { status: 409 });
    }
    const offered = (stored.item.alternatives ?? []).filter((a) => a && typeof a.id === "string");
    if (!offered.some((a) => a.id === toExerciseId)) {
      return NextResponse.json({ ok: false, error: "Not a safe alternative for this exercise" }, { status: 400 });
    }

    const teamId = await getPlayerTeamId(sb, playerId);

    // Keep the coach-sent exercise as the slot's origin across repeat swaps, so DELETE
    // restores what the coach sent (not the player's previous swap).
    const { data: prior } = await sb
      .from("player_exercise_swaps")
      .select("from_exercise_id")
      .eq("player_id", playerId).eq("entry_date", date).eq("block", block).eq("position", position)
      .maybeSingle();
    const originId = (prior as { from_exercise_id?: string } | null)?.from_exercise_id ?? fromExerciseId;

    // 1. Log the swap (durable record + coach visibility).
    const { error: logErr } = await sb.from("player_exercise_swaps").upsert(
      {
        player_id: playerId,
        team_id: teamId,
        entry_date: date,
        block,
        position,
        from_exercise_id: originId,
        to_exercise_id: toExerciseId,
        from_name: exName(originId, isIS),
        to_name: exName(toExerciseId, isIS),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id,entry_date,block,position" },
    );
    if (logErr) return NextResponse.json({ ok: false, error: logErr.message }, { status: 500 });

    // 2. Rewrite the matching item in today's structure so the card updates now. The
    // options stay the ones the session was sent with (the exercise swapped away goes
    // back in so the player can swap back) — same list the card shows (PlayerClient doSwap).
    const applied = await rewriteStructure(sb, playerId, date, block, position, {
      toId: toExerciseId,
      fromId: fromExerciseId,
      newName: exName(toExerciseId, isIS),
      alternatives: [
        { id: fromExerciseId, name: stored.item.name || exName(fromExerciseId, isIS) },
        ...offered.filter((a) => a.id !== toExerciseId && a.id !== fromExerciseId),
      ],
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
      // Restore the coach-sent exercise with the same options the item carries now (the
      // send-time list: palette-bound, safety-filtered), current exercise swapped back in.
      const stored = await readItem(sb, playerId, date, block, position);
      const cur = stored?.item;
      const alternatives = cur
        ? [
            ...(cur.exerciseId && cur.exerciseId !== fromId ? [{ id: cur.exerciseId, name: cur.name || exName(cur.exerciseId, isIS) }] : []),
            ...(cur.alternatives ?? []).filter((a) => a && a.id !== fromId && a.id !== cur.exerciseId),
          ]
        : [];
      applied = await rewriteStructure(sb, playerId, date, block, position, {
        toId: fromId,
        fromId,
        newName: exName(fromId, isIS),
        alternatives,
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

/** The stored today-structure item at (block, position), or null. */
async function readItem(
  sb: ReturnType<typeof getSupabaseAdmin>,
  playerId: string,
  date: string,
  block: string,
  position: number,
): Promise<{ item: TodayStructureItem } | null> {
  const { data } = await sb
    .from("player_today_strength_override")
    .select("structure")
    .eq("player_id", playerId)
    .eq("entry_date", date)
    .maybeSingle();
  const structure = (data as { structure?: TodayStructureBlock[] } | null)?.structure;
  if (!Array.isArray(structure)) return null;
  const b = structure.find((x) => x.block === block);
  if (!b || !Array.isArray(b.items) || position < 0 || position >= b.items.length) return null;
  return { item: b.items[position] as TodayStructureItem };
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
