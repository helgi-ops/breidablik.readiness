/**
 * Robustness watch (#5) - real-data validation harness (read-only, internal).
 *
 * The ML literature's over-flag warning is the acceptance gate (Haller 2023:
 * a classifier over-flags at ~25-player scale). This runs the ACTUAL engine
 * (loadRobustnessWatch) across the live Breiðablik squad over a window of dates
 * and measures:
 *
 *   1. FLAG RATE - how often "elevated" fires per player-day. If > ~15-20% it's
 *      over-sensitive -> recalibrate toward specificity before shipping the card.
 *   2. FACE VALIDITY - elevated days should cluster around real injuries, not
 *      scatter randomly (cross-ref player_injuries within +/-14 days).
 *   3. CONFIDENCE distribution - most players should reach >= medium; if not,
 *      the coverage gap is surfaced honestly, not guessed.
 *   4. NO COLOUR WRITE - static check that the module never writes the readiness
 *      colour path (readiness_entries / final_color).
 *
 *   npx tsx scripts/validate-robustness-watch.ts
 *
 * Reads Supabase creds from .env.local. Descriptive only - never touches the
 * readiness colour or the daily decision. Writes a local fixture (real names ->
 * NOT committed).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadRobustnessWatch } from "@/lib/micropulse/robustnessWatch/loader";

const TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c"; // Breiðablik (football)
const WINDOW_DAYS = 56;   // look back this far
const STEP_DAYS = 4;      // sample one as-of date every N days
const INJURY_PROXIMITY = 14; // days around an elevated day to count as "near an injury"

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) { const val = m[2].replace(/^["']|["']$/g, ""); if (!(m[1] in process.env)) process.env[m[1]] = val; }
    }
  } catch { /* env may already be set */ }
}

function addISO(d: string, n: number): string {
  const x = new Date(`${d}T00:00:00.000Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "-");

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const today = new Date().toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let i = WINDOW_DAYS; i >= 0; i -= STEP_DAYS) dates.push(addISO(today, -i));

  console.log(`\n=== Robustness watch validation - ${today} - window ${WINDOW_DAYS}d, step ${STEP_DAYS}d (${dates.length} dates) ===\n`);

  const { data: playerRows } = await sb.from("players").select("id, full_name").eq("team_id", TEAM_ID).eq("is_active", true);
  const players = (playerRows ?? []) as Array<{ id: string; full_name: string | null }>;
  if (!players.length) throw new Error("No active players for team");

  // Injuries for face-validity cross-ref.
  const { data: injRows } = await sb.from("player_injuries")
    .select("player_id, injury_date").in("player_id", players.map((p) => p.id));
  const injuriesBy = new Map<string, string[]>();
  for (const r of (injRows ?? []) as Array<{ player_id: string; injury_date: string | null }>) {
    if (!r.injury_date) continue;
    const arr = injuriesBy.get(r.player_id) ?? []; arr.push(String(r.injury_date).slice(0, 10)); injuriesBy.set(r.player_id, arr);
  }
  const nearInjury = (playerId: string, date: string): boolean => {
    const inj = injuriesBy.get(playerId) ?? [];
    return inj.some((d) => Math.abs(Date.parse(`${d}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) <= INJURY_PROXIMITY * 86_400_000);
  };

  const levelCounts = { steady: 0, watch: 0, elevated: 0 };
  const confCounts = { low: 0, moderate: 0, high: 0 };
  const perPlayer = new Map<string, { steady: number; watch: number; elevated: number; name: string }>();
  const contributorFlags = new Map<string, number>();
  let elevatedNearInjury = 0, elevatedTotal = 0, totalDays = 0;

  for (const p of players) {
    const acc = { steady: 0, watch: 0, elevated: 0, name: p.full_name ?? "Player" };
    for (const date of dates) {
      let w;
      try { w = await loadRobustnessWatch(sb, TEAM_ID, p.id, p.full_name ?? "Player", date); }
      catch (e) { console.error(`  ! ${p.full_name} @ ${date}:`, (e as Error).message); continue; }
      totalDays++;
      levelCounts[w.level]++; confCounts[w.confidence]++; acc[w.level]++;
      for (const c of w.contributors) if (c.flagged) contributorFlags.set(c.key, (contributorFlags.get(c.key) ?? 0) + 1);
      if (w.level === "elevated") { elevatedTotal++; if (nearInjury(p.id, date)) elevatedNearInjury++; }
    }
    perPlayer.set(p.id, acc);
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log(`STEP 1 - flag rate over ${totalDays} player-days (${players.length} players x ${dates.length} dates):`);
  console.log(`  steady:   ${pad(String(levelCounts.steady), 5)} ${pct(levelCounts.steady, totalDays)}`);
  console.log(`  watch:    ${pad(String(levelCounts.watch), 5)} ${pct(levelCounts.watch, totalDays)}`);
  console.log(`  elevated: ${pad(String(levelCounts.elevated), 5)} ${pct(levelCounts.elevated, totalDays)}`);
  const elevatedRate = totalDays ? levelCounts.elevated / totalDays : 0;
  const flaggedRate = totalDays ? (levelCounts.elevated + levelCounts.watch) / totalDays : 0;
  const gatePass = elevatedRate <= 0.20;
  console.log(`\n  GATE (elevated <= 20% of player-days): ${gatePass ? "PASS" : "FAIL"}  (elevated ${pct(levelCounts.elevated, totalDays)}, watch+elevated ${(flaggedRate * 100).toFixed(1)}%)`);

  console.log(`\nSTEP 2 - face validity: elevated days near a real injury (+/-${INJURY_PROXIMITY}d):`);
  console.log(`  ${elevatedNearInjury}/${elevatedTotal} elevated days within ${INJURY_PROXIMITY}d of an injury (${pct(elevatedNearInjury, elevatedTotal)})`);

  console.log(`\nSTEP 3 - confidence distribution:`);
  for (const k of ["high", "moderate", "low"] as const) console.log(`  ${pad(k, 9)} ${pad(String(confCounts[k]), 5)} ${pct(confCounts[k], totalDays)}`);

  console.log(`\nSTEP 4 - which contributors drive the flags:`);
  const sortedC = [...contributorFlags.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, n] of sortedC) console.log(`  ${pad(k, 20)} ${n}`);
  if (!sortedC.length) console.log("  (no flagged contributors in the window - the new mechanical/CMJ feeds are likely still null pre-resync)");

  console.log(`\nPER-PLAYER (elevated / watch / steady):`);
  const rows = [...perPlayer.values()].sort((a, b) => b.elevated - a.elevated || b.watch - a.watch);
  for (const r of rows) console.log(`  ${pad(r.name, 24)} E${r.elevated}  W${r.watch}  S${r.steady}`);

  // Static no-colour-write check: look for real write CALLS or a query against the
  // colour tables (mentions of readiness_entries/final_color in guardrail COMMENTS
  // are fine - only .from("<colour table>") or a write op counts).
  const src = readFileSync(resolve(process.cwd(), "src/lib/micropulse/robustnessWatch/loader.ts"), "utf8")
    + readFileSync(resolve(process.cwd(), "src/lib/micropulse/robustnessWatch/index.ts"), "utf8");
  const hasWrite = /\.(insert|update|upsert|delete)\(/.test(src);
  const readsColourTable = /\.from\(\s*["'](readiness_entries|v_coach_readiness_today_v8)["']/.test(src);
  const writesColour = hasWrite || readsColourTable;
  console.log(`\nSTEP 5 - no-colour-write check: ${writesColour ? "FAIL (found a write op / colour-table query)" : "PASS (read-only; no writes, no readiness_entries/final_color query)"}`);

  const outPath = resolve(process.cwd(), "src/lib/micropulse/__tests__/robustnessWatch.realsample.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: today, totalDays, levelCounts, confCounts, elevatedRate, gatePass, contributorFlags: Object.fromEntries(sortedC), perPlayer: rows }, null, 2));
  console.log(`\nFixture written (internal, uncommitted): ${outPath}`);
  console.log(`\nVERDICT: ${gatePass && !writesColour ? "SHIP-READY (gate passed, read-only)" : "HOLD (recalibrate before shipping the card)"}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
