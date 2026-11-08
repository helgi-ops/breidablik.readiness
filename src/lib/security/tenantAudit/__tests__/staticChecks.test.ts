import { describe, expect, it } from "vitest";
import { analyzeClientSource, analyzeLibSource, analyzeRouteSource, analyzeServerSource } from "../staticChecks";

const TABLES = new Set(["readiness_entries", "players"]);
const route = "src/app/api/coach/x/route.ts";

describe("A: routes without a login check", () => {
  it("flags a handler with no auth marker", () => {
    const f = analyzeRouteSource(route, `export async function GET(req: Request) { return Response.json({}); }`);
    expect(f.map((x) => x.check)).toEqual(["A_NO_AUTH"]);
    expect(f[0].severity).toBe("HIGH");
  });
  it("accepts the shared guard", () => {
    const src = `import { requireCoachAccessForTeam } from "x"; export async function GET(req: Request) { await requireCoachAccessForTeam(sb, req, null); }`;
    expect(analyzeRouteSource(route, src)).toEqual([]);
  });
  it("accepts a guard exported from a directly imported module", () => {
    const src = `import { authCoachForRoute } from "./_auth"; export async function GET(req: Request) { await authCoachForRoute(req); }`;
    const dep = `export async function authCoachForRoute(req: Request) { await sb.auth.getUser(token); }`;
    expect(analyzeRouteSource(route, src, () => dep).map((x) => x.check)).toEqual([]);
  });
  it("accepts a resolve...User guard from a local helper", () => {
    const src = `import { resolveWhoopRouteUserId } from "../_auth"; export async function POST(req: Request) { await resolveWhoopRouteUserId(req); }`;
    const dep = `export async function resolveWhoopRouteUserId(req: Request) { return getUserIdFromBearer(sb, req); }`;
    expect(analyzeRouteSource(route, src, () => dep)).toEqual([]);
  });
  it("does not count a non-guard library that only mentions auth", () => {
    const src = `import { compute } from "@/lib/compute"; export async function GET() { return compute(); }`;
    const dep = `export function compute() { sb.auth.getUser(); }`;
    expect(analyzeRouteSource(route, src, () => dep).map((x) => x.check)).toEqual(["A_NO_AUTH"]);
  });
  it("ignores files with no handler", () => {
    expect(analyzeRouteSource(route, `export const runtime = "nodejs";`)).toEqual([]);
  });
});

describe("B: caller-supplied ids", () => {
  it("flags a logged-in route that trusts teamId", () => {
    const src = `export async function GET(req) { const u = await sb.auth.getUser(t); const teamId = url.searchParams.get("teamId"); }`;
    const f = analyzeRouteSource(route, src);
    expect(f.map((x) => [x.check, x.severity])).toEqual([["B_UNSCOPED_TENANT_ID", "HIGH"]]);
  });
  it("rates a player id medium", () => {
    const src = `export async function GET(req) { await sb.auth.getUser(t); const p = url.searchParams.get("player_id"); }`;
    expect(analyzeRouteSource(route, src)[0].severity).toBe("MEDIUM");
  });
  it("accepts an explicit comparison against the caller's own team", () => {
    const src = `export async function GET(req) { await sb.auth.getUser(t); const teamId = url.searchParams.get("teamId"); if (profile.team_id !== teamId) return forbidden(); }`;
    expect(analyzeRouteSource(route, src)).toEqual([]);
  });
  it("accepts a coach_teams lookup", () => {
    const src = `export async function GET(req) { await sb.auth.getUser(t); const teamId = url.searchParams.get("teamId"); await sb.from("coach_teams").select("team_id"); }`;
    expect(analyzeRouteSource(route, src)).toEqual([]);
  });
});

describe("C and D: server queries", () => {
  it("flags an optional team filter", () => {
    const f = analyzeServerSource(route, `if (teamId) query = query.eq("team_id", teamId);`, TABLES);
    expect(f.map((x) => x.check)).toEqual(["C_OPTIONAL_TEAM_FILTER"]);
  });
  it("flags a team table read with no filter", () => {
    const f = analyzeServerSource(route, `const { data } = await sb.from("readiness_entries").select("*");`, TABLES);
    expect(f.map((x) => [x.check, x.severity])).toEqual([["D_UNFILTERED_TEAM_TABLE", "HIGH"]]);
  });
  it("accepts team and player filters, including .in", () => {
    expect(analyzeServerSource(route, `await sb.from("readiness_entries").select("*").eq("team_id", t);`, TABLES)).toEqual([]);
    expect(analyzeServerSource(route, `await sb.from("readiness_entries").select("*").in("player_id", ids);`, TABLES)).toEqual([]);
  });
  it("follows a filter added on a later statement", () => {
    const src = `let q = sb.from("players").select("id");\nq = q.eq("team_id", teamId);\nawait q;`;
    expect(analyzeServerSource(route, src, TABLES)).toEqual([]);
  });
  it("sees a filter below a comment, and a nested player-team filter", () => {
    const src = `await sb.from("players").select("*")\n  // no semicolon rule here; keep going\n  .eq("team_id", t);`;
    expect(analyzeServerSource(route, src, TABLES)).toEqual([]);
    expect(analyzeServerSource(route, `await sb.from("readiness_entries").select("x, players!inner(team_id)").eq("players.team_id", t);`, TABLES)).toEqual([]);
  });
  it("skips insert-then-select, which only reads back its own row", () => {
    expect(analyzeServerSource(route, `await sb.from("players").insert({ team_id: t }).select("id").single();`, TABLES)).toEqual([]);
  });
  it("still flags an unfiltered update and delete", () => {
    expect(analyzeServerSource(route, `await sb.from("players").update({ a: 1 });`, TABLES).map((x) => x.check)).toEqual(["D_UNFILTERED_TEAM_TABLE"]);
    expect(analyzeServerSource(route, `await sb.from("players").delete();`, TABLES).map((x) => x.check)).toEqual(["D_UNFILTERED_TEAM_TABLE"]);
  });
  it("skips inserts and other tables", () => {
    expect(analyzeServerSource(route, `await sb.from("readiness_entries").insert(row);`, TABLES)).toEqual([]);
    expect(analyzeServerSource(route, `await sb.from("exercises").select("*");`, TABLES)).toEqual([]);
  });
  it("rates admin and cron paths low", () => {
    const f = analyzeServerSource("src/app/api/admin/x/route.ts", `await sb.from("players").select("*");`, TABLES);
    expect(f[0].severity).toBe("LOW");
  });
});

describe("F: module state", () => {
  it("flags top-level let, not an indented one", () => {
    expect(analyzeLibSource("src/lib/x.ts", `let cache = null;`, TABLES).map((x) => x.check)).toEqual(["F_MODULE_LET"]);
    expect(analyzeLibSource("src/lib/x.ts", `function f() {\n  let a = 1;\n}`, TABLES)).toEqual([]);
  });
});

describe("E2 and G: browser code", () => {
  const client = (body: string) => `"use client";\n${body}`;
  it("flags a browser write of a privileged column", () => {
    const f = analyzeClientSource("src/app/a.tsx", client(`await supabase.from("profiles").update({ team_id: x }).eq("id", u);`), TABLES);
    expect(f.map((x) => [x.check, x.severity])).toEqual([["E2_CLIENT_PROFILES_WRITE", "HIGH"]]);
  });
  it("allows a name-only update", () => {
    expect(analyzeClientSource("src/app/a.tsx", client(`await supabase.from("profiles").update({ full_name: fn }).eq("id", u);`), TABLES)).toEqual([]);
  });
  it("flags a chained write across lines", () => {
    const f = analyzeClientSource("src/app/a.tsx", client(`await supabase\n  .from("profiles")\n  .update({ is_admin: true })\n  .eq("id", u);`), TABLES);
    expect(f[0]?.check).toBe("E2_CLIENT_PROFILES_WRITE");
  });
  it("flags fetch without a token, not authFetch", () => {
    expect(analyzeClientSource("src/app/a.tsx", client("await fetch(`/api/x`);"), TABLES).map((x) => x.check)).toEqual(["G_FETCH_WITHOUT_BEARER"]);
    expect(analyzeClientSource("src/app/a.tsx", client("await authFetch(`/api/x`);"), TABLES)).toEqual([]);
  });
  it("ignores server components", () => {
    expect(analyzeClientSource("src/app/a.tsx", `await fetch("/api/x");`, TABLES)).toEqual([]);
  });
});
