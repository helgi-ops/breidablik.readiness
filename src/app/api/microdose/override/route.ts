// app/api/microdose/override/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Body = {
  player_id: string;
  entry_date: string; // YYYY-MM-DD
  to_variant_id: string;
  reason: string;
};

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// Simple healthcheck/debug endpoint (helps verify deploy + route wiring)
export async function GET() {
  return NextResponse.json(
    { ok: true, route: "microdose/override" },
    {
      status: 200,
      headers: {
        "cache-control": "no-store",
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    // ---- 1) Auth: require bearer token ----
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing Authorization Bearer token" }, { status: 401 });
    }

    const supabaseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

    // Service client (bypasses RLS) - but we still validate the caller via JWT
    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // Verify the JWT -> user
    const { data: userRes, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
    }
    const userId = userRes.user.id;

    // ---- 2) Authorize: must be COACH/ADMIN/STAFF ----
    const { data: prof, error: pErr } = await sb
      .from("profiles")
      .select("id, role, team_id")
      .eq("id", userId)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
    }

    const role = String(prof?.role ?? "").toUpperCase();
    const isStaff = role === "COACH" || role === "ADMIN" || role === "STAFF";
    if (!isStaff) {
      return NextResponse.json({ ok: false, error: "Forbidden (not staff)" }, { status: 403 });
    }

    // ---- 3) Parse body ----
    const body = (await req.json()) as Partial<Body>;
    const player_id = String(body.player_id ?? "").trim();
    const entry_date = String(body.entry_date ?? "").trim();
    const to_variant_id = String(body.to_variant_id ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!player_id || !entry_date || !to_variant_id || !reason) {
      return NextResponse.json(
        { ok: false, error: "player_id, entry_date, to_variant_id, reason are required" },
        { status: 400 }
      );
    }

    // ---- 4) Read current decision (Stage 4 source-of-truth) ----
    const { data: cur, error: curErr } = await sb
      .from("microdose_decisions")
      .select("id, team_id, chosen_variant_id, locked, source")
      .eq("player_id", player_id)
      .eq("entry_date", entry_date)
      .maybeSingle();

    if (curErr) return NextResponse.json({ ok: false, error: curErr.message }, { status: 500 });
    if (!cur?.id) {
      return NextResponse.json(
        { ok: false, error: "No microdose_decision found for player/date. Run decision engine first." },
        { status: 409 }
      );
    }

    const team_id = cur.team_id ?? prof?.team_id ?? null;

    // Optional: staff can only override within their own team (recommended)
    if (prof?.team_id && team_id && prof.team_id !== team_id) {
      return NextResponse.json({ ok: false, error: "Forbidden (team mismatch)" }, { status: 403 });
    }

    // ---- 5) Validate target variant exists ----
    const { data: vRow, error: vErr } = await sb
      .from("microdose_template_variants")
      .select("id, md_day, readiness_level, variant, title")
      .eq("id", to_variant_id)
      .maybeSingle();

    if (vErr) return NextResponse.json({ ok: false, error: vErr.message }, { status: 500 });
    if (!vRow?.id) {
      return NextResponse.json({ ok: false, error: "Invalid to_variant_id" }, { status: 400 });
    }

    // ---- 6) Audit insert ----
    const auditPayload: any = {
      team_id,
      player_id,
      entry_date,
      from_variant_id: cur.chosen_variant_id ?? null,
      to_variant_id,
      reason,
      created_by: userId,
    };

    const { error: aInsErr } = await sb.from("microdose_overrides").insert(auditPayload);
    if (aInsErr) return NextResponse.json({ ok: false, error: aInsErr.message }, { status: 500 });

    // ---- 7) Update decision (enforced) ----
    const { error: updErr } = await sb
      .from("microdose_decisions")
      .update({
        chosen_variant_id: to_variant_id,
        locked: true,
        source: "COACH_OVERRIDE",
        why: `Coach override: ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cur.id);

    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        decision_id: cur.id,
        to_variant_id,
        to_variant: vRow.variant ?? null,
        to_title: vRow.title ?? null,
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
