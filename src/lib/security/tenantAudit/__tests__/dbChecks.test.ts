import { describe, expect, it } from "vitest";
import { evaluateCatalog, type DbCatalog } from "../dbChecks";
import { applyAllowlist, buildResult, toBaseline } from "../baseline";
import { makeFinding } from "../fingerprint";

const clean: DbCatalog = {
  tables: [{ name: "readiness_entries", rls: true, tenant: true, anon_select: false, authenticated_select: true, authenticated_write: true }],
  policies: [],
  views: [{ name: "v_x", invoker: true, anon_select: false }],
  functions: [{ name: "f", returns_trigger: false, anon_exec: false, authenticated_exec: true, checks_caller: true }],
  profiles_update_columns: ["display_name", "full_name"],
  coach_teams_gap: 0,
  signup_function_guarded: true,
  elevated_accounts: [],
};
const checks = (c: Partial<DbCatalog>) => evaluateCatalog({ ...clean, ...c }).map((f) => [f.check, f.severity]);
const policy = (using: string | null, check: string | null = null, cmd = "r", roles = ["authenticated"]) => [{ table: "readiness_entries", name: "p", cmd, roles, using, check }];

describe("database rules", () => {
  it("a clean catalog has no findings", () => expect(checks({})).toEqual([]));
  it("the holes closed on 2026-11-08 would fail again", () => {
    expect(checks({ views: [{ name: "v", invoker: false, anon_select: true }] })).toEqual([["DB_ANON_VIEW", "HIGH"], ["DB_VIEW_OWNER_RIGHTS", "HIGH"]]);
    expect(checks({ profiles_update_columns: ["is_admin"] })).toEqual([["DB_PROFILES_GRANTS", "HIGH"]]);
    expect(checks({ signup_function_guarded: false })).toEqual([["DB_SIGNUP_TRUST", "HIGH"]]);
    expect(checks({ tables: [...clean.tables, { name: "coach_invitations", rls: true, tenant: true, anon_select: false, authenticated_select: false, authenticated_write: true }] })).toEqual([["DB_INVITE_WRITE", "HIGH"]]);
  });
  it("flags open policies, including the merged `true OR` form", () => {
    expect(checks({ policies: policy("true") })).toEqual([["DB_USING_TRUE", "MEDIUM"]]);
    expect(checks({ policies: policy("(true OR is_staff())") })[0]).toEqual(["DB_USING_TRUE", "MEDIUM"]);
    expect(checks({ policies: policy(null, "true", "a") })).toEqual([["DB_USING_TRUE", "HIGH"]]);
  });
  it("does not read a column named true_x as open", () => {
    expect(checks({ policies: policy("(is_true_flag = team_id)") })).toEqual([]);
  });
  it("rates is_staff with a team branch medium, alone high", () => {
    expect(checks({ policies: policy("(coaches_team(team_id) OR is_staff())") })).toEqual([["DB_IS_STAFF_POLICY", "MEDIUM"]]);
    expect(checks({ policies: policy("is_staff()") })).toEqual([["DB_IS_STAFF_POLICY", "HIGH"]]);
  });
  it("is_elevated_staff is not is_staff", () => {
    expect(checks({ policies: policy("is_elevated_staff()") })).toEqual([]);
  });
  it("rates definer functions by who can call them", () => {
    expect(checks({ functions: [{ name: "f", returns_trigger: false, anon_exec: true, authenticated_exec: true, checks_caller: true }] })).toEqual([["DB_DEFINER_RPC", "HIGH"]]);
    expect(checks({ functions: [{ name: "f", returns_trigger: false, anon_exec: false, authenticated_exec: true, checks_caller: false }] })).toEqual([["DB_DEFINER_RPC", "MEDIUM"]]);
  });
  it("ignores trigger functions and policies only for server roles", () => {
    expect(checks({ functions: [{ name: "f", returns_trigger: true, anon_exec: true, authenticated_exec: true, checks_caller: false }] })).toEqual([]);
    expect(checks({ policies: policy("true", "true", "*", ["service_role"]) })).toEqual([]);
    expect(checks({ policies: policy("true", "true", "*", []) })[0]).toEqual(["DB_USING_TRUE", "HIGH"]);
  });
  it("flags each admin account so a new one shows up", () => {
    expect(checks({ elevated_accounts: [{ id: "u", role: "ADMIN", is_admin: true }] })).toEqual([["DB_NEW_ELEVATED_ACCOUNT", "HIGH"]]);
  });
});

describe("baseline and allowlist", () => {
  const f = makeFinding("A_NO_AUTH", "HIGH", "src/a.ts", 10, "m", "export async function GET()");
  it("the fingerprint ignores line numbers and whitespace", () => {
    expect(makeFinding("A_NO_AUTH", "HIGH", "src/a.ts", 99, "m", "export  async function   GET()").fingerprint).toBe(f.fingerprint);
  });
  it("a new HIGH fails, a known one does not", () => {
    expect(buildResult([f], [], { generatedAt: "", fingerprints: [] }).newHigh).toEqual([f]);
    expect(buildResult([f], [], toBaseline([f], "2026-11-08")).newHigh).toEqual([]);
  });
  it("medium findings never fail and stay out of the baseline", () => {
    const m = makeFinding("F_MODULE_LET", "MEDIUM", "src/a.ts", 1, "m", "let a");
    expect(buildResult([m], [], { generatedAt: "", fingerprints: [] }).newHigh).toEqual([]);
    expect(toBaseline([m], "x").fingerprints).toEqual([]);
  });
  it("the allowlist matches on check, file and optional text", () => {
    const entry = { check: "A_NO_AUTH" as const, file: "src/a.ts", reason: "r", addedBy: "x", addedAt: "y" };
    expect(applyAllowlist([f], [entry]).allowed).toBe(1);
    expect(applyAllowlist([f], [{ ...entry, match: "POST" }]).allowed).toBe(0);
    expect(applyAllowlist([f], [{ ...entry, file: "src/b.ts" }]).allowed).toBe(0);
  });
});
