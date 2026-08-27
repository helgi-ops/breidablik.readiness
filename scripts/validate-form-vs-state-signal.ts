/**
 * Form-vs-State coach signal — real-data flag-rate validation (read-only, internal).
 *
 * Runs the ACTUAL team loader (loadTeamFormReads → computeFormVsState per player) + the
 * derive (deriveFormVsStateSignal) over the live Breiðablik squad, and prints the verdict
 * distribution + whether the Today chip would fire and at what level. The gate before
 * enabling squad-wide: the chip must be an EXCEPTION, not a squad-wide nag — a genuine_dip
 * on more than ~15–20% of the graded squad means the thresholds are too loose.
 *
 *   npx tsx scripts/validate-form-vs-state-signal.ts
 *
 * Reads Supabase creds from .env.local. Descriptive only — never touches the readiness colour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadTeamFormReads } from "@/lib/micropulse/formVsState/teamLoad";
import { deriveFormVsStateSignal, isActionable } from "@/lib/micropulse/coachSignals";

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

  console.log(`\n=== Form-vs-State signal validation — Breiðablik — ${new Date().toISOString().slice(0, 10)} ===\n`);

  const reads = await loadTeamFormReads(sb, TEAM_ID);
  const graded = reads.filter((r) => r.verdict !== "unknown");

  const dist: Record<string, number> = {};
  for (const r of reads) dist[r.verdict] = (dist[r.verdict] ?? 0) + 1;

  console.log(`Players with per-match OBV rows : ${reads.length}`);
  console.log(`Gradable (verdict != unknown)   : ${graded.length}`);
  console.log(`Verdict distribution            : ${JSON.stringify(dist)}\n`);

  const dips = reads.filter((r) => r.verdict === "genuine_dip");
  console.log(`genuine_dip players (all conf)  : ${dips.length}`);
  for (const d of dips) console.log(`   • ${d.name.padEnd(24)} conf=${d.confidence}  windowMean=${d.windowMean?.toFixed(2) ?? "—"} vs norm ${d.baselinePer90?.toFixed(2) ?? "—"} (n=${d.gradedN})`);

  const signal = deriveFormVsStateSignal(reads.map((r) => ({ name: r.name, verdict: r.verdict, confidence: r.confidence })));
  const flagRate = graded.length ? (dips.filter((d) => d.confidence !== "low").length / graded.length) : 0;

  console.log(`\n--- Chip decision ---`);
  console.log(`level        : ${signal.level}`);
  console.log(`actionable   : ${isActionable(signal)}`);
  console.log(`confidence   : ${signal.confidence ?? "—"}`);
  console.log(`why (EN)     : ${signal.why.en[0] ?? "(silent)"}`);
  console.log(`\n--- Flag-rate gate ---`);
  console.log(`qualifying dips / gradable = ${(flagRate * 100).toFixed(1)}%  ${flagRate > 0.20 ? "⚠️ TOO HIGH (tighten thresholds before squad-wide)" : "✅ within the exception budget (<20%)"}`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
