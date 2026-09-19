/**
 * POST /api/coach/ksi-report/ai — a labelled AI summary of what a player has been doing,
 * built from his load numbers (passed in from the report). Coach-auth. Descriptive only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildKsiAiSummary, type KsiAiFacts } from "@/lib/micropulse/ksiReport/ai";

export const runtime = "nodejs";

async function authCoach(req: NextRequest): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, error: "Missing auth", status: 401 };
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { ok: false, error: "Invalid token", status: 401 };
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", userRes.user.id).maybeSingle();
  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { ok: false, error: "Coach role required", status: 403 };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const a = await authCoach(req);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: (KsiAiFacts & { lang?: string }) | null = null;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Bad JSON" }, { status: 400 }); }
  if (!body?.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const lang = body.lang === "IS" ? "IS" : "EN";

  try {
    const summary = await buildKsiAiSummary(
      { name: body.name, window: body.window, load: body.load ?? {}, radar: body.radar ?? [], injuryNote: body.injuryNote ?? null, programNote: body.programNote ?? null },
      lang,
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI error" }, { status: 500 });
  }
}
