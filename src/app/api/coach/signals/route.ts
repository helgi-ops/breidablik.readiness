export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/signals[?refresh=1]
 *
 * The Today briefing "background signals" for the coach's team — exception-gated
 * chips (matchday fit, session-vs-plan, recovery, load spikes, …). Reads the
 * coach_signals cache for today; if empty (or ?refresh=1) it computes them via the
 * shared tokenless `computeTeamSignals`, upserts, and returns. So the heavy compute
 * runs at most once per team per day — and the NIGHTLY cron
 * (/api/coach/signals/cron) now pre-populates it, so the first Today load of the
 * day is normally a cache hit with no per-player query storm on the request path.
 *
 * ADVISORY / descriptive — never writes or reads the readiness colour.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { computeTeamSignals, writeTeamSignals } from "@/lib/micropulse/coachSignals/computeTeam";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
function admin() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function todayInReykjavik(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Atlantic/Reykjavik" }).format(new Date());
}

async function requireCoach(req: Request): Promise<{ teamId: string }> {
  const authz = req.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  if (!token) throw new Error("Unauthorized");
  const sb = admin();
  const { data: userRes, error } = await sb.auth.getUser(token);
  if (error || !userRes?.user?.id) throw new Error("Unauthorized");
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) throw new Error("Forbidden");
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) throw new Error("No team context");
  return { teamId };
}

export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoach(req);
    const sb = admin();
    const today = todayInReykjavik();
    const refresh = new URL(req.url).searchParams.get("refresh") === "1";

    if (!refresh) {
      const { data: cached } = await sb.from("coach_signals").select("engine, player_id, level, label, why, confidence, counterfactual, href").eq("team_id", teamId).eq("as_of", today);
      if (cached && cached.length > 0) {
        const signals = (cached as Array<Record<string, unknown>>).map((c) => ({ ...c, playerId: (c.player_id as string | null) ?? null }));
        return NextResponse.json({ ok: true, asOf: today, cached: true, signals });
      }
    }

    const signals = await computeTeamSignals(sb, teamId, today);
    // Best-effort cache (the client gets `signals` regardless of whether the write lands).
    await writeTeamSignals(sb, teamId, today, signals).catch(() => {});

    return NextResponse.json({ ok: true, asOf: today, cached: false, signals });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("team") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
