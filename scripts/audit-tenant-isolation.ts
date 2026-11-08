/**
 * Tenant-isolation audit: can one team reach another team's data?
 *
 *   npx tsx scripts/audit-tenant-isolation.ts [--no-db] [--out report.md] [--json] [--update-baseline] [--update-tables]
 *
 * Source checks need no secrets, so CI runs them with --no-db. The database checks read a catalog through a
 * service-role-only function and need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local locally).
 * Exit 1 only on a HIGH finding that is neither allowlisted nor in the baseline.
 * See docs/security/tenant-isolation.md.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { scanSource } from "../src/lib/security/tenantAudit/scan";
import { runDbChecks, type DbCatalog } from "../src/lib/security/tenantAudit/dbChecks";
import { buildResult, toBaseline } from "../src/lib/security/tenantAudit/baseline";
import { renderMarkdown } from "../src/lib/security/tenantAudit/report";
import type { AllowlistEntry, Baseline, Finding } from "../src/lib/security/tenantAudit/types";

const ROOT = process.cwd();
const has = (flag: string) => process.argv.includes(flag);
const arg = (flag: string) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] ?? null : null; };
const readJson = <T,>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* CI has no .env.local */ }
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  loadEnv();
  const useDb = !has("--no-db");

  if (has("--update-tables")) {
    const { data, error } = await serviceClient().rpc("tenant_audit_catalog");
    if (error) throw new Error(error.message);
    const names = (data as DbCatalog).tables.filter((t) => t.tenant).map((t) => t.name).sort();
    writeFileSync(resolve(ROOT, "security/tenant-tables.json"), `${JSON.stringify(names, null, 2)}\n`);
    console.log(`security/tenant-tables.json: ${names.length} tables`);
  }

  const tenantTables = new Set(readJson<string[]>("security/tenant-tables.json"));
  const allowlist = readJson<AllowlistEntry[]>("security/tenant-audit.allowlist.json");
  const baseline = readJson<Baseline>("security/tenant-audit.baseline.json");

  const findings: Finding[] = scanSource(ROOT, tenantTables);
  if (useDb) findings.push(...(await runDbChecks(serviceClient())));

  if (has("--update-baseline")) {
    if (!useDb) throw new Error("--update-baseline needs the database checks, so don't combine it with --no-db");
    const kept = buildResult(findings, allowlist, { generatedAt: "", fingerprints: [] }).findings;
    writeFileSync(resolve(ROOT, "security/tenant-audit.baseline.json"), `${JSON.stringify(toBaseline(kept, new Date().toISOString().slice(0, 10)), null, 2)}\n`);
    console.log("Baseline updated. Review the diff before committing it.");
    return;
  }

  // A source-only run must not call database baseline entries "fixed", and has nothing else to compare.
  const result = buildResult(findings, allowlist, baseline);
  const report = renderMarkdown(result, useDb ? "source and database" : "source only");
  const out = arg("--out");
  if (out) writeFileSync(resolve(ROOT, out), report);
  if (has("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(report);
  if (result.newHigh.length > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
