/**
 * /api/coach/exercise-glossary
 *
 * GET — the full exercise library as a lightweight glossary
 * ({ name, name_is, description, description_is }) for any authenticated coach.
 * Used to attach bilingual explanations to free-text exercise names on the
 * curated programme surfaces (e.g. /coach/pt-explosive) via name matching.
 * Exercises are global (no team scoping).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

export const runtime = "nodejs";


export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing auth" }, { status: 401 });
  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return NextResponse.json({ error: "Invalid token" }, { status: 401 });

  const { data, error } = await supabase
    .from("exercise_library")
    .select("name, name_is, description, description_is, video_url");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ exercises: data ?? [] });
}
