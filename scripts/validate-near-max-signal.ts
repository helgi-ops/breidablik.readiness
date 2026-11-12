/**
 * Near-top-speed coach-signal (`near_max_exposure`) — real-data validation (read-only, internal).
 *
 * Replays the ACTUAL loader (`loadTeamNearMaxSignals`) for every day in a window and prints how many
 * outfield players would have been flagged per day: "due" (>10 d since a day at ≥90% of top speed) and
 * "long gap" (>21 d). Measured on Breiðablik's 2026 season (the data the marks were chosen on, May–Oct, every
 * 3rd day): 4.2 flagged per day, 1.5 of them in a long gap. Then prints today's chip for the team, and checks
 * that the player-app read (`loadPlayerNearMax`) agrees with the coach read for every flagged player.
 *
 *   npx tsx scripts/validate-near-max-signal.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--step 3] [--team <uuid>]
 *
 * Caveat: injuries are read as they stand today, so a player injured back then is not excluded in the replay.
 * `server-only` is not installed outside Next: run with NODE_PATH pointing at a folder holding an empty
 * `server-only` package. Reads Supabase creds from .env.local. Descriptive only — never touches the colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadTeamNearMaxSignals, loadPlayerNearMax } from "@/lib/micropulse/nearMaxExposure/signalLoad";
import { loadTeamSprintDropSignals } from "@/lib/micropulse/sprintSpeedDrop/signalLoad";
import { formatNearMaxForPlayer } from "@/lib/micropulse/nearMaxExposure/playerCopy";
import { deriveNearMaxTeamSignal, derivePlayerNearMaxSignals, dropDueWhereSprintSuppressed } from "@/lib/micropulse/coachSignals";

const BREIDABLIK = "94b52a06-0b83-48da-8664-639ec3486a0c";

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

  const team = arg("--team") ?? BREIDABLIK;
  const from = arg("--from") ?? "2026-05-01";
  const to = arg("--to") ?? "2026-10-20";
  const step = Math.max(1, Number(arg("--step") ?? 3));
  const today = new Date().toISOString().slice(0, 10);

  let days = 0, due = 0, long = 0, zero = 0;
  const perPlayer = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, step)) {
    const reads = await loadTeamNearMaxSignals(sb, team, d);
    days += 1;
    due += reads.length;
    long += reads.filter((r) => r.level === "long_gap").length;
    if (reads.length === 0) zero += 1;
    for (const r of reads) perPlayer.set(r.name, (perPlayer.get(r.name) ?? 0) + 1);
  }
  console.log(`team ${team} · ${from} → ${to} · every ${step} d · ${days} days replayed`);
  console.log(`flagged per day (>10 d, incl. long gap): ${(due / days).toFixed(1)}`);
  console.log(`of them long gap (>21 d):               ${(long / days).toFixed(1)}`);
  console.log(`days with nobody flagged:               ${Math.round((100 * zero) / days)}%`);
  console.log(`players ever flagged: ${perPlayer.size}; share of replayed days flagged, top 8:`);
  for (const [name, n] of [...perPlayer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${name.split(" ")[0].padEnd(14)} ${Math.round((100 * n) / days)}%`);
  }

  const now = await loadTeamNearMaxSignals(sb, team, today);
  const chip = deriveNearMaxTeamSignal(now);
  console.log(`\ntoday (${today}): ${now.length} flagged → team chip ${chip.level}`);
  for (const line of chip.why.en) console.log(`  ${line}`);
  for (const p of derivePlayerNearMaxSignals(now).slice(0, 3)) console.log(`  · ${p.signal.why.en.join(" ")} | ${p.signal.counterfactual?.en.split(". ")[0]}.`);

  // Player app vs coach: the same players, the same level, on a chosen day (default today).
  const parityDay = arg("--parity") ?? today;
  const { data: roster } = await sb.from("players").select("id").eq("team_id", team).eq("is_active", true);
  const coach = new Map(
    dropDueWhereSprintSuppressed(await loadTeamNearMaxSignals(sb, team, parityDay), await loadTeamSprintDropSignals(sb, team, parityDay))
      .map((r) => [r.playerId, r] as const),
  );
  let agree = 0, differ = 0, cards = 0;
  let sample: string | null = null;
  for (const p of (roster ?? []) as Array<{ id: string }>) {
    const mine = await loadPlayerNearMax(sb, p.id, parityDay);
    const card = mine ? formatNearMaxForPlayer(mine) : null;
    const c = coach.get(p.id);
    if ((card?.level ?? null) === (c?.level ?? null) && (card == null || mine?.daysSince === c?.daysSince)) agree += 1; else differ += 1;
    if (card) { cards += 1; sample ??= `${card.verdict.en} | ${card.facts.map((f) => f.en).join(" | ")} | ${card.confidence.en}`; }
  }
  console.log(`\nplayer app vs coach on ${parityDay}: ${agree} agree, ${differ} differ (${cards} player cards, ${coach.size} coach pills)`);
  if (sample) console.log(`  sample card (no name): ${sample}`);
  if (differ > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
