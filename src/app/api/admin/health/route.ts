/**
 * GET /api/admin/health
 *
 * System-health monitor: is the decision pipeline flowing for every team? Runs the
 * pipeline-health registry (pipelineHealth/checks.ts) over all active teams and
 * returns green/amber/red per check × team. Admin-only, read-only — pure
 * observation, never writes the monitored tables, never treats a colour as a verdict.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { loadAllTeamHealth } from "@/lib/micropulse/pipelineHealth/load";
import { evaluateTeamHealth, isActionableHealth, type HealthResult } from "@/lib/micropulse/pipelineHealth/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(req: Request) {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = getSupabaseAdmin();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  if (String((prof as { role?: string } | null)?.role ?? "").toLowerCase() !== "admin") throw new Error("Forbidden");
  return sb;
}

export async function GET(req: Request) {
  try {
    const sb = await requireAdmin(req);
    const facts = await loadAllTeamHealth(sb);
    const teams = facts.map((f) => {
      const results = evaluateTeamHealth(f);
      return {
        teamId: f.teamId,
        name: f.teamName,
        worst: results.find((r) => r.status === "red") ? "red" : results.find((r) => r.status === "amber") ? "amber" : "ok",
        results,
      };
    });
    // Newest-breakage-first: teams with a red, then amber, then healthy.
    const sev = (w: string) => (w === "red" ? 0 : w === "amber" ? 1 : 2);
    teams.sort((a, b) => sev(a.worst) - sev(b.worst) || a.name.localeCompare(b.name));
    const all: HealthResult[] = teams.flatMap((t) => t.results);
    return NextResponse.json({
      asOf: facts[0]?.today ?? null,
      teams,
      redCount: all.filter((r) => r.status === "red").length,
      amberCount: all.filter((r) => r.status === "amber").length,
      actionableCount: all.filter(isActionableHealth).length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg === "Forbidden" ? "Admin only" : msg }, { status });
  }
}
