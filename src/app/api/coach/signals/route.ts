export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * GET /api/coach/signals[?refresh=1]
 *
 * The Today briefing "background signals" (coach-pages-audit-background-vs-
 * destination.md). Returns the exception-gated chips for the coach's team:
 * matchday role-fit, session-vs-plan, and the "confirm MD+1 minutes" task.
 *
 * Reads the coach_signals cache for today; if empty (or ?refresh=1) it computes
 * the three signals — reusing the existing engine endpoints so there is NO
 * duplicated compute — upserts them, and returns. So the heavy compute runs at
 * most once per team per day (on the first Today load); every later read is
 * instant. A nightly writer can pre-populate the same table later.
 *
 * ADVISORY / descriptive — never writes or reads the readiness colour.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deriveGamePlanFitSignal, derivePostTrainingSignal, deriveMatchMinutesSignal, deriveFormVsStateSignal, derivePlayerFormVsStateSignals, type CoachSignal } from "@/lib/micropulse/coachSignals";
import { loadTeamFormReads } from "@/lib/micropulse/formVsState/teamLoad";

/** A signal with its owner — playerId null = team-level (chip strip), set = per-player (attention row). */
type OwnedSignal = CoachSignal & { playerId: string | null };

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

async function requireCoach(req: Request): Promise<{ teamId: string; token: string }> {
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
  return { teamId, token };
}

async function computeSignals(origin: string, token: string, teamId: string, today: string): Promise<OwnedSignal[]> {
  const sb = admin();
  const authHeader = { Authorization: `Bearer ${token}` };

  // game-plan-fit + post-training reuse their existing endpoints (no duplicated
  // compute); form-vs-state runs the pure engine over a bulk team-wide read (one
  // helper, no per-player HTTP fan-out). Each failure degrades that ONE signal to
  // steady, never the request.
  const [gpf, pt, formReads] = await Promise.all([
    fetch(`${origin}/api/coach/game-plan-fit`, { headers: authHeader }).then((r) => r.json()).catch(() => null),
    fetch(`${origin}/api/coach/post-training`, { headers: authHeader }).then((r) => r.json()).catch(() => null),
    loadTeamFormReads(sb, teamId).catch(() => []),
  ]);
  const fvs = deriveFormVsStateSignal(formReads.map((r) => ({ name: r.name, verdict: r.verdict, confidence: r.confidence })));
  // Per-player form-dip rows (player_id set) for the attention rows — same gate,
  // one per dipping player, carrying his own %-vs-norm.
  const fvsPlayers = derivePlayerFormVsStateSignals(formReads.map((r) => ({
    playerId: r.playerId, name: r.name, verdict: r.verdict, confidence: r.confidence,
    windowMean: r.windowMean, baselinePer90: r.baselinePer90,
  })));

  // match-minutes: cheap direct read — the most recent match in the last 4 days
  // and whether any minutes have been entered for it.
  const fourDaysAgo = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 4); return d.toISOString().slice(0, 10); })();
  const [{ data: fx }, { data: roster }] = await Promise.all([
    sb.from("match_schedule").select("match_date, opponent").eq("team_id", teamId).gte("match_date", fourDaysAgo).lte("match_date", today).order("match_date", { ascending: false }).limit(1),
    sb.from("players").select("id").eq("team_id", teamId).eq("is_active", true),
  ]);
  const recent = (fx ?? [])[0] as { match_date?: string; opponent?: string | null } | undefined;
  let mm = deriveMatchMinutesSignal({ recentMatch: null, entered: 0, roster: 0 });
  if (recent?.match_date) {
    const { count } = await sb.from("match_player_minutes").select("player_id", { count: "exact", head: true })
      .eq("team_id", teamId).eq("match_date", recent.match_date);
    mm = deriveMatchMinutesSignal({
      recentMatch: { date: recent.match_date, opponent: recent.opponent ?? null },
      entered: count ?? 0,
      roster: (roster ?? []).length,
    });
  }

  const team: OwnedSignal[] = [deriveGamePlanFitSignal(gpf), derivePostTrainingSignal(pt), mm, fvs].map((s) => ({ ...s, playerId: null }));
  const perPlayer: OwnedSignal[] = fvsPlayers.map((x) => ({ ...x.signal, playerId: x.playerId }));
  return [...team, ...perPlayer];
}

export async function GET(req: Request) {
  try {
    const { teamId, token } = await requireCoach(req);
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

    const signals = await computeSignals(new URL(req.url).origin, token, teamId, today);
    const nowIso = new Date().toISOString();
    const rows: Array<Record<string, unknown>> = signals.map((s) => ({
      team_id: teamId, engine: s.engine, player_id: s.playerId, level: s.level,
      label: s.label, why: s.why, confidence: s.confidence, counterfactual: s.counterfactual,
      href: s.href, as_of: today, updated_at: nowIso,
    }));
    // Delete-then-insert: the two partial unique indexes allow many per-player
    // rows per engine/day, so upsert-on-conflict can't target them cleanly.
    // Best-effort cache (like the old upsert) — the client gets `signals`
    // regardless of whether the write lands.
    await sb.from("coach_signals").delete().eq("team_id", teamId).eq("as_of", today);
    await sb.from("coach_signals").insert(rows);

    return NextResponse.json({ ok: true, asOf: today, cached: false, signals });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : msg.includes("team") ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
