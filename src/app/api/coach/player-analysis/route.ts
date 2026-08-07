export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/player-analysis
 *   ?list=1               → the squad's StatsBomb players (name, minutes) for the picker
 *   ?player=&prose=&lang= → the PlayerAnalysis for one player (+ optional AI read)
 *
 * Own-squad player read from StatsBomb per-90 season stats (player_season_stats,
 * source=statsbomb_csv). Rules compute the percentiles; the AI only phrases them and
 * is labelled AI. Descriptive context only — it never touches the readiness colour.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildPlayerAnalysis, ANALYSIS_METRICS, type PlayerRow } from "@/lib/micropulse/playerAnalysis";

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

async function loadSquad(teamId: string): Promise<PlayerRow[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("player_season_stats")
    .select("wyscout_player_name, minutes, goals, assists, xg, metrics")
    .eq("team_id", teamId).eq("source", "statsbomb_csv");
  return ((data ?? []) as Array<{ wyscout_player_name: string | null; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, unknown> | null }>)
    .map((r) => {
      const metrics: Record<string, number | null> = {};
      for (const [key] of ANALYSIS_METRICS) metrics[key] = num(r.metrics?.[key]);
      return { name: r.wyscout_player_name ?? "—", minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg), metrics };
    });
}

const SYSTEM = `You write a concise PLAYER ANALYSIS for a head coach about one of THEIR OWN players, from per-90 season stats already ranked into PERCENTILES within the squad. You produce ONLY prose; a separate system renders the numbers/bars.

Hard rules:
- Use ONLY the given numbers (percentiles 0-100 vs the squad, the role, minutes). Never invent figures.
- DESCRIPTIVE, association not causation; no prediction, no transfer/selection advice. Percentiles are vs THIS squad only, a small sample — say so if minutes are low.
- Plain language. "npxG" = non-penalty expected goals (chance quality); "OBV" = on-ball value.
- Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these keys:
  summary: string (1-2 sentences — the player's profile and clearest role),
  strengths: string (2-3 sentences on what they do best, citing the standout percentiles),
  development: string (2-3 sentences on the lower-percentile areas — framed as development, not criticism).`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const player = String(body?.player ?? "").trim();
  if (!player) return NextResponse.json({ ok: false, error: "player is required" }, { status: 400 });
  const squad = await loadSquad(auth.teamId);
  if (squad.length === 0) return NextResponse.json({ ok: false, error: "No StatsBomb squad imported yet — import the StatsBomb Squad CSV on the Player Statistics page." }, { status: 400 });
  const analysis = buildPlayerAnalysis({ player, squad });
  if (!analysis) return NextResponse.json({ ok: false, error: "That player isn't in the StatsBomb squad." }, { status: 404 });

  let prose: Record<string, unknown> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (body?.prose && apiKey) {
    const lang = body?.lang === "IS" ? "Icelandic" : "English";
    const facts = {
      player: analysis.player, minutes: analysis.minutes, role: analysis.role, byCategory: analysis.byCategory,
      strengths: analysis.strengths.map((m) => ({ metric: m.label, percentile: m.percentile })),
      weaknesses: analysis.weaknesses.map((m) => ({ metric: m.label, percentile: m.percentile })),
    };
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 900, temperature: 0.3, system: SYSTEM,
          messages: [{ role: "user", content: `Write in ${lang}. Return ONLY the JSON object. Data:\n${JSON.stringify(facts)}` }] }),
      });
      if (res.ok) {
        const j = await res.json();
        let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const a = text.indexOf("{"), b = text.lastIndexOf("}");
        text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
        try { prose = JSON.parse(text); model = MODEL; } catch { prose = null; }
      }
    } catch { /* prose stays null */ }
  }

  return NextResponse.json({ ok: true, analysis, prose, model, aiGenerated: Boolean(prose) });
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const squad = await loadSquad(auth.teamId);
  const players = squad
    .filter((p) => (p.minutes ?? 0) > 0)
    .sort((a, b) => (b.minutes ?? 0) - (a.minutes ?? 0))
    .map((p) => ({ name: p.name, minutes: p.minutes }));
  return NextResponse.json({ ok: true, players });
}
