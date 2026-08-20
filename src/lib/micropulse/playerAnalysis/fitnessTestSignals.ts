/**
 * Field-test → aerobic-endurance capacity signal (for Lite / no-GPS squads).
 *
 * Fills the `aerobic_endurance` quality (Critical Speed, km/h) from a coach-run field test
 * when a player has NO GPS power-curve CS. It is merged BEFORE the GPS Critical Speed, so a
 * player with real GPS CS keeps it (GPS-preferred); only test-only players get the estimate.
 *
 * Same construct, one scale: MAS (km/h) → a Critical-Speed estimate via CS ≈ 0.875 × MAS
 * (Pettitt 2016; matches the app's provisional 0.85–0.90 CS↔MAS band). The 30-15 IFT final
 * velocity (VIFT) reads higher than a continuous MAS, so it is shrunk to a MAS-equivalent
 * first (Buchheit 2008 — an approximation; the source label carries the provenance).
 * Descriptive conditioning — never touches the readiness colour or the daily decision.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { FITNESS_TESTS, isFitnessTestType } from "@/lib/micropulse/load/fitnessTests";
import type { AthleteSignalSet } from "@/lib/micropulse/playerAnalysis/athleteProfile";

const CS_FROM_MAS = 0.875;   // Critical Speed as a fraction of MAS (Pettitt 2016)
const MAS_FROM_VIFT = 0.86;  // continuous-MAS equivalent of the 30-15 VIFT (Buchheit 2008, approx.)

type FtRow = { player_id: string; test_date: string | null; test_type: string | null; result_value: number | null; mas_kmh: number | null };

/** Per player: the freshest field test that yields an aerobic speed → aerobic_endurance (CS est.). */
export async function loadFitnessTestSignals(teamId: string): Promise<Map<string, AthleteSignalSet>> {
  const sb = getSupabaseServer();
  const { data } = await sb.from("player_fitness_test")
    .select("player_id, test_date, test_type, result_value, mas_kmh")
    .eq("team_id", teamId).order("test_date", { ascending: false }).limit(5000);

  const out = new Map<string, AthleteSignalSet>();
  for (const r of (data ?? []) as FtRow[]) {
    const pid = String(r.player_id ?? ""); if (!pid || out.has(pid)) continue; // rows are newest-first → first hit wins
    const mas = num(r.mas_kmh);
    const vift = r.test_type === "ift_30_15" ? num(r.result_value) : null;
    const masKmh = mas != null ? mas : vift != null ? vift * MAS_FROM_VIFT : null;
    if (masKmh == null || masKmh <= 0) continue;
    const label = isFitnessTestType(r.test_type ?? "") ? FITNESS_TESTS[r.test_type as keyof typeof FITNESS_TESTS].label.en : "field test";
    out.set(pid, {
      aerobic_endurance: {
        value: Math.round(masKmh * CS_FROM_MAS * 10) / 10,
        unit: "km/h", source: `${label} → CS est.`, date: r.test_date ?? null, sampleSize: 1,
      },
    });
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
