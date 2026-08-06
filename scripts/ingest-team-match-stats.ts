/**
 * Ingest a Wyscout Team → Stats (General, "Show opponents") Excel export into
 * `team_match_stats`. Idempotent — upserts on (team_id, match_date, is_opponent),
 * so re-running a fresh weekly export just updates.
 *
 * Export it from wyscout.hudl.com/app → team page → Stats tab → DISPLAY General
 * → "Show opponents" ON → Export to Excel. Then, from the project root:
 *
 *   npx tsx scripts/ingest-team-match-stats.ts <general.xlsx> [--team-id UUID] [--team-name "Breiðablik"]
 *
 * PPDA and defensive duels live in two OTHER DISPLAY tabs (not "General"). Export
 * each with "Show opponents" ON and pass them too — they merge onto the same rows
 * in one idempotent write, so the whole import is one reproducible command:
 *
 *   npx tsx scripts/ingest-team-match-stats.ts <general.xlsx> \
 *     --indexes <indexes.xlsx> --defending <defending.xlsx>
 *
 *   • --indexes    Wyscout DISPLAY "Indexes"   → the PPDA column
 *   • --defending  Wyscout DISPLAY "Defending" → "Defensive duels / won" (won %)
 *
 * Reads Supabase creds from .env.local (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY). Writes are service-role (bypasses RLS).
 *
 * Descriptive football context only — team_match_stats never touches the
 * readiness colour or the daily decision.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { buildTeamMatchStatRows } from "../src/lib/micropulse/statsIngestion/buildTeamMatchRows";

const BREIDABLIK_TEAM_ID = "94b52a06-0b83-48da-8664-639ec3486a0c";

/** Minimal .env.local loader (no dotenv dependency). Existing env wins. */
function loadEnvLocal(): void {
  try {
    const txt = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  } catch {
    /* env may already be exported; ignore */
  }
}

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  loadEnvLocal();

  // Positional = first arg that is neither a --flag nor a flag's value.
  const argv = process.argv.slice(2);
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) { i++; continue; }
    positionals.push(argv[i]);
  }
  const file = positionals[0];
  const teamId = flag("--team-id") ?? BREIDABLIK_TEAM_ID;
  const teamName = flag("--team-name") ?? "Breiðablik";

  const indexesFile = flag("--indexes");   // Wyscout "Indexes" export → PPDA
  const defendingFile = flag("--defending"); // Wyscout "Defending" export → defensive duels won %

  if (!file) {
    console.error('Usage: npx tsx scripts/ingest-team-match-stats.ts <general.xlsx> [--indexes <indexes.xlsx>] [--defending <defending.xlsx>] [--team-id UUID] [--team-name "Breiðablik"]');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked .env.local and the environment).");
    process.exit(1);
  }

  const readMatrix = (path: string): unknown[][] => {
    const wb = XLSX.read(readFileSync(resolve(process.cwd(), path)), { type: "buffer", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) { console.error(`No worksheet found in ${path}.`); process.exit(1); }
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];
  };

  const built = buildTeamMatchStatRows({
    generalMatrix: readMatrix(file),
    indexesMatrix: indexesFile ? readMatrix(indexesFile) : null,
    defendingMatrix: defendingFile ? readMatrix(defendingFile) : null,
    teamId,
    teamName,
  });
  const { dbRows } = built;

  console.log(`Header row: ${JSON.stringify(built.headerRow)}`);
  if (built.unmappedHeaders.length) {
    console.log(`⚠ Unmapped columns (kept verbatim in raw jsonb): ${built.unmappedHeaders.join(", ")}`);
  }
  if (indexesFile && !built.aux.ppdaMatched) console.error("⚠ PPDA (Indexes): expected column not found — is this the right export?");
  if (defendingFile && !built.aux.defMatched) console.error("⚠ Def-duels (Defending): expected column not found — is this the right export?");
  if (dbRows.length === 0) {
    console.error("No rows parsed. Check the export is the General preset with 'Show opponents' ON.");
    built.skipped.forEach((s) => console.error(`  skip: ${s.reason}${s.label ? ` (${s.label})` : ""}`));
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("team_match_stats").upsert(dbRows, { onConflict: "team_id,match_date,is_opponent" });
  if (error) { console.error(`Upsert failed: ${error.message}`); process.exit(1); }

  // Which parsed dates won't join to a fixture (movement is keyed by match_schedule dates).
  const dates = built.dates;
  const { data: sched } = await supabase.from("match_schedule").select("match_date").eq("team_id", teamId).in("match_date", dates);
  const schedSet = new Set((sched ?? []).map((s: { match_date: string }) => s.match_date));
  const unjoined = dates.filter((d) => !schedSet.has(d));

  console.log(`✅ ${built.fixtures} fixtures · ${dbRows.length} rows upserted across ${dates.length} match dates.`);
  if (indexesFile || defendingFile) {
    console.log(`   merged: PPDA on ${built.ppdaHits} row(s), def-duels won % on ${built.defDuelsHits} row(s).`);
    if (built.ppdaOrphans.length) console.log(`   ⚠ PPDA has ${built.ppdaOrphans.length} date(s) not in the General export (re-export General to include them): ${built.ppdaOrphans.join(", ")}`);
    if (built.defDuelsOrphans.length) console.log(`   ⚠ Def-duels has ${built.defDuelsOrphans.length} date(s) not in the General export: ${built.defDuelsOrphans.join(", ")}`);
  }
  if (built.skipped.length) {
    const counts = built.skipped.reduce<Record<string, number>>((a, s) => { a[s.reason] = (a[s.reason] ?? 0) + 1; return a; }, {});
    console.log(`   skipped: ${Object.entries(counts).map(([k, v]) => `${k} ×${v}`).join(", ")}`);
  }
  if (unjoined.length) {
    console.log(`   ⚠ ${unjoined.length} date(s) not in match_schedule (won't join to movement — add the fixture or fix the date): ${unjoined.join(", ")}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
