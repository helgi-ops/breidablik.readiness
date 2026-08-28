/**
 * Belt-HR "hidden load" coach-signal — real-data validation (read-only, internal).
 *
 * Runs the ACTUAL team loader (loadTeamHrLoadSignals → loadHrForTeam) + the two
 * derives over the live Breiðablik squad, and prints the alignment distribution,
 * whether the team-strip chip fires, and the per-player attention-row chips. The
 * gate: a hidden-load exception must be RARE (a genuine heart-vs-effort mismatch on
 * a mature baseline), not most of the squad every day.
 *
 *   npx tsx scripts/validate-hr-load-signal.ts
 *
 * Reads Supabase creds from .env.local. Descriptive only — never touches the colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadTeamHrLoadSignals } from "@/lib/micropulse/hrLoad/signalLoad";
import { deriveHrLoadTeamSignal, derivePlayerHrLoadSignals, isActionable } from "@/lib/micropulse/coachSignals";

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

  console.log(`\n=== Belt-HR hidden-load signal validation — Breiðablik — ${asOf} ===\n`);

  const t = Date.now();
  const reads = await loadTeamHrLoadSignals(sb, TEAM_ID);
  console.log(`Loaded ${reads.length} belt reads in ${Date.now() - t}ms\n`);

  const dist: Record<string, number> = { aligned: 0, hidden_load: 0, low_cardio_response: 0, insufficient: 0 };
  const conf: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const r of reads) { dist[r.alignment] = (dist[r.alignment] ?? 0) + 1; conf[r.confidence] = (conf[r.confidence] ?? 0) + 1; }
  console.log(`Alignment distribution : ${JSON.stringify(dist)}`);
  console.log(`Confidence distribution: ${JSON.stringify(conf)}`);
  const confidentHidden = reads.filter((r) => r.alignment === "hidden_load" && r.confidence !== "low");
  console.log(`Confident hidden-load  : ${confidentHidden.length} (the exception count)`);
  for (const r of reads) if (r.alignment === "hidden_load") console.log(`   • ${r.name.padEnd(24)} conf=${r.confidence}  "${r.verdict.en}"`);

  const team = deriveHrLoadTeamSignal(reads);
  const players = derivePlayerHrLoadSignals(reads);

  console.log(`\n--- Team-strip chip ---`);
  console.log(`level      : ${team.level}   actionable: ${isActionable(team)}`);
  console.log(`why (EN)   : ${team.why.en[0] ?? "(silent)"}`);
  console.log(`why (IS)   : ${team.why.is[0] ?? "(þögult)"}`);
  console.log(`\n--- Per-player attention-row chips (${players.length}) ---`);
  for (const p of players) {
    const nm = reads.find((r) => r.playerId === p.playerId)?.name ?? p.playerId;
    console.log(`   • ${nm.padEnd(24)} [${p.signal.level}] "${p.signal.why.en[0]}" → ${p.signal.href}`);
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
