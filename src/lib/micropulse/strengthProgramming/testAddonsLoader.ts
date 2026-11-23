/**
 * Reads the strength tests behind testAddons.ts (brief §4b): the player's latest valid NordBord test and latest
 * ForceFrame hip adduction test, each with the one before it.
 *
 * ForceFrame: the result table stores the stronger pad per side, which is sometimes the outer pad (abduction). The
 * adduction value (the inner pads: what the Copenhagen trains) comes from the raw test (`innerLeftMaxForce` /
 * `innerRightMaxForce`). The previous test must be the same hip angle (45 / 60 / 90°), or the drop is not comparable.
 *
 * Only tests inside the freshness windows can fire, so nothing older is read further. Never the readiness colour.
 * Best-effort: a failed read is no test.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { VALD_FLAG_WINDOW_DAYS } from "@/lib/micropulse/vald/flagFreshness";
import type { BilateralTest, StrengthTests } from "./testAddons";

const DAY = 86_400_000;
const since = (todayIso: string, days: number) => new Date(Date.parse(`${todayIso}T00:00:00Z`) - days * DAY).toISOString();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

type Row = { test_timestamp: string; left_peak_force_n: number | null; right_peak_force_n: number | null; raw_test_id?: string | null; movement_pattern?: string | null; is_valid: boolean | null };

async function nordbord(sb: SupabaseClient, playerId: string, todayIso: string): Promise<BilateralTest | null> {
  const { data } = await sb
    .from("vald_nordbord_results")
    .select("test_timestamp, left_peak_force_n, right_peak_force_n, is_valid")
    .eq("microplayer_id", playerId)
    .lte("test_timestamp", `${todayIso}T23:59:59`)
    .order("test_timestamp", { ascending: false })
    .limit(10);
  const rows = ((data ?? []) as Row[]).filter((r) => r.is_valid !== false && num(r.left_peak_force_n) && num(r.right_peak_force_n));
  const [last, ...rest] = rows;
  if (!last || last.test_timestamp < since(todayIso, VALD_FLAG_WINDOW_DAYS.nordbordDays)) return null;
  const date = last.test_timestamp.slice(0, 10);
  const prev = rest.find((r) => r.test_timestamp.slice(0, 10) < date) ?? null;
  return {
    date, leftN: Number(last.left_peak_force_n), rightN: Number(last.right_peak_force_n),
    prev: prev ? { date: prev.test_timestamp.slice(0, 10), leftN: Number(prev.left_peak_force_n), rightN: Number(prev.right_peak_force_n) } : null,
  };
}

async function adduction(sb: SupabaseClient, playerId: string, todayIso: string): Promise<BilateralTest | null> {
  const { data } = await sb
    .from("vald_forceframe_results")
    .select("test_timestamp, left_peak_force_n, right_peak_force_n, raw_test_id, movement_pattern, is_valid")
    .eq("microplayer_id", playerId)
    .eq("test_type", "Hip AD/AB")
    .lte("test_timestamp", `${todayIso}T23:59:59`)
    .order("test_timestamp", { ascending: false })
    .limit(10);
  const rows = ((data ?? []) as Row[]).filter((r) => r.is_valid !== false && r.raw_test_id);
  const last = rows[0];
  if (!last || last.test_timestamp < since(todayIso, VALD_FLAG_WINDOW_DAYS.forceframeDays)) return null;
  const date = last.test_timestamp.slice(0, 10);
  const prevRow = rows.find((r) => r.test_timestamp.slice(0, 10) < date && r.movement_pattern === last.movement_pattern) ?? null;
  const ids = [last.raw_test_id, prevRow?.raw_test_id].filter((x): x is string => !!x);
  const { data: raw } = await sb
    .from("vald_raw_tests")
    .select("id, innerL:payload->>innerLeftMaxForce, innerR:payload->>innerRightMaxForce")
    .in("id", ids);
  const inner = new Map(((raw ?? []) as Array<{ id: string; innerL: unknown; innerR: unknown }>).map((r) => [r.id, { l: num(r.innerL), r: num(r.innerR) }]));
  const now = inner.get(last.raw_test_id!);
  if (!now?.l || !now.r) return null;
  const before = prevRow ? inner.get(prevRow.raw_test_id!) : undefined;
  return {
    date, leftN: now.l, rightN: now.r,
    prev: prevRow && before?.l && before.r ? { date: prevRow.test_timestamp.slice(0, 10), leftN: before.l, rightN: before.r } : null,
  };
}

export async function fetchStrengthTests(sb: SupabaseClient, playerId: string, todayIso: string): Promise<StrengthTests | null> {
  try {
    const [n, a] = await Promise.all([
      nordbord(sb, playerId, todayIso).catch(() => null),
      adduction(sb, playerId, todayIso).catch(() => null),
    ]);
    return n || a ? { nordbord: n, adduction: a } : null;
  } catch {
    return null;
  }
}
