import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

type AcwrZone = "undertrain" | "optimal" | "caution" | "high_risk" | "insufficient";

function classifyZone(acwr: number | null): AcwrZone {
  if (acwr == null) return "insufficient";
  if (acwr < 0.8)  return "undertrain";
  if (acwr <= 1.3) return "optimal";
  if (acwr <= 1.5) return "caution";
  return "high_risk";
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const tz = process.env.APP_TIMEZONE || "Atlantic/Reykjavik";
    const toDate = todayInTz(tz);
    const fromDate = dateMinusDays(toDate, 27); // 28 days inclusive

    // Get all active players for this team
    const { data: playerData, error: pErr } = await sb
      .from("players")
      .select("id, full_name, position")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("full_name");

    if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

    const players = (playerData ?? []) as Array<{ id: string; full_name: string; position: string | null }>;
    if (!players.length) return NextResponse.json({ ok: true, players: [], toDate, fromDate });

    // Fetch all session_rpe_entries for this team in the last 28 days
    const { data: entries, error: eErr } = await sb
      .from("session_rpe_entries")
      .select("player_id, session_date, session_load")
      .in("player_id", players.map((p) => p.id))
      .gte("session_date", fromDate)
      .lte("session_date", toDate);

    if (eErr) return NextResponse.json({ ok: false, error: eErr.message }, { status: 500 });

    // Build load-by-player-by-date map
    const loadMap = new Map<string, Map<string, number>>();
    for (const e of (entries ?? []) as Array<{ player_id: string; session_date: string; session_load: number }>) {
      if (!loadMap.has(e.player_id)) loadMap.set(e.player_id, new Map());
      const prev = loadMap.get(e.player_id)!.get(e.session_date) ?? 0;
      loadMap.get(e.player_id)!.set(e.session_date, prev + Number(e.session_load ?? 0));
    }

    // Build 28-day array for every player and compute ACWR
    const result = players.map((p) => {
      const byDate = loadMap.get(p.id) ?? new Map<string, number>();
      const allDays: { date: string; load: number }[] = [];
      for (let i = 27; i >= 0; i--) {
        const d = dateMinusDays(toDate, i);
        allDays.push({ date: d, load: byDate.get(d) ?? 0 });
      }

      const acute7   = allDays.slice(-7).reduce((s, d) => s + d.load, 0);
      const total28  = allDays.reduce((s, d) => s + d.load, 0);
      const chronic28 = total28 / 4;
      const acwr = chronic28 > 0 ? Math.round((acute7 / chronic28) * 100) / 100 : null;
      const zone = classifyZone(acwr);

      // Weekly sums for sparkline (4 weeks, oldest first)
      const weekLoads = [0, 1, 2, 3].map((w) => {
        const weekDays = allDays.slice(w * 7, (w + 1) * 7);
        return weekDays.reduce((s, d) => s + d.load, 0);
      });

      return {
        player_id: p.id,
        full_name: p.full_name,
        position: p.position,
        acute7,
        chronic28: Math.round(chronic28),
        acwr,
        zone,
        weekLoads,       // 4 weekly totals, oldest→newest
        sessionCount28: allDays.filter((d) => d.load > 0).length,
      };
    });

    // Sort: high_risk first, then caution, then optimal, then undertrain/insufficient
    const zonePriority: Record<AcwrZone, number> = {
      high_risk: 0, caution: 1, optimal: 2, undertrain: 3, insufficient: 4,
    };
    result.sort((a, b) => zonePriority[a.zone] - zonePriority[b.zone]);

    return NextResponse.json({ ok: true, players: result, toDate, fromDate });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
