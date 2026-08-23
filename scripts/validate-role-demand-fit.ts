/**
 * Role-Demand Fit — real-data validation harness (read-only, internal).
 *
 * Runs the ACTUAL engine (loadAthleteProfilesForTeam + computeRoleDemandFit) over the live
 * Breiðablik squad and prints the Step-1 dump + Step-3 discrimination + Step-4 sensitivity +
 * Step-5 missing-data checks from role-demand-fit-spec's validation plan. Writes a local
 * fixture (real names → NOT committed) so re-runs are comparable. Logs the weight version.
 *
 *   npx tsx scripts/validate-role-demand-fit.ts
 *
 * Reads Supabase creds from .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Descriptive only — never touches the readiness colour or the daily decision.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { loadAthleteProfilesForTeam } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { computeRoleDemandFit, driverArchetypeFromProfile } from "@/lib/micropulse/roleDemandFit";
import { juPositionGroup } from "@/lib/micropulse/positionStyle";
import { ROLE_DEMAND_FIT, resolveRoleFit } from "@/lib/micropulse/roleModel";
import type { AthleteProfile, QualityId } from "@/lib/micropulse/playerAnalysis/athleteProfile";

const TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c"; // Breiðablik (football)
const OBV_KEY = "OBV";

/** Minimal .env.local loader (existing env wins). */
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) { const val = m[2].replace(/^["']|["']$/g, ""); if (!(m[1] in process.env)) process.env[m[1]] = val; }
    }
  } catch { /* env may already be set */ }
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const obvOf = (m: unknown): number | null => (m && typeof m === "object" ? num((m as Record<string, unknown>)[OBV_KEY]) : null);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };

/** Demand-weighted mean of position percentiles over covered qualities (mirrors the engine). */
function engineFitWith(profile: AthleteProfile | null, weights: Partial<Record<QualityId, number>>): number | null {
  if (!profile) return null;
  let wSum = 0, acc = 0;
  for (const q of Object.keys(weights) as QualityId[]) {
    const pctl = profile.qualities.find((x) => x.id === q)?.positionPercentile ?? null;
    if (pctl == null) continue;
    wSum += weights[q] ?? 0; acc += (weights[q] ?? 0) * pctl;
  }
  return wSum ? acc / wSum : null;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const weightVersion = createHash("sha1").update(JSON.stringify(ROLE_DEMAND_FIT)).digest("hex").slice(0, 10);
  console.log(`\n=== Role-Demand Fit validation — weight version ${weightVersion} — ${new Date().toISOString().slice(0, 10)} ===\n`);

  const { roster, profiles } = await loadAthleteProfilesForTeam(TEAM_ID);
  const outfield = roster.filter((r) => juPositionGroup(r.position, r.sport) != null);

  // Output per-90 (match OBV mean) vs season OBV baseline, one query pair per player.
  async function loadOutput(playerId: string) {
    const { data: pm } = await sb.from("player_match_stats").select("match_date, metrics").eq("team_id", TEAM_ID).eq("player_id", playerId);
    const byDate = new Map<string, number>();
    for (const r of (pm ?? []) as Array<Record<string, unknown>>) { const d = String(r.match_date ?? ""); const v = obvOf(r.metrics); if (d && v != null && !byDate.has(d)) byDate.set(d, v); }
    const vals = [...byDate.values()];
    const per90 = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    const { data: ss } = await sb.from("player_season_stats").select("metrics").eq("team_id", TEAM_ID).eq("player_id", playerId);
    let baseline: number | null = null;
    for (const s of (ss ?? []) as Array<Record<string, unknown>>) { const v = obvOf(s.metrics); if (v != null) { baseline = v; break; } }
    return per90 == null && baseline == null ? null : { per90, baselinePer90: baseline, matches: vals.length };
  }

  type Row = { name: string; pos: string | null; juGroup: string | null; subRole: string | null; engineFit: number | null; band: string; driverFit: string; outputRead: string; watchItem: string; confidence: string; coverage: string };
  const rows: Row[] = [];
  for (const r of outfield) {
    const profile = profiles.get(r.id) ?? null;
    const output = await loadOutput(r.id);
    const read = computeRoleDemandFit({ playerId: r.id, name: r.full_name, position: r.position, sport: r.sport, profile, driver: driverArchetypeFromProfile(profile), output });
    rows.push({
      name: r.full_name, pos: r.position, juGroup: read.juGroup, subRole: read.subRole,
      engineFit: read.engine.score, band: read.engine.band, driverFit: read.driver.fit, outputRead: read.output.read,
      watchItem: read.watch.map((w) => `${w.label.en}(${Math.round(w.percentile)})`).join(", ") || "—",
      confidence: read.confidence, coverage: `E${read.coverage.engine ? 1 : 0}/D${read.coverage.driver ? 1 : 0}/O${read.coverage.output ? 1 : 0}`,
    });
  }
  rows.sort((a, b) => (b.engineFit ?? -1) - (a.engineFit ?? -1));

  // Step 1 dump.
  console.log("STEP 1 — real-data sample (sorted by engine-fit):\n");
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
  console.log([pad("name", 22), pad("pos", 5), pad("juGrp", 6), pad("subRole", 12), pad("fit", 5), pad("band", 8), pad("driver", 9), pad("output", 12), pad("conf", 9), pad("cov", 9), "watch-item"].join(" "));
  console.log("-".repeat(140));
  for (const r of rows) {
    console.log([pad(r.name, 22), pad(r.pos ?? "?", 5), pad(r.juGroup ?? "?", 6), pad(r.subRole ?? "?", 12), pad(String(r.engineFit ?? "–"), 5), pad(r.band, 8), pad(r.driverFit, 9), pad(r.outputRead, 12), pad(r.confidence, 9), pad(r.coverage, 9), r.watchItem].join(" "));
  }

  // Step 3 — discrimination.
  const scored = rows.filter((r) => r.engineFit != null).map((r) => r.engineFit as number);
  console.log(`\nSTEP 3 — discrimination: n=${scored.length}, min=${Math.min(...scored)}, median=${median(scored)}, max=${Math.max(...scored)}`);
  const buckets = { "elite ≥80": 0, "solid 55-79": 0, "below <55": 0 } as Record<string, number>;
  for (const v of scored) buckets[v >= 80 ? "elite ≥80" : v >= 55 ? "solid 55-79" : "below <55"]++;
  console.log("  distribution:", buckets);
  console.log("  by position (juGroup): rank within group —");
  for (const g of ["WOP", "WDP", "CMP", "CDP", "COP"]) {
    const inG = rows.filter((r) => r.juGroup === g && r.engineFit != null);
    if (inG.length) console.log(`    ${g}: ${inG.map((r) => `${r.name.split(" ")[0]} ${r.engineFit}`).join("  >  ")}`);
  }

  // Step 4 — sensitivity: bump winger aerobic 0.6 → 0.8, recompute engine-fit for WOP players.
  console.log("\nSTEP 4 — sensitivity (winger aerobic_endurance 0.6 → 0.8):");
  const classic = resolveRoleFit("WOP", "classic").demand.weights;
  const bumped = { ...classic, aerobic_endurance: 0.8 };
  for (const r of rows.filter((r) => r.juGroup === "WOP")) {
    const profile = profiles.get(roster.find((x) => x.full_name === r.name)?.id ?? "") ?? null;
    const before = engineFitWith(profile, classic), after = engineFitWith(profile, bumped);
    console.log(`    ${pad(r.name, 22)} ${before == null ? "–" : before.toFixed(1)} → ${after == null ? "–" : after.toFixed(1)}  (Δ ${before != null && after != null ? (after - before).toFixed(1) : "–"})`);
  }

  // Step 5 — missing-data path: pick the top-scored player, drop GPS (profile=null) and drop output.
  const probe = rows.find((r) => r.engineFit != null);
  if (probe) {
    const rp = roster.find((x) => x.full_name === probe.name)!;
    const profile = profiles.get(rp.id) ?? null;
    const output = await loadOutput(rp.id);
    const full = computeRoleDemandFit({ playerId: rp.id, name: rp.full_name, position: rp.position, sport: rp.sport, profile, driver: driverArchetypeFromProfile(profile), output });
    const noGps = computeRoleDemandFit({ playerId: rp.id, name: rp.full_name, position: rp.position, sport: rp.sport, profile: null, driver: null, output });
    const noOut = computeRoleDemandFit({ playerId: rp.id, name: rp.full_name, position: rp.position, sport: rp.sport, profile, driver: driverArchetypeFromProfile(profile), output: null });
    console.log(`\nSTEP 5 — missing-data path (probe: ${probe.name}):`);
    console.log(`    full:    engine=${full.engine.band} output=${full.output.read} conf=${full.confidence}`);
    console.log(`    no GPS:  engine=${noGps.engine.band} output=${noGps.output.read} conf=${noGps.confidence}  (engine greys out, softens)`);
    console.log(`    no out:  engine=${noOut.engine.band} output=${noOut.output.read} conf=${noOut.confidence}  (output=unknown, engine still reads)`);
  }

  // Fixture (real names → internal only, not committed).
  const outPath = resolve(process.cwd(), "src/lib/micropulse/__tests__/roleDemandFit.realsample.json");
  writeFileSync(outPath, JSON.stringify({ weightVersion, generatedAt: new Date().toISOString().slice(0, 10), rows }, null, 2));
  console.log(`\nFixture written (internal, uncommitted): ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
