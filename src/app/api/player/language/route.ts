/**
 * PUT /api/player/language — the player app reports the language it is used in (EN / IS), so strength sessions
 * are stored in that language (`players.app_language`, 2026-11-18, review item D). The app calls it only when the
 * language differs from what it last reported. Self-scoped: a player sets only their own row.
 */
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { asAppLang } from "@/lib/micropulse/strengthProgramming/playerLanguage";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { lang?: unknown } | null;
  const lang = asAppLang(body?.lang);
  if (!lang) return NextResponse.json({ error: "lang must be EN or IS" }, { status: 400 });
  const { error } = await sb.from("players").update({ app_language: lang }).eq("id", playerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, lang });
}
