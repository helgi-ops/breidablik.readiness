/**
 * /api/trainer/exercise-search?q=… — typeahead for the corrective manual-add.
 *
 * Merges two sources so the trainer can pick a known exercise (and get its
 * video) instead of free-typing:
 *   - the cited corrective library (registry) → cited items with cue/dose/video
 *   - exercise_library (the club's own curated set) → items with a demo video
 *
 * Auth: any coach / admin / staff.
 */

import { NextResponse } from "next/server";
import { getSupabaseServer as getAdmin } from "@/lib/supabaseServer";
import { searchCorrectiveLibrary, type LibrarySearchItem } from "@/lib/trainer/correctiveFromInjury";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sb = getAdmin();
  const { data: u } = await sb.auth.getUser(token);
  const userId = u?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: prof } = await sb.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] });

  // Cited corrective library first (these carry a research citation).
  const corrective = searchCorrectiveLibrary(q, 6);
  const seen = new Set(corrective.map((c) => c.name.toLowerCase()));

  // Then the club's own exercise_library (curated videos).
  const results: LibrarySearchItem[] = [...corrective];
  const { data: lib } = await sb
    .from("exercise_library")
    .select("name, name_is, video_url, description, description_is")
    .or(`name.ilike.%${q}%,name_is.ilike.%${q}%`)
    .limit(10);
  for (const r of (lib ?? []) as Array<{ name: string; name_is: string | null; video_url: string | null; description: string | null; description_is: string | null }>) {
    if (!r.name || seen.has(r.name.toLowerCase())) continue;
    seen.add(r.name.toLowerCase());
    results.push({
      name: r.name,
      nameIs: r.name_is ?? undefined,
      cue: r.description ?? undefined,
      cueIs: r.description_is ?? undefined,
      videoUrl: r.video_url ?? null,
      kind: "library",
    });
    if (results.length >= 12) break;
  }

  return NextResponse.json({ ok: true, results });
}
