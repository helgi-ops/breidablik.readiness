export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/goalkeeper-analysis
 *   GET                          → your goalkeepers who have per-match GK data
 *   POST { name|playerId, prose } → the aggregated GK season profile (+ optional AI read)
 *
 * A goalkeeper-specific season read from his per-match StatsBomb stats (player_match_stats
 * .metrics, uploaded via the per-player Match Stats CSV). Rules aggregate; the AI phrases
 * and is labelled AI. Descriptive — never touches the readiness verdict.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildGoalkeeperAnalysis, type GkMatch } from "@/lib/micropulse/goalkeeperAnalysis";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";

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
function bag(m: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!m) return null;
  const lo: Record<string, unknown> = {}; for (const [k, v] of Object.entries(m)) lo[k.trim().toLowerCase()] = v;
  for (const k of keys) { const n = num(lo[k.trim().toLowerCase()]); if (n != null) return n; }
  return null;
}

async function rosterGks(teamId: string): Promise<Array<{ id: string; fullName: string }>> {
  const supabase = getSupabase();
  const { data } = await supabase.from("players").select("id, full_name, position").eq("team_id", teamId);
  return ((data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>)
    .filter((p) => /goal\s?keeper|^gk$/i.test((p.position ?? "").trim()))
    .map((p) => ({ id: p.id, fullName: p.full_name ?? "—" }));
}

async function loadGkMatches(teamId: string, playerId: string): Promise<GkMatch[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("player_match_stats")
    .select("minutes, metrics").eq("team_id", teamId).eq("player_id", playerId).eq("source", "statsbomb_csv");
  return ((data ?? []) as Array<{ minutes: number | null; metrics: Record<string, unknown> | null }>)
    .filter((r) => bag(r.metrics, "Saves", "Non Penalty Save%", "Shots Faced") != null) // GK rows only
    .map((r) => ({
      minutes: num(r.minutes),
      shotsFaced: bag(r.metrics, "Non Penalty Shots Faced", "Shots Faced"),
      saves: bag(r.metrics, "Saves"),
      psxgFaced: bag(r.metrics, "Non Penalty PSxG Faced"),
      gsaa: bag(r.metrics, "Goals Saved Above Average"),
      savePct: bag(r.metrics, "Non Penalty Save%", "Save%"),
      passes: bag(r.metrics, "Non Throw-in Passes", "Passes"),
      successfulPasses: bag(r.metrics, "Successful Passes"),
      passesToFinalThird: bag(r.metrics, "Non Throw-in Passes Into Final Third", "Passes Into Final Third"),
      passLength: bag(r.metrics, "Successful Pass Length", "Pass Length"),
      longGoalKicks: bag(r.metrics, "Long Goal Kicks"),
      shortGoalKicks: bag(r.metrics, "Short Goal Kicks"),
    }));
}

const SYSTEM = `You write a concise GOALKEEPER season read for a head coach, from aggregated per-match stats already reduced to CITED facts (matches, minutes; shot-stopping: Goals Saved Above Average, Save%, post-shot xG faced vs goals conceded, shots faced/saves; distribution: pass completion %, passes into the final third, and the share of goal kicks played long).

Hard rules:
- Use ONLY the given numbers. Never invent figures.
- DESCRIPTIVE, association not causation; a small sample if few matches — say so.
- Goals Saved Above Average (GSAA) is the headline: POSITIVE = saved more than an average keeper would (strong shot-stopping); NEGATIVE = below. Read it plainly.
- Distribution: a high long-ball share = plays direct; a high pass completion + short goal kicks = plays out from the back.
- Plain language for a head coach. Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY:
  summary: string (1-2 sentences — his shot-stopping level and distribution style),
  shotStopping: string (2-3 sentences citing GSAA, Save%, PSxG vs conceded),
  distribution: string (2-3 sentences on how he plays with the ball — short vs long, completion, final-third passes).`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const gks = await rosterGks(auth.teamId);
  let playerId = String(body?.playerId ?? "").trim();
  let name = String(body?.name ?? "").trim();
  if (!playerId && name) {
    const m = matchByInitialSurname(name, gks.map((g) => ({ id: g.id, fullName: g.fullName })));
    playerId = m.playerId ?? "";
  }
  if (!playerId) return NextResponse.json({ ok: false, error: "That goalkeeper isn't on your roster (set his position to GK)." }, { status: 404 });
  name = gks.find((g) => g.id === playerId)?.fullName ?? name;

  const matches = await loadGkMatches(auth.teamId, playerId);
  if (matches.length === 0) return NextResponse.json({ ok: false, error: "No per-match goalkeeper data yet — import his StatsBomb player Match Stats CSV on Player Season Analysis." }, { status: 404 });
  const analysis = buildGoalkeeperAnalysis(matches);

  let prose: Record<string, unknown> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (body?.prose && apiKey) {
    const lang = body?.lang === "IS" ? "Icelandic" : "English";
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 800, temperature: 0.3, thinking: { type: "disabled" }, system: SYSTEM,
          messages: [{ role: "user", content: `Write in ${lang}. Return ONLY the JSON object. Facts:\n${JSON.stringify({ player: name, ...analysis })}` }] }),
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

  return NextResponse.json({ ok: true, player: name, analysis, prose, model, aiGenerated: Boolean(prose) });
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const supabase = getSupabase();
  const gks = await rosterGks(auth.teamId);
  if (gks.length === 0) return NextResponse.json({ ok: true, goalkeepers: [] });
  const { data } = await supabase.from("player_match_stats").select("player_id").eq("team_id", auth.teamId).eq("source", "statsbomb_csv").in("player_id", gks.map((g) => g.id)).limit(2000);
  const withData = new Set(((data ?? []) as Array<{ player_id: string | null }>).map((r) => r.player_id));
  return NextResponse.json({ ok: true, goalkeepers: gks.filter((g) => withData.has(g.id)).map((g) => ({ id: g.id, name: g.fullName })) });
}
