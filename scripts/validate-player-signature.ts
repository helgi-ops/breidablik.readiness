/**
 * Player signature / archetype — real-data validation (read-only, internal).
 *   npx tsx scripts/validate-player-signature.ts
 * Runs the live engine over the Breiðablik squad and prints each outfielder's archetype +
 * nearest neighbour, so the read can be eyeballed against coach intuition before trusting it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { driverArchetypeFromProfile } from "@/lib/micropulse/roleDemandFit";
import { loadPlayerOutput } from "@/lib/micropulse/loadPlayerOutput";
import { computePlayerSignature, type SignaturePlayer, type OutputQualifier } from "@/lib/micropulse/playerSignature";
import type { AthleteProfile, QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

const TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (mm && !(mm[1] in process.env)) process.env[mm[1]] = mm[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* env may be set */ }
}
const vectorOf = (p: AthleteProfile | null): Partial<Record<QualityId, number>> => {
  const q: Partial<Record<QualityId, number>> = {};
  for (const r of p?.qualities ?? []) if (r.positionPercentile != null) q[r.id] = r.positionPercentile;
  return q;
};

async function main() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { roster, profiles } = await loadAthleteProfilesForTeam(TEAM_ID);
  const pool: SignaturePlayer[] = roster.map((r) => ({ playerId: r.id, name: r.full_name, position: r.position, qualities: vectorOf(profiles.get(r.id) ?? null) }));

  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log(`\n=== Player signature — ${new Date().toISOString().slice(0, 10)} ===\n`);
  console.log([pad("name", 22), pad("pos", 5), pad("archetype", 26), pad("output", 11), pad("conf", 7), "nearest (pool)"].join(" "));
  console.log("-".repeat(120));
  for (const r of roster) {
    const output = await loadPlayerOutput(sb, TEAM_ID, r.id);
    let outputRead: OutputQualifier | null = null;
    if (output && typeof output.per90 === "number" && typeof output.baselinePer90 === "number" && output.baselinePer90 !== 0) {
      const d = (output.per90 - output.baselinePer90) / Math.abs(output.baselinePer90);
      outputRead = d >= 0.1 ? "productive" : d <= -0.15 ? "under" : "at_norm";
    }
    const read = computePlayerSignature({
      target: { playerId: r.id, name: r.full_name, position: r.position, sport: r.sport, qualities: vectorOf(profiles.get(r.id) ?? null), driverPrimary: driverArchetypeFromProfile(profiles.get(r.id) ?? null)?.primary ?? null, outputRead },
      pool,
    });
    const near = read.neighbours.length ? `${read.neighbours[0].name.split(" ")[0]} ${read.neighbours[0].similarity}% (${read.neighbourPool})` : "—";
    console.log([pad(r.full_name, 22), pad(r.position ?? "?", 5), pad(read.archetypeLabel.en, 26), pad(read.outputRead ?? "—", 11), pad(read.confidence, 7), near].join(" "));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
