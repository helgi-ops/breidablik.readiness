export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/match-review
 *   GET                        → matches that have per-match player data (date, opponent)
 *   POST { date, prose, lang } → the CITED match facts (+ optional AI coach recap)
 *
 * Reviews the coach's OWN team's last-match attacking output from player_match_stats.
 * Rules compute the facts (buildMatchReview); the AI only phrases them and is labelled
 * AI. Descriptive context — it never touches the readiness colour, load, or decision.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildMatchReview, type ReviewPlayer } from "@/lib/micropulse/matchReview";

const MODEL = "claude-haiku-4-5-20251001";

async function getCoachTeam(req: NextRequest) {
  const supabase = getSupabase();
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await supabase.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const { data: prof } = await supabase.from("profiles").select("team_id, role").eq("id", userRes.user.id).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string } | null)?.team_id ?? null;
  if (!teamId) return { error: "Coach not linked to a team", status: 400 } as const;
  return { teamId } as const;
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** Read a metric from the jsonb bag tolerant of PDF vs CSV column names. */
function bagNum(bag: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!bag) return null;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(bag)) lower[k.toLowerCase()] = v;
  for (const k of keys) { const v = lower[k.toLowerCase()]; const n = num(v); if (n != null) return n; }
  return null;
}

type Row = { player_id: string | null; match_date: string; opponent: string | null; home_away: string | null; goals: number | null; assists: number | null; xg: number | null; shots: number | null; key_passes: number | null; metrics: Record<string, unknown> | null; players: { full_name: string | null } | null };

async function loadRows(teamId: string, date: string): Promise<ReviewPlayer[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("player_match_stats")
    .select("goals, assists, xg, shots, key_passes, metrics, players:player_id(full_name)")
    .eq("team_id", teamId).eq("match_date", date).eq("source", "statsbomb_match_report").not("player_id", "is", null);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    name: r.players?.full_name ?? "—",
    goals: num(r.goals), assists: num(r.assists), xg: num(r.xg), shots: num(r.shots), keyPasses: num(r.key_passes),
    xgAssisted: bagNum(r.metrics, "xG Assisted", "xG Assist"),
    xgChain: bagNum(r.metrics, "xG Chain", "xGChain"),
    tackles: bagNum(r.metrics, "Tackles", "T"),
    interceptions: bagNum(r.metrics, "Interceptions", "I"),
  }));
}

const SYSTEM = `You write a concise LAST-MATCH REVIEW for a head coach, from per-player football stats that a separate system has already reduced to a few CITED facts (team xG/shots/goals, the match's top threat, top chance-creator, build-up hub, top defender, and finishing outliers). You produce ONLY prose.

Hard rules:
- Use ONLY the given numbers. Never invent figures, opponents, or events you weren't given.
- DESCRIPTIVE, association not causation. This is your own team's ATTACKING output for one match — do NOT claim a result, scoreline, or opponent comparison you weren't given.
- Plain language for a head coach. "xG" = expected goals (chance quality); "xG chain" = involvement in the moves that led to shots.
- Name the players in the facts. Be specific and short.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY:
  verdict: string (1-2 sentences — the headline of the team's attacking display + finishing),
  keyPoints: string[] (exactly 3 short bullet sentences — who created the chances, the main threat / who to build around, and a finishing or defensive note).`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const date = String(body?.date ?? "").trim();
  if (!date) return NextResponse.json({ ok: false, error: "date is required" }, { status: 400 });

  const rows = await loadRows(auth.teamId, date);
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "No mapped per-match player data for that match yet." }, { status: 404 });
  const facts = buildMatchReview(rows);

  let prose: Record<string, unknown> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (body?.prose && apiKey) {
    const lang = body?.lang === "IS" ? "Icelandic" : "English";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 700, temperature: 0.3, thinking: { type: "disabled" }, system: SYSTEM,
          messages: [{ role: "user", content: `Write in ${lang}. Return ONLY the JSON object. Facts:\n${JSON.stringify(facts)}` }] }),
      });
      if (res.ok) {
        const j = await res.json();
        let text = String(j?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const a = text.indexOf("{"), b = text.lastIndexOf("}");
        text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
        try { prose = JSON.parse(text); model = MODEL; } catch { prose = null; }
      }
    } catch { /* prose stays null */ }
  }

  return NextResponse.json({ ok: true, date, facts, prose, model, aiGenerated: Boolean(prose) });
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const supabase = getSupabase();
  const { data } = await supabase.from("player_match_stats")
    .select("match_date, opponent")
    .eq("team_id", auth.teamId).eq("source", "statsbomb_match_report").not("player_id", "is", null)
    .order("match_date", { ascending: false }).limit(2000);
  const seen = new Map<string, string | null>();
  for (const r of (data ?? []) as Array<{ match_date: string; opponent: string | null }>) if (!seen.has(r.match_date)) seen.set(r.match_date, r.opponent);
  return NextResponse.json({ ok: true, matches: [...seen.entries()].map(([date, opponent]) => ({ date, opponent })) });
}
