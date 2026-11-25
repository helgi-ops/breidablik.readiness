/**
 * GET /api/coach/vald/forceframe-rows?teamId=<uuid>&date=YYYY-MM-DD
 *
 * The team's ForceFrame tests (newest-first, up to 200) for the VALD panel's strength table.
 * A hip AD/AB test from the VALD API is stored as ONE row holding only the stronger pad set
 * (often abduction). The raw test holds both, and the browser cannot read raw tests (no RLS
 * policy), so this route splits each such row into an adduction row (inner pads = groin) and an
 * abduction row (outer pads) — the same split the RTP assessment and the groin flag use.
 * Coach / admin only; team-scoped.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import { isHipForceFrameTest } from "@/lib/micropulse/vald/groinStrength";
import { fetchHipPaddles, splitHipRows } from "@/lib/micropulse/vald/hipPaddles";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const sb = getSupabaseServer();
    const url = new URL(req.url);
    const { teamId } = await requireCoachAccessForTeam(sb, req, url.searchParams.get("teamId"));
    if (!teamId) return NextResponse.json({ ok: false, error: "Team context is required" }, { status: 400 });
    const dateParam = url.searchParams.get("date") ?? "";
    const date = DATE_RE.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

    const { data, error } = await sb
      .from("vald_forceframe_results")
      .select("microplayer_id, raw_test_id, test_type, body_region, movement_pattern, direction, test_timestamp, left_peak_force_n, right_peak_force_n, asymmetry_percent, players!inner(full_name)")
      .eq("team_id", teamId).eq("is_valid", true)
      .not("microplayer_id", "is", null)
      .lte("test_timestamp", `${date}T23:59:59`)
      .order("test_timestamp", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    const paddles = await fetchHipPaddles(sb, rows.filter((r) => isHipForceFrameTest(r) && !r.direction).map((r) => r.raw_test_id as string | null));
    // raw_test_id is only needed for the split; don't send it to the browser.
    const out = splitHipRows(rows, paddles, isHipForceFrameTest).map((r) => {
      const copy = { ...r };
      delete copy.raw_test_id;
      return copy;
    });
    return NextResponse.json({ ok: true, rows: out });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status: code });
  }
}
