export const runtime = "nodejs";

/**
 * POST /api/coach/custom-templates/analyze
 *
 * Body: { text: string, sport?: string }
 *
 * Takes the already-extracted text of an uploaded training programme (PDF /
 * Excel / Word — extracted client-side) and returns a proposed multi-day
 * structure. READ-ONLY: nothing is written to any table here. The coach
 * reviews, edits and confirms in the builder before anything is saved.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { extractProgramme } from "@/lib/micropulse/customTemplates/programmeExtract";

async function requireCoach(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 } as const;

  const { data: userRes, error } = await supabase.auth.getUser(token);
  if (error || !userRes?.user) return { error: "Ógilt token", status: 401 } as const;

  const { data: prof } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Aðeins staff getur gert þetta", status: 403 } as const;

  return { userId: userRes.user.id } as const;
}

export async function POST(req: NextRequest) {
  const auth = await requireCoach(req);
  if ("error" in auth)
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { text?: string; sport?: string };
  const text = typeof body.text === "string" ? body.text : "";
  const sport = typeof body.sport === "string" ? body.sport : null;

  if (text.trim().length < 20)
    return NextResponse.json(
      { ok: false, error: "Skjalið innihélt of lítinn læsilegan texta." },
      { status: 400 },
    );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json(
      { ok: false, error: "AI-greining er ekki uppsett (ANTHROPIC_API_KEY vantar)." },
      { status: 503 },
    );

  try {
    const result = await extractProgramme({ apiKey, text, sport });
    if (result.days.length === 0)
      return NextResponse.json(
        { ok: false, error: "Fann engan æfingadag í skjalinu." },
        { status: 422 },
      );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI-greining mistókst";
    // JSON parse / content failure → 422; network / upstream → 502.
    const status = msg.startsWith("AI ") ? 502 : 422;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
