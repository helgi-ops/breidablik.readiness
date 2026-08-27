/**
 * Robustness coach-signal — real-data validation (read-only, internal).
 *
 * Runs the ACTUAL team loader (loadTeamRobustnessWatch → loadRobustnessWatch per
 * player) + the two derives over the live Breiðablik squad for today, and prints
 * the level distribution + whether the team-strip chip fires + the per-player
 * attention-row chips. The gate: the TEAM strip must be an exception (elevated or
 * a ≥3 cluster), never firing on a lone watch — the robustness base rate makes a
 * lone-watch strip chip show ~80% of days.
 *
 *   npx tsx scripts/validate-robustness-signal.ts
 *
 * Reads Supabase creds from .env.local. Descriptive only — never touches the colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadTeamRobustnessWatch } from "@/lib/micropulse/robustnessWatch/teamLoad";
import { deriveRobustnessTeamSignal, derivePlayerRobustnessSignals, isActionable } from "@/lib/micropulse/coachSignals";

const TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c"; // Breiðablik (football)

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) { const val = m[2].replace(/^["']|["']$/g, ""); if (!(m[1] in process.env)) process.env[m[1]] = val; }
    }
  } catch { /* env may already be set */ }
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const asOf = new Date().toISOString().slice(0, 10);

  console.log(`\n=== Robustness signal validation — Breiðablik — ${asOf} ===\n`);

  const t = Date.now();
  const reads = await loadTeamRobustnessWatch(sb, TEAM_ID, asOf);
  console.log(`Loaded ${reads.length} players in ${Date.now() - t}ms\n`);

  const lite = reads.map((r) => ({ playerId: r.playerId, name: r.playerName, level: r.level, verdict: r.verdict, counterfactual: r.counterfactual, confidence: r.confidence }));
  const dist: Record<string, number> = { steady: 0, watch: 0, elevated: 0 };
  for (const r of lite) dist[r.level] = (dist[r.level] ?? 0) + 1;
  console.log(`Level distribution : ${JSON.stringify(dist)}`);
  for (const r of lite) if (r.level !== "steady") console.log(`   • ${r.name.padEnd(24)} ${r.level.toUpperCase()}  conf=${r.confidence}  "${r.verdict.en}"`);

  const team = deriveRobustnessTeamSignal(lite);
  const players = derivePlayerRobustnessSignals(lite);

  console.log(`\n--- Team-strip chip ---`);
  console.log(`level      : ${team.level}   actionable: ${isActionable(team)}`);
  console.log(`why (EN)   : ${team.why.en[0] ?? "(silent)"}`);
  console.log(`\n--- Per-player attention-row chips (${players.length}) ---`);
  for (const p of players) {
    const nm = lite.find((r) => r.playerId === p.playerId)?.name ?? p.playerId;
    console.log(`   • ${nm.padEnd(24)} [${p.signal.level}] "${p.signal.why.en[0]}" → ${p.signal.href}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
