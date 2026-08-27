/**
 * Personal-best detection — real-data dry-run (read-only, internal).
 *
 * Runs the ACTUAL engine (detectCmjPersonalBest) over the live Breiðablik CMJ
 * history and prints who WOULD get a PB. Two passes:
 *   - all-time (recencyDays huge): does the "latest test beats history" logic
 *     fire on real data, and how often (a PB should be occasional, not everyone).
 *   - production (recencyDays=3): what today's cron would actually push.
 * Descriptive only — writes nothing, sends nothing.
 *
 *   npx tsx scripts/validate-personal-best.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { detectCmjPersonalBest, type CmjTestBest } from "@/lib/micropulse/personalBest";

const TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c"; // Breiðablik

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) { const v = m[2].replace(/^["']|["']$/g, ""); if (!(m[1] in process.env)) process.env[m[1]] = v; }
    }
  } catch { /* env may already be set */ }
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase creds in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  console.log(`\n=== Personal-best dry-run — Breiðablik — ${now.slice(0, 10)} ===\n`);

  const { data: players } = await sb.from("players").select("id, full_name").eq("team_id", TEAM_ID).eq("is_active", true);
  const roster = (players ?? []) as Array<{ id: string; full_name: string | null }>;
  const nameById = new Map(roster.map((p) => [p.id, p.full_name ?? "Player"]));

  const { data: rows } = await sb.from("vald_forcedecks_results")
    .select("microplayer_id, raw_test_id, test_timestamp, jump_height_cm")
    .in("microplayer_id", roster.map((p) => p.id))
    .not("jump_height_cm", "is", null)
    .order("test_timestamp", { ascending: true });

  const byPlayer = new Map<string, Map<string, CmjTestBest>>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const pid = String(r.microplayer_id ?? ""); const jh = num(r.jump_height_cm); const at = String(r.test_timestamp ?? "");
    if (!pid || jh == null || !at) continue;
    const testId = (r.raw_test_id as string | null) || `date:${at.slice(0, 10)}`;
    let tests = byPlayer.get(pid); if (!tests) { tests = new Map(); byPlayer.set(pid, tests); }
    const prev = tests.get(testId);
    if (!prev || jh > prev.bestJumpCm) tests.set(testId, { testId, at, bestJumpCm: jh });
  }

  let withHistory = 0, allTimePb = 0, prodPb = 0;
  console.log("Player                     tests  latest→prior   PB(all-time)   PB(prod ≤3d)");
  for (const p of roster) {
    const tests = byPlayer.get(p.id);
    if (!tests || tests.size < 2) continue;
    withHistory++;
    const list = Array.from(tests.values()).sort((a, b) => (a.at < b.at ? -1 : 1));
    const latest = list[list.length - 1];
    const priorBest = Math.max(...list.slice(0, -1).map((t) => t.bestJumpCm));
    const allTime = detectCmjPersonalBest(list, { now, recencyDays: 36500 });
    const prod = detectCmjPersonalBest(list, { now, recencyDays: 3 });
    if (allTime) allTimePb++;
    if (prod) prodPb++;
    if (allTime || latest.bestJumpCm >= priorBest - 2) {
      console.log(
        `${(nameById.get(p.id) ?? p.id).padEnd(26)} ${String(tests.size).padStart(4)}   ${latest.bestJumpCm.toFixed(1)}→${priorBest.toFixed(1)}`.padEnd(52) +
        `${allTime ? `✅ +${allTime.improvement}cm` : "—"}`.padEnd(15) + `${prod ? `🔔 +${prod.improvement}cm` : "—"}`,
      );
    }
  }
  console.log(`\nPlayers with ≥2 CMJ tests: ${withHistory}`);
  console.log(`Latest test is an all-time PB: ${allTimePb}  (${withHistory ? ((allTimePb / withHistory) * 100).toFixed(0) : 0}% — occasional is healthy)`);
  console.log(`Would push TODAY (recency ≤3d): ${prodPb}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
