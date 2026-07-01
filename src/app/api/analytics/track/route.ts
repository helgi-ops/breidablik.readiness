/**
 * POST /api/analytics/track
 *
 * Fire-and-forget usage event ingest. The client sends only { path, event_type?,
 * feature?, meta? }; identity (user/team/role) is resolved SERVER-SIDE from the
 * bearer token — never trusted from the body. The path is normalised (ids
 * stripped) so we store surface usage, not who-viewed-which-player.
 *
 * Powers the admin "what's used / what's dead" view (product-audit P3).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { normalizeUsagePath } from "@/lib/analytics/usagePath";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });

    const supabase = getSupabase();
    const { data: userRes } = await supabase.auth.getUser(token);
    const user = userRes?.user;
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      path?: string;
      event_type?: string;
      feature?: string;
      meta?: Record<string, unknown>;
    };
    if (!body.path) return NextResponse.json({ ok: false }, { status: 400 });

    const { data: prof } = await supabase
      .from("profiles")
      .select("role, team_id")
      .eq("id", user.id)
      .maybeSingle();

    const eventType = body.event_type === "feature" ? "feature" : "page_view";

    await supabase.from("usage_events").insert({
      user_id: user.id,
      team_id: (prof as { team_id?: string } | null)?.team_id ?? null,
      role: (prof as { role?: string } | null)?.role ?? null,
      path: normalizeUsagePath(body.path),
      event_type: eventType,
      feature: body.feature ? String(body.feature).slice(0, 120) : null,
      meta: body.meta ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Analytics must never break the app — swallow and report a soft failure.
    return NextResponse.json({ ok: false });
  }
}
