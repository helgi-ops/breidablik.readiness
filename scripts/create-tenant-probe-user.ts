/**
 * Creates the test coach used by the live tenant-isolation proof, in Demo - Full only.
 * Run this once yourself. The password is generated here, written only to .env.local, and never printed.
 *
 *   npx tsx scripts/create-tenant-probe-user.ts
 *
 * The account mirrors a real coach: profile role COACH, a coach_teams row and a staff_users row with role 'coach'.
 * Team B is Demo - GPS Pro, the team the coach must never reach.
 */

import { appendFileSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const TEAM_A = "de300001-0000-4000-8000-000000000001";
const TEAM_B = "de300002-0000-4000-8000-000000000002";
const EMAIL = "tenant-probe@micropulse.invalid";
const ENV_PATH = resolve(process.cwd(), ".env.local");

function loadEnv(): string {
  const text = readFileSync(ENV_PATH, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return text;
}

async function main() {
  const existing = loadEnv();
  if (existing.includes("TENANT_PROBE_COACH_EMAIL")) throw new Error(".env.local already has a probe account. Nothing was changed.");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const password = randomBytes(24).toString("base64url");
  const { data, error } = await sb.auth.admin.createUser({
    email: EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Tenant probe" },
  });
  if (error || !data.user) throw new Error(`Could not create the account: ${error?.message ?? "no user returned"}`);
  const id = data.user.id;

  const steps = [
    await sb.from("profiles").update({ role: "COACH", is_admin: false, team_id: TEAM_A, full_name: "Tenant probe" }).eq("id", id),
    await sb.from("coach_teams").upsert({ coach_id: id, team_id: TEAM_A }, { onConflict: "coach_id,team_id" }),
    await sb.from("staff_users").upsert({ user_id: id, role: "coach" }),
  ];
  const failed = steps.find((s) => s.error);
  if (failed?.error) {
    await sb.auth.admin.deleteUser(id);
    throw new Error(`Setup failed, so the account was removed again: ${failed.error.message}`);
  }

  appendFileSync(ENV_PATH, [
    "",
    "# Live tenant-isolation proof (scripts/create-tenant-probe-user.ts)",
    `TENANT_PROBE_COACH_EMAIL=${EMAIL}`,
    `TENANT_PROBE_COACH_PASSWORD=${password}`,
    `TENANT_PROBE_TEAM_A=${TEAM_A}`,
    `TENANT_PROBE_TEAM_B=${TEAM_B}`,
    "TENANT_PROBE_BASE_URL=https://app.micropulse.is",
    "",
  ].join("\n"));
  console.log("Test coach created in Demo - Full. The details are in .env.local.");
  console.log("Now run: npx vitest run src/lib/security/tenantAudit/__tests__/liveProbe.test.ts");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
