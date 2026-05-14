/**
 * /api/client/lv-profile
 *
 * Latest Load-Velocity test for the calling player + a %1RM lookup table
 * derived from slope/intercept. Used by /client/lv-profile.
 *
 *   {
 *     ok: true,
 *     test: { exercise_label, test_date, slope, intercept, est_one_rm, mvt, v0, profile_type, r_squared } | null,
 *     table: [{ weight_kg, pct_one_rm, predicted_velocity_ms }],
 *     dsi: { ratio, tier } | null
 *   }
 */

import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function env(n: string) { const v = process.env[n]; if (!v) throw new Error(`Missing ${n}`); return v; }
function admin(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
}
async function requirePlayer(req: Request) {
  const a = req.headers.get("authorization") || "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Unauthorized", status: 401 } as const;
  const sb = admin();
  const { data: u } = await sb.auth.getUser(token);
  if (!u?.user?.id) return { error: "Unauthorized", status: 401 } as const;
  const { data: p } = await sb.from("players").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!p) return { error: "Not a player account", status: 403 } as const;
  return { sb, playerId: (p as { id: string }).id } as const;
}

export async function GET(req: Request) {
  const a = await requirePlayer(req);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const { data, error } = await a.sb
    .from("lv_profile_tests")
    .select("exercise_label, test_date, slope, intercept, est_one_rm, est_one_rm_high, est_one_rm_low, mvt, zero_velocity_load, profile_type, r_squared, dsi_ratio, dsi_tier")
    .eq("client_id", a.playerId)
    .order("test_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: true, test: null, table: [], dsi: null });

  const t = data as {
    exercise_label: string; test_date: string;
    slope: number; intercept: number;
    est_one_rm: number | null; est_one_rm_high: number | null; est_one_rm_low: number | null;
    mvt: number; zero_velocity_load: number | null;
    profile_type: string | null; r_squared: number | null;
    dsi_ratio: number | null; dsi_tier: string | null;
  };

  // %1RM table — anchor on est_one_rm and walk down in 5kg steps.
  // velocity at load L = intercept + slope·L
  const table: Array<{ weight_kg: number; pct_one_rm: number; predicted_velocity_ms: number }> = [];
  if (t.est_one_rm && t.est_one_rm > 0) {
    const oneRm = t.est_one_rm;
    // Build percentages from 40% → 100% in 5% steps.
    for (let pct = 40; pct <= 100; pct += 5) {
      const weight = Number(((oneRm * pct) / 100).toFixed(1));
      const v = Number((t.intercept + t.slope * weight).toFixed(2));
      table.push({ weight_kg: weight, pct_one_rm: pct, predicted_velocity_ms: v });
    }
  }

  return NextResponse.json({
    ok: true,
    test: {
      exercise_label: t.exercise_label,
      test_date: t.test_date,
      slope: t.slope,
      intercept: t.intercept,
      est_one_rm: t.est_one_rm,
      est_one_rm_high: t.est_one_rm_high,
      est_one_rm_low: t.est_one_rm_low,
      mvt: t.mvt,
      v0: t.intercept,                  // velocity at load = 0
      l0: t.zero_velocity_load,         // load at velocity = 0
      profile_type: t.profile_type,
      r_squared: t.r_squared,
    },
    table,
    dsi: t.dsi_ratio != null ? { ratio: t.dsi_ratio, tier: t.dsi_tier } : null,
  });
}
