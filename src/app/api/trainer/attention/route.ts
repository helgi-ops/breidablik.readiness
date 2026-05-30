/**
 * /api/trainer/attention
 *
 * Trainer-facing "who needs attention" list for PT clients. Surfaces clients
 * with a risk flag so a trainer with many clients sees problems early without
 * opening each one. Every flag carries a plain-language reason (explainability).
 *
 * Flags (per active client on the trainer's team):
 *   - red readiness today            (canonical readiness_entries.color)
 *   - readiness trending down        (last check-ins dropping)
 *   - no check-in today              (has an account but hasn't logged)
 *   - load spike                     (sRPE ACWR danger / tonnage very high)
 *   - retest due                     (latest LV test older than the window)
 *
 * Returns only flagged clients, most severe first.
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { computeLoadQuadrant } from "@/lib/client/loadQuadrant";
import { computeVolumeLoad } from "@/lib/client/volumeLoad";
import { RETEST_DAYS } from "@/lib/client/oneRepMax";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function getAdmin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
function iso(n: number): string { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

type Flag = { severity: 1 | 2; code: string; label: string };

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const teamId = url.searchParams.get("team_id") || (prof as { team_id?: string } | null)?.team_id;
  if (!teamId) return NextResponse.json({ ok: true, clients: [] });

  const { data: players } = await sb
    .from("players").select("id, full_name, user_id")
    .eq("team_id", teamId).eq("is_active", true).order("full_name");
  const list = ((players ?? []) as Array<{ id: string; full_name: string; user_id: string | null }>).slice(0, 50);
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.all(list.map(async (p) => {
    const flags: Flag[] = [];

    // Readiness today + recent trend (canonical color).
    const { data: rday } = await sb
      .from("readiness_entries").select("color, total_score, entry_date")
      .eq("player_id", p.id).gte("entry_date", iso(9))
      .order("entry_date", { ascending: false }).limit(6);
    const rows = ((rday ?? []) as Array<{ color: string | null; total_score: number | null; entry_date: string }>);
    const todayRow = rows.find((r) => r.entry_date === today) ?? null;

    if (todayRow?.color && todayRow.color.toLowerCase() === "red") {
      flags.push({ severity: 2, code: "readiness_red", label: "Red readiness today" });
    } else {
      const scores = rows.map((r) => r.total_score).filter((x): x is number => x != null);
      if (scores.length >= 3 && scores[0] - scores[scores.length - 1] <= -4) {
        flags.push({ severity: 1, code: "readiness_down", label: "Readiness trending down" });
      }
    }
    if (!todayRow && p.user_id) {
      flags.push({ severity: 1, code: "no_checkin", label: "No check-in today" });
    }

    // Load spikes (sRPE quadrant + tonnage).
    const [quad, vol] = await Promise.all([computeLoadQuadrant(sb, p.id), computeVolumeLoad(sb, p.id)]);
    if ((quad.acwr != null && quad.acwr > 1.5) || quad.zone === "danger") {
      flags.push({ severity: 2, code: "load_spike", label: `Load spike (ACWR ${quad.acwr ?? "?"})` });
    } else if (vol.acwr_status === "very_high") {
      flags.push({ severity: 2, code: "tonnage_spike", label: `Tonnage spike (${vol.acwr})` });
    }

    // Retest due.
    const { data: lv } = await sb
      .from("lv_profile_tests").select("test_date")
      .eq("client_id", p.id).order("test_date", { ascending: false }).limit(1).maybeSingle();
    const lvDate = (lv as { test_date?: string } | null)?.test_date;
    if (lvDate && ((new Date(today).getTime() - new Date(lvDate).getTime()) / 86_400_000) > RETEST_DAYS) {
      flags.push({ severity: 1, code: "retest_due", label: "Strength test due" });
    }

    const topSeverity = flags.reduce((m, f) => Math.max(m, f.severity), 0);
    return { id: p.id, name: p.full_name, flags: flags.slice(0, 3), topSeverity };
  }));

  const clients = results
    .filter((c) => c.flags.length > 0)
    .sort((a, b) => b.topSeverity - a.topSeverity || b.flags.length - a.flags.length);

  return NextResponse.json({ ok: true, clients });
}
