/**
 * Focused loader for the player's daily "Recovery today" card.
 *
 * Reuses the SAME own-norm engine as the Signal Pack (buildWearableRecoveryInput +
 * wearableRecoveryContributor) so the card, the coach surface and the AI all agree —
 * but returns the latest raw reading too, so the card can show today's actual numbers
 * (HRV/RHR/recovery) with the cited verdict computed on the rolling baseline.
 *
 * Read-only; a SIDE signal. Never touches the readiness colour. Returns null when the
 * player has no wearable reading in the window (card self-hides).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWearableRecoveryInput,
  wearableRecoveryContributor,
  type WearableRecoveryInput,
  type WearableDailyRow,
} from "./wearableRecovery";
import type { SignalContributor, Voice } from "./types";

const WEARABLE_DAYS = 42;
const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
function addISO(d: string, n: number): string { const x = new Date(`${d}T00:00:00.000Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

export interface PlayerWearableRecovery {
  /** The cited own-norm contributor (verdict/why/counterfactual/detail/confidence/flagged). */
  contributor: SignalContributor;
  /** The input (markers + baselines) — lets the card draw per-metric vs-norm arrows. */
  input: WearableRecoveryInput;
  /** The latest actual reading in the window — what the card shows as today's numbers. */
  latest: {
    date: string;
    provider: string | null;
    hrvMs: number | null;
    restingHr: number | null;
    recovery: number | null;
    stress: number | null;
    bodyBattery: number | null;
  };
}

/** Load one player's daily recovery (own-norm). Null when no wearable data in the window. */
export async function loadPlayerWearableRecovery(
  sb: SupabaseClient,
  playerId: string,
  asOf: string,
  voice: Voice = "player",
): Promise<PlayerWearableRecovery | null> {
  const since = addISO(asOf, -WEARABLE_DAYS);
  const { data } = await sb
    .from("wearable_daily_data")
    .select("measurement_date, provider, hrv_rmssd_ms, resting_hr_bpm, provider_recovery_score, stress_avg, body_battery")
    .eq("player_id", playerId)
    .gte("measurement_date", since)
    .lte("measurement_date", asOf)
    .order("measurement_date", { ascending: true });

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  const rows: Array<WearableDailyRow & { provider: string | null }> = raw.map((r) => ({
    d: String(r.measurement_date ?? "").slice(0, 10),
    provider: (r.provider as string | null) ?? null,
    hrv: num(r.hrv_rmssd_ms),
    rhr: num(r.resting_hr_bpm),
    rec: num(r.provider_recovery_score),
    stress: num(r.stress_avg),
    body: num(r.body_battery),
  })).filter((r) => r.d);
  if (!rows.length) return null;

  const input = buildWearableRecoveryInput(rows, voice);
  if (!input) return null;
  const contributor = wearableRecoveryContributor(input);
  if (!contributor) return null;

  const latestOf = (pick: (r: WearableDailyRow) => number | null): number | null => {
    for (let i = rows.length - 1; i >= 0; i--) { const v = pick(rows[i]); if (v != null) return v; }
    return null;
  };
  const latestRow = [...rows].reverse().find((r) => r.hrv != null || r.rhr != null || r.rec != null) ?? rows[rows.length - 1];

  return {
    contributor,
    input,
    latest: {
      date: latestRow.d,
      provider: latestRow.provider,
      hrvMs: latestOf((r) => r.hrv),
      restingHr: latestOf((r) => r.rhr),
      recovery: latestOf((r) => r.rec),
      stress: latestOf((r) => r.stress),
      bodyBattery: latestOf((r) => r.body),
    },
  };
}
