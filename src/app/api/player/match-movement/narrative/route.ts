/**
 * POST /api/player/match-movement/narrative
 *
 * The PLAYER's OWN AI explanation of how he moved (IMA driver), written to him in
 * the second person. Self-scoped: the player_id comes from his auth, never a
 * param. The client sends only WHICH two things to compare (a match date + a
 * match date or "usual"); the numbers are re-computed server-side. Labelled as AI.
 *
 * Body: { lang?, selA?, selB? }   (selB = "usual" or a match date)
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeMatchMovement } from "@/lib/micropulse/matchMovement";
import { buildComparisonFacts, callMatchMovementAI, PLAYER_SYSTEM } from "@/lib/micropulse/matchMovement/narrative";

export const runtime = "nodejs";
export const maxDuration = 30;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userRes?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const uid = userRes.user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

    const body = (await req.json().catch(() => ({}))) as { lang?: string; selA?: string; selB?: string };
    const lang = body.lang === "IS" ? "Icelandic" : "English";
    const isIS = body.lang === "IS";

    // Resolve THIS player from auth (never a param) + his team.
    const { data: pl } = await sb.from("players").select("id, team_id").eq("user_id", uid).maybeSingle();
    const player = pl as { id: string; team_id: string | null } | null;
    if (!player?.team_id) return NextResponse.json({ error: "No player/team context" }, { status: 400 });

    const data = await computeMatchMovement({ teamId: player.team_id });
    const rows = data.rows.filter((r) => r.player_id === player.id).sort((a, b) => b.match_date.localeCompare(a.match_date));
    if (rows.length === 0) return NextResponse.json({ error: "No match movement data yet" }, { status: 422 });

    const a = rows.find((r) => r.match_date === body.selA) ?? rows[0];
    const usualLabel = isIS ? "your usual" : "your usual";

    let bEntry;
    if (body.selB && body.selB !== "usual") {
      const b = rows.find((r) => r.match_date === body.selB);
      if (!b) return NextResponse.json({ error: "Match not found" }, { status: 422 });
      if (b.match_date === a.match_date) return NextResponse.json({ error: "Pick two different matches" }, { status: 422 });
      bEntry = { label: `your ${fmtDate(b.match_date)} match`, minutes: b.minutes, fingerprint: b.fingerprint, sub: b.sub };
    } else {
      const norm = data.playerAverages[player.id];
      const subNorm = data.subAverages[player.id] ?? null;
      if (!norm) return NextResponse.json({ error: "Your usual is still forming (needs more matches)" }, { status: 422 });
      bEntry = { label: `${usualLabel} (average across your matches)`, fingerprint: norm, sub: subNorm };
    }

    const facts = buildComparisonFacts(
      { label: `your ${fmtDate(a.match_date)} match`, minutes: a.minutes, fingerprint: a.fingerprint, sub: a.sub },
      bEntry,
    );

    const narrative = await callMatchMovementAI({ apiKey, system: PLAYER_SYSTEM, facts, lang, audience: "player", maxTokens: 500 });
    return NextResponse.json({ ok: true, narrative, model: "claude-haiku-4-5-20251001" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
