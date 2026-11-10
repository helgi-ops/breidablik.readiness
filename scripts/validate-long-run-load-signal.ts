/**
 * Long-run load coach-signal (`long_run_load`) — real-data validation (read-only, internal).
 *
 * Runs the ACTUAL team evaluator (evaluateTeamLongRunLoad → fetchRows → computeImaRunningLoad) over a
 * window of days for a team and prints the flag rates: strong spikes (ratio ≥1.5) and deficits (≤0.5)
 * as a share of evaluable present player-days. The gate: each side must stay RARE (<20%), an exception,
 * not the squad every day. Then prints today's team-strip chip and the per-player chips, and (with
 * --hk) repeats today for HK to show the time measure reads on indoor days.
 *
 *   npx tsx scripts/validate-long-run-load-signal.ts [--days 120] [--asof YYYY-MM-DD] [--team <uuid>] [--hk]
 *       [--measure matchPace|all] [--min-chronic <s/day>]
 *
 * --measure all replays the pre-Nov-2026 measure (all long-run time, jogs included) for the before/after.
 * `server-only` is not installed outside Next: run with NODE_PATH pointing at a folder holding an empty
 * `server-only` package.
 *
 * Reads Supabase creds from .env.local. Descriptive only — never touches the colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { evaluateTeamLongRunLoad, loadTeamLongRunLoadSignals, type LongRunMeasure } from "@/lib/micropulse/longRuns/signalLoad";
import { deriveLongRunLoadTeamSignal, derivePlayerLongRunLoadSignals, isActionable } from "@/lib/micropulse/coachSignals";

const BREIDABLIK = "94b52a06-0b83-48da-8664-639ec3486a0c";
const HK = "252f66c6-2ad0-4f92-9706-f7b83243cb45";

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) { const val = m[2].replace(/^["']|["']$/g, ""); if (!(m[1] in process.env)) process.env[m[1]] = val; }
    }
  } catch { /* env may already be set */ }
}

const arg = (k: string): string | null => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] ?? null : null; };
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const asOf = arg("--asof") ?? new Date().toISOString().slice(0, 10);
  const days = Number(arg("--days") ?? 120);
  const teamId = arg("--team") ?? BREIDABLIK;
  const measure = (arg("--measure") ?? "matchPace") as LongRunMeasure;
  const minArg = arg("--min-chronic");
  const opts = { measure, ...(minArg != null ? { minChronicSecDay: Number(minArg) } : {}) };

  console.log(`\n=== long_run_load signal validation — team ${teamId} — ${days} days to ${asOf} — measure ${measure}${minArg != null ? `, min chronic ${minArg} s/day` : ""} ===\n`);

  let basisAll = 0, presentDays = 0, evaluablePresent = 0, strong = 0, climbs = 0, deficits = 0, squadLightDeficits = 0, squadLightDays = 0, gaps = 0;
  const squadLight = (r: { squadRatio: number | null }) => r.squadRatio != null && r.squadRatio <= 0.6; // mirrors SQUAD_LIGHT_RATIO in the derive
  const t = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(asOf, -i);
    const { reads } = await evaluateTeamLongRunLoad(sb, teamId, d, opts);
    const present = reads.filter((r) => r.presentToday);
    if (present.length < 6) continue; // not a team day
    presentDays += 1;
    evaluablePresent += present.length;
    basisAll += present.filter((r) => r.basis === "all").length;
    strong += present.filter((r) => r.flagged && r.direction === "spike" && r.ratio >= 1.5).length;
    climbs += present.filter((r) => r.flagged && r.direction === "spike" && r.ratio < 1.5).length;
    const rawDef = present.filter((r) => r.flagged && r.direction === "deficit");
    deficits += rawDef.filter((r) => !squadLight(r)).length;
    squadLightDeficits += rawDef.filter(squadLight).length;
    if (present.some(squadLight)) squadLightDays += 1;
    gaps += present.filter((r) => r.acuteGap).length;
  }
  const pct = (n: number) => evaluablePresent ? `${((100 * n) / evaluablePresent).toFixed(1)}%` : "—";
  console.log(`Team days evaluated     : ${presentDays}  (${Date.now() - t} ms)`);
  console.log(`Evaluable player-days   : ${evaluablePresent}  (present today, confident 28-day base)`);
  console.log(`Read on all long runs    : ${basisAll}  (pace unknown in the 28-day window → all long-run time)`);
  console.log(`Strong spikes (≥1.5)    : ${strong}  → ${pct(strong)}   ${strong / Math.max(1, evaluablePresent) < 0.2 ? "within budget" : "OVER 20% — tighten"}`);
  console.log(`Climbs 1.3–1.5 (cluster): ${climbs}  → ${pct(climbs)}`);
  console.log(`Individual deficits     : ${deficits}  → ${pct(deficits)}   ${deficits / Math.max(1, evaluablePresent) < 0.2 ? "within budget" : "OVER 20% — tighten"}   (≤0.5 while the squad is NOT light)`);
  console.log(`Squad-light-week reads  : ${squadLightDeficits} on ${squadLightDays} team days  (≤0.5 while the squad median ≤0.6 → one team line, no per-player chips)`);
  console.log(`Acute-window data gaps  : ${gaps}  (deficit suppressed on these)`);

  for (const [label, id] of [["today", teamId], ...(process.argv.includes("--hk") ? [["HK (indoor days)", HK]] : [])] as Array<[string, string]>) {
    const reads = await loadTeamLongRunLoadSignals(sb, id, asOf);
    const team = deriveLongRunLoadTeamSignal(reads);
    const players = derivePlayerLongRunLoadSignals(reads);
    console.log(`\n--- ${label}: team-strip chip ---`);
    console.log(`flagged reads: ${reads.length}   level: ${team.level}   actionable: ${isActionable(team)}`);
    for (const w of team.why.en) console.log(`why (EN)   : ${w}`);
    for (const w of team.why.is) console.log(`why (IS)   : ${w}`);
    console.log(`--- ${label}: per-player chips (${players.length}) ---`);
    for (const p of players) {
      const nm = reads.find((r) => r.playerId === p.playerId)?.name ?? p.playerId;
      console.log(`   • ${nm.padEnd(24)} [${p.signal.level}] "${p.signal.why.en[0]}" → ${p.signal.href}`);
    }
  }
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
