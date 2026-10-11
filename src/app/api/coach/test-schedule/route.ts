export const runtime = "nodejs";

/**
 * /api/coach/test-schedule — the coach's scheduled performance tests (dates pinned to test types).
 * Shared by the Periodization Hub "Testing" tab and Week Setup (both can add/edit/remove). Team-scoped
 * + coach-gated via the service-role server client (the table's RLS blocks direct client access).
 *
 *   GET    ?from=YYYY-MM-DD&to=YYYY-MM-DD  — scheduled tests in the range (defaults: all)
 *   POST   { test_key, test_date, note? }  — upsert one (onConflict team_id,test_key,test_date)
 *   DELETE ?id=<uuid>  OR  ?test_key=&test_date=  — remove one
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

const TEST_KEYS = ["aerobic", "cmj", "maxStrength", "nordbord", "sprint"] as const;
type TestKey = (typeof TEST_KEYS)[number];

async function requireCoach(req: NextRequest) {
  const sb = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 as const };
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 as const };
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("team_id, role").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { team_id?: string | null; role?: string };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 as const };
  if (!p.team_id) return { error: "No team", status: 400 as const };
  return { sb, uid, teamId: p.team_id };
}

export async function GET(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  let q = ctx.sb.from("coach_test_schedule").select("id, test_key, test_date, note").eq("team_id", ctx.teamId);
  if (from) q = q.gte("test_date", from);
  if (to) q = q.lte("test_date", to);
  const { data, error } = await q.order("test_date", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, tests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const body = await req.json().catch(() => null);
  const test_key = String(body?.test_key ?? "");
  const test_date = String(body?.test_date ?? "").trim();
  if (!TEST_KEYS.includes(test_key as TestKey)) return NextResponse.json({ ok: false, error: "Invalid test_key" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(test_date)) return NextResponse.json({ ok: false, error: "A valid date (YYYY-MM-DD) is required" }, { status: 400 });
  const { data, error } = await ctx.sb
    .from("coach_test_schedule")
    .upsert(
      { team_id: ctx.teamId, test_key, test_date, note: body?.note ? String(body.note) : null, created_by: ctx.uid, updated_at: new Date().toISOString() },
      { onConflict: "team_id,test_key,test_date" },
    )
    .select("id, test_key, test_date, note")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, test: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireCoach(req);
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
  const id = req.nextUrl.searchParams.get("id");
  const test_key = req.nextUrl.searchParams.get("test_key");
  const test_date = req.nextUrl.searchParams.get("test_date");
  let q = ctx.sb.from("coach_test_schedule").delete().eq("team_id", ctx.teamId);
  if (id) q = q.eq("id", id);
  else if (test_key && test_date) q = q.eq("test_key", test_key).eq("test_date", test_date);
  else return NextResponse.json({ ok: false, error: "id or (test_key + test_date) required" }, { status: 400 });
  const { error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
