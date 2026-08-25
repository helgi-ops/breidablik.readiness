export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * /api/coach/total-player-analysis
 *   GET ?list=1                    → active roster for the picker (+ which axes each has)
 *   GET ?playerId=&lang=&prose=1   → TotalPlayerAnalysis + rule-based development levers
 *                                    for each weakness + (optional, labelled) AI narrative
 *
 * The hub at the top of the (consolidated) Player Season Analysis page. Aggregates
 * data already in the system — footballer per-90 percentiles (StatsBomb squad) and the
 * athlete physical qualities (GPS / VALD / VBT), each ranked by rules into two SEPARATE
 * labelled reads. Never a blended score. PERFORMANCE ONLY — it never reads or writes the
 * readiness colour, the load decision, or the medical/injury view; asymmetry is surfaced
 * as robustness, not injury risk. The footballer↔players.id bridge surfaces unmatched
 * players, never guess-merges.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { buildPlayerAnalysis, readMetricBag, looksLikeGoalkeeper, type PlayerRow } from "@/lib/micropulse/playerAnalysis";
import { buildAthleteProfile } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { buildTotalPlayerAnalysis } from "@/lib/micropulse/playerAnalysis/totalPlayerAnalysis";
import { loadRoster, loadAthleteSignals, athleteSquadInput, type RosterRow } from "@/lib/micropulse/playerAnalysis/loadAthleteProfilesForTeam";
import { leversForProfile } from "@/lib/micropulse/playerAnalysis/developmentLevers";
import { QUALITY_BY_ID } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { matchByInitialSurname } from "@/lib/micropulse/statsIngestion/nameMatch";
import { computePeakShape } from "@/lib/micropulse/load/peakBenchmark";
import { loadPeakDistanceWindows } from "@/lib/micropulse/load/loadPeakDistanceWindows";
import { buildRtpAssessment } from "@/lib/micropulse/rtp/buildRtpAssessment";

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_NARRATIVE = `You write a concise, coach-facing PLAYER PROFILE from data already ranked into PERCENTILES (within the player's own squad / position group). You produce ONLY prose; a separate system renders the numbers, radars and the "how to improve" list.

Hard rules:
- Use ONLY the given numbers (percentiles 0-100, values, verdicts, role, minutes). NEVER invent figures.
- DESCRIPTIVE — association, not causation; no prediction. Small samples (low minutes / few sessions) → say so.
- Two SEPARATE reads: as a footballer and as an athlete. NEVER blend them into one score.
- PERFORMANCE ONLY. Never mention readiness, injury risk or medical status. Asymmetry is a robustness/performance quality, not an injury flag.
- Plain language a non-specialist head coach reads at a glance. Write in the requested language ONLY.
- Return a JSON object (no markdown fence) with EXACTLY these keys:
  profile: string (1-2 sentences — the one-line verdict, who this player is),
  footballerRead: string (2-3 sentences on the footballer picture, citing standout percentiles; "" if no footballer data),
  athleteRead: string (2-3 sentences on the physical picture, citing standout qualities/percentiles; if no athlete data, say the athlete axis is pending),
  crossRead: string (1-2 sentences on how the physical does/doesn't show up in games, from the cross-links; "" if none),
  roleFit: string (2-3 sentences — his best role and how to build the team around his strengths and around his gaps).`;

type FactPayload = Record<string, unknown>;

async function writeNarrative(facts: FactPayload, langName: string, apiKey: string): Promise<{ prose: Record<string, unknown>; model: string } | null> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1100, temperature: 0.3, system: SYSTEM_NARRATIVE,
        messages: [{ role: "user", content: `Write in ${langName}. Return ONLY the JSON object. Data:\n${JSON.stringify(facts)}` }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
    try { return { prose: JSON.parse(text), model: MODEL }; } catch { return null; }
  } catch { return null; }
}

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

/** The StatsBomb squad rows (footballer axis), with GK flagged from the roster + the bag. */
async function loadFootballSquad(teamId: string, roster: RosterRow[]): Promise<PlayerRow[]> {
  const supabase = getSupabase();
  const gkList = roster.filter((p) => /goal\s?keeper|^gk$/i.test((p.position ?? "").trim())).map((p) => ({ id: "gk", fullName: p.full_name }));
  const isRosterGk = (name: string) => gkList.length > 0 && matchByInitialSurname(name, gkList).confidence !== "none";
  const { data } = await supabase.from("player_season_stats")
    .select("wyscout_player_name, minutes, goals, assists, xg, metrics")
    .eq("team_id", teamId).eq("source", "statsbomb_csv");
  return ((data ?? []) as Array<{ wyscout_player_name: string | null; minutes: number | null; goals: number | null; assists: number | null; xg: number | null; metrics: Record<string, unknown> | null }>)
    .map((r) => {
      const name = r.wyscout_player_name ?? "—";
      return {
        name, minutes: num(r.minutes), goals: num(r.goals), assists: num(r.assists), xg: num(r.xg),
        metrics: readMetricBag(r.metrics),
        isGoalkeeper: looksLikeGoalkeeper(r.metrics, (r.metrics as Record<string, unknown> | null)?.["Primary Position"] as string | null) || isRosterGk(name),
      };
    });
}

/** Bridge a roster player → their StatsBomb squad name (mapping first, then name-fold). */
async function footballNameFor(teamId: string, player: RosterRow, squad: PlayerRow[]): Promise<string | null> {
  const supabase = getSupabase();
  const { data: map } = await supabase.from("stat_player_mapping")
    .select("wyscout_player_name").eq("team_id", teamId).eq("player_id", player.id).limit(1).maybeSingle();
  const mapped = (map as { wyscout_player_name?: string } | null)?.wyscout_player_name ?? null;
  if (mapped && squad.some((s) => s.name === mapped)) return mapped;
  const m = matchByInitialSurname(player.full_name, squad.map((s) => ({ id: s.name, fullName: s.name })));
  return m.confidence !== "none" ? m.playerId : null; // playerId here carries the squad name
}

/** This player's passing links (StatsBomb OBV combinations), aggregated across ingested
 *  matches — who they pass to / receive from most, and the value of it. Descriptive. */
async function passingLinksFor(teamId: string, playerId: string) {
  const supabase = getSupabase();
  const { data } = await supabase.from("sb_pass_combinations")
    .select("passer_player_id, receiver_player_id, passer_name, receiver_name, passes, obv, match_date")
    .eq("team_id", teamId).eq("side", "own")
    .or(`passer_player_id.eq.${playerId},receiver_player_id.eq.${playerId}`);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const out = new Map<string, { name: string; passes: number; obv: number }>();
  const inc = new Map<string, { name: string; passes: number; obv: number }>();
  const matches = new Set<string>();
  for (const r of rows) {
    matches.add(String(r.match_date));
    const passes = Number(r.passes) || 0, obv = Number(r.obv) || 0;
    if (r.passer_player_id === playerId) { const k = String(r.receiver_name); const e = out.get(k) ?? { name: k, passes: 0, obv: 0 }; e.passes += passes; e.obv += obv; out.set(k, e); }
    if (r.receiver_player_id === playerId) { const k = String(r.passer_name); const e = inc.get(k) ?? { name: k, passes: 0, obv: 0 }; e.passes += passes; e.obv += obv; inc.set(k, e); }
  }
  const top = (m: Map<string, { name: string; passes: number; obv: number }>) => [...m.values()].sort((a, b) => b.passes - a.passes).slice(0, 5);
  return { matches: matches.size, passesTo: top(out), passesFrom: top(inc) };
}

export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const url = new URL(req.url);
  const roster = await loadRoster(auth.teamId);

  if (url.searchParams.get("list")) {
    const [signals, squad] = await Promise.all([loadAthleteSignals(auth.teamId), loadFootballSquad(auth.teamId, roster)]);
    const players = await Promise.all(roster.map(async (r) => {
      const sig = signals.get(r.id) ?? {};
      const athleteQualities = Object.keys(sig).length;
      const fbName = await footballNameFor(auth.teamId, r, squad);
      return {
        playerId: r.id, name: r.full_name, position: r.position,
        has: { athlete: athleteQualities > 0, footballer: !!fbName },
        athleteQualities,
      };
    }));
    // Most-covered players first so the picker defaults to someone with data.
    players.sort((a, b) => (Number(b.has.footballer) + b.athleteQualities) - (Number(a.has.footballer) + a.athleteQualities) || a.name.localeCompare(b.name));
    return NextResponse.json({ ok: true, players });
  }

  const playerId = (url.searchParams.get("playerId") ?? "").trim();
  if (!playerId) return NextResponse.json({ ok: false, error: "playerId is required" }, { status: 400 });
  const me = roster.find((r) => r.id === playerId);
  if (!me) return NextResponse.json({ ok: false, error: "Player not on the active roster." }, { status: 404 });

  const [signals, squad] = await Promise.all([loadAthleteSignals(auth.teamId), loadFootballSquad(auth.teamId, roster)]);
  const athlete = buildAthleteProfile(athleteSquadInput(roster, signals), playerId);

  const fbName = await footballNameFor(auth.teamId, me, squad);
  const footballer = fbName ? buildPlayerAnalysis({ player: fbName, squad }) : null;

  const total = buildTotalPlayerAnalysis({ playerId, footballer, athlete });

  // All VALD Assessment measurements (CMJ / IMTP / NordBord / ForceFrame + the population
  // reference bands), from the same builder the VALD Assessment page uses so the numbers
  // match exactly. PERFORMANCE ONLY: we strip the injury-derived LSI and never surface the
  // clearance/decision/injury view — asymmetry stays a robustness quality here.
  const [passingLinks, rtp] = await Promise.all([
    passingLinksFor(auth.teamId, playerId),
    buildRtpAssessment(getSupabase(), playerId, auth.teamId).catch(() => null),
  ]);
  const vald = rtp && (rtp.cmj || rtp.imtp || rtp.limbStrength.length > 0 || rtp.battery.length > 0)
    ? {
        benchmarkPop: rtp.benchmarkPop,
        cmj: rtp.cmj,
        imtp: rtp.imtp ? { ...rtp.imtp, lsiPct: null } : null,
        battery: rtp.battery.map((b) => ({ ...b, lsiPct: null })),
        limbStrength: rtp.limbStrength.map((l) => ({ ...l, lsiPct: null })),
        coverage: rtp.coverage,
      }
    : null;

  // Peak-period fall-off SHAPE (total distance, context only — same source/logic as the Match
  // Movement benchmark card). Descriptive; never graded vs Ju Table 2, never touches readiness.
  const peakShape = computePeakShape(await loadPeakDistanceWindows(getSupabase(), playerId));

  // Rule-based development levers — one remedy per real weakness on either axis. Always
  // returned (rules decide); the AI narrative below only phrases the surrounding read.
  const development = leversForProfile(footballer, athlete).map((d) => ({
    axis: d.axis, key: d.key, percentile: d.percentile, lever: d.lever,
    label: d.axis === "athlete" ? { en: QUALITY_BY_ID[d.key as keyof typeof QUALITY_BY_ID]?.en ?? d.label, is: QUALITY_BY_ID[d.key as keyof typeof QUALITY_BY_ID]?.is ?? d.label } : { en: d.label, is: d.label },
  }));

  // Optional AI narrative (labelled AI). Rules already decided everything above; this only
  // writes the descriptive paragraphs a coach reads. Falls back to null (UI shows the
  // rule headline) when no key or the call fails.
  let narrative: Record<string, unknown> | null = null;
  let model: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (url.searchParams.get("prose") && apiKey) {
    const langName = (url.searchParams.get("lang") ?? "EN") === "IS" ? "Icelandic" : "English";
    const facts: FactPayload = {
      player: me.full_name, position: me.position, minutes: footballer?.minutes ?? null,
      benchmarkNote: "percentiles are within this player's own squad / position group",
      headline: total.headline,
      footballer: footballer && !footballer.goalkeeper ? {
        role: footballer.role, byCategory: footballer.byCategory,
        strengths: footballer.strengths.map((m) => ({ metric: m.label, percentile: m.percentile })),
        weaknesses: footballer.weaknesses.map((m) => ({ metric: m.label, percentile: m.percentile })),
      } : null,
      athlete: athlete && athlete.coverage.qualitiesWithData > 0 ? {
        qualities: athlete.qualities.filter((q) => q.value != null).map((q) => ({
          quality: QUALITY_BY_ID[q.id].en, value: q.value, unit: q.unit, percentile: q.positionPercentile, verdict: q.verdict, trend: q.trend,
        })),
      } : null,
      crossLinks: total.crossLinks.map((l) => ({ read: l.en })),
    };
    const out = await writeNarrative(facts, langName, apiKey);
    if (out) { narrative = out.prose; model = out.model; }
  }

  return NextResponse.json({
    ok: true,
    player: { id: me.id, name: me.full_name, position: me.position },
    total,
    development,
    passingLinks,
    peakShape,
    vald,
    narrative,
    model,
    aiGenerated: !!narrative,
    // Honest provenance for the coach: whether the footballer side could be bridged.
    footballerMatched: !!fbName,
    footballerSourceAvailable: squad.length > 0,
  });
}
