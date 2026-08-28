/**
 * Post-match recovery coach-signal — real-data validation (read-only, internal).
 *
 * Runs the ACTUAL team loader (loadTeamRecoveryWatch → recoveryWatch per player)
 * + the two derives over the live Breiðablik squad, and prints the status
 * distribution, whether the team-strip chip fires, and the per-player chips. The
 * signal is naturally DORMANT except the MD+1..MD+3 window after a match — an
 * empty result off that window is correct, not a bug.
 *
 *   npx tsx scripts/validate-recovery-signal.ts
 *
 * Reads Supabase creds from .env.local. Descriptive only — never touches the colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadTeamRecoveryWatch } from "@/lib/micropulse/recoveryWatch/teamLoad";
import { deriveRecoveryTeamSignal, derivePlayerRecoverySignals, isActionable } from "@/lib/micropulse/coachSignals";

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

  console.log(`\n=== Post-match recovery signal validation — Breiðablik — ${asOf} ===\n`);

  const t = Date.now();
  const reads = await loadTeamRecoveryWatch(sb, TEAM_ID, asOf);
  console.log(`Loaded ${reads.length} evaluated players in ${Date.now() - t}ms`);
  if (reads.length === 0) {
    console.log("(empty — no recent match with post-match check-ins in the MD+1..MD+3 window → chip dormant, correct)\n");
    return;
  }

  const dist: Record<string, number> = {};
  for (const r of reads) dist[r.status] = (dist[r.status] ?? 0) + 1;
  console.log(`Status distribution   : ${JSON.stringify(dist)}`);
  const flagged = reads.filter((r) => r.confident && (r.status === "monitor" || r.status === "incomplete" || r.status === "escalate"));
  console.log(`Confident open watches: ${flagged.length} (the exception count)`);
  for (const r of reads) if (r.status !== "recovered" && r.status !== "na" && r.status !== "building") {
    console.log(`   • ${r.playerName.padEnd(24)} ${r.status.toUpperCase().padEnd(11)} MD+${r.mdOffset ?? "?"}  confident=${r.confident}`);
  }

  const lite = reads.map((r) => ({ playerId: r.playerId, name: r.playerName, status: r.status, mdOffset: r.mdOffset, confident: r.confident }));
  const team = deriveRecoveryTeamSignal(lite);
  const players = derivePlayerRecoverySignals(lite);

  console.log(`\n--- Team-strip chip ---`);
  console.log(`level      : ${team.level}   actionable: ${isActionable(team)}`);
  console.log(`why (EN)   : ${team.why.en[0] ?? "(silent)"}`);
  console.log(`why (IS)   : ${team.why.is[0] ?? "(þögult)"}`);
  console.log(`\n--- Per-player attention-row chips (${players.length}) ---`);
  for (const p of players) {
    const nm = reads.find((r) => r.playerId === p.playerId)?.playerName ?? p.playerId;
    console.log(`   • ${nm.padEnd(24)} [${p.signal.level}] "${p.signal.why.en[0]}"`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
