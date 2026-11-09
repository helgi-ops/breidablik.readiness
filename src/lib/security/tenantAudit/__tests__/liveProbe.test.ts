/**
 * Live proof against the real database and a deployed app, as a test coach who belongs to team A only.
 * Skipped unless .env.local has the probe account (scripts/create-tenant-probe-user.ts), so CI never runs it.
 * Every write attempt here is one that must be refused.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

const envFile = resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { TENANT_PROBE_COACH_EMAIL: EMAIL, TENANT_PROBE_COACH_PASSWORD: PASSWORD, TENANT_PROBE_TEAM_A: TEAM_A, TENANT_PROBE_TEAM_B: TEAM_B } = process.env;
const BASE = process.env.TENANT_PROBE_BASE_URL ?? "https://app.micropulse.is";
const NO_SUCH_ID = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!EMAIL || !PASSWORD || !TEAM_A || !TEAM_B)("a coach of team A against team B", () => {
  let sb: SupabaseClient;
  let token = "";
  let userId = "";

  const api = (path: string, init: RequestInit = {}, auth = true) =>
    fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${token}` } : {}) } });

  beforeAll(async () => {
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL!, password: PASSWORD! });
    if (error || !data.session) throw new Error(`Probe login failed: ${error?.message}`);
    token = data.session.access_token;
    userId = data.user.id;
  });

  it.each([["is_admin", true], ["role", "ADMIN"], ["team_id", TEAM_B], ["player_id", NO_SUCH_ID]])("cannot set %s on the own profile", async (col, value) => {
    const { error } = await sb.from("profiles").update({ [col as string]: value }).eq("id", userId);
    expect(error?.code).toBe("42501");
  });

  it("cannot read team B's match minutes", async () => {
    const { data } = await sb.from("match_player_minutes").select("player_id").eq("team_id", TEAM_B!).limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("cannot read team B's readiness entries", async () => {
    const { data } = await sb.from("readiness_entries").select("id").eq("team_id", TEAM_B!).limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("cannot change team B's settings", async () => {
    const { data } = await sb.from("team_settings").update({ team_id: TEAM_B! }).eq("team_id", TEAM_B!).select("team_id");
    expect(data ?? []).toEqual([]);
  });

  it.each(["stage4_apply_override", "stage4_set_coach_override", "stage4_set_coach_variant", "lock_readiness_entry", "join_team_with_code"])("cannot call %s", async (fn) => {
    const { error } = await sb.rpc(fn, {});
    expect(error).not.toBeNull();
  });

  it.each(["/api/coach/md-planning", "/api/coach/weekly-load", "/api/coach/session-comparison"])("%s refuses no login and refuses team B", async (path) => {
    expect((await api(`${path}?teamId=${TEAM_B}`, {}, false)).status).toBe(401);
    expect((await api(`${path}?teamId=${TEAM_B}`)).status).toBe(403);
  });

  it("cannot switch to team B", async () => {
    const res = await api("/api/coach/switch-team", { method: "POST", body: JSON.stringify({ teamId: TEAM_B }) });
    expect(res.status).toBe(403);
  });

  it("reaches the own team", async () => {
    expect((await api(`/api/coach/md-planning?teamId=${TEAM_A}`)).status).toBe(200);
  });
});
