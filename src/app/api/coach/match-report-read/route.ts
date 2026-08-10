export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/coach/match-report-read  (multipart: file (PDF), lang?)
 *
 * "Read this match report FOR me." The coach uploads a full match-report PDF (Wyscout
 * Report Center, a StatsBomb Game Team Analysis, a league report — any of them) and the
 * model reads the whole document and returns a concise, plain-language coach briefing:
 * headline verdict, what went well / to improve, key players, tactical + opponent notes.
 *
 * This is an AI READ, labelled as such — it summarises the uploaded report, cites it as
 * the source, and is DESCRIPTIVE. It writes nothing and never touches the readiness
 * colour, load, or the daily decision. Structured stats still come from the CSV/Excel
 * importers; this is the qualitative read those can't give. Coach-scoped; the PDF is sent
 * to the model in-request and not stored.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";

const MODEL = "claude-sonnet-5";

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
  // The coach's own club name(s) — so the briefing is centred on THEIR team, not the
  // report's home (first-named) side. Best-effort; empty is fine (falls back to neutral).
  const { data: team } = await supabase.from("teams").select("name, club_short_name").eq("id", teamId).maybeSingle();
  const teamName = (team as { name?: string } | null)?.name ?? "";
  const teamShort = (team as { club_short_name?: string } | null)?.club_short_name ?? "";
  return { supabase, teamId, userId: userRes.user.id, teamName, teamShort } as const;
}

const isoDate = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

// GET ?date=YYYY-MM-DD → the saved briefing for that match (so a revisit needs no re-upload).
export async function GET(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  const date = isoDate(new URL(req.url).searchParams.get("date"));
  if (!date) return NextResponse.json({ ok: true, read: null });
  const { data } = await auth.supabase.from("match_report_reads")
    .select("read, source_name, model, updated_at").eq("team_id", auth.teamId).eq("match_date", date).maybeSingle();
  const row = data as { read?: unknown; source_name?: string | null; model?: string | null; updated_at?: string | null } | null;
  return NextResponse.json({ ok: true, read: row?.read ?? null, source: row?.source_name ?? null, savedAt: row?.updated_at ?? null });
}

const SYSTEM = `You are reading a football MATCH REPORT (PDF) for a head coach and writing a THOROUGH but plain-language briefing of what the report says about THIS one match. Be detailed: use everything relevant the report contains (lineups, substitutions with minutes, goals and their scorers/assists, cards, ratings, and any stats tables — possession, xG, shots, passing, duels, PPDA, etc.).

Hard rules:
- PERSPECTIVE: the user message names the coach's OWN club. Centre the briefing on that club ("we / our team"): headline, summary, wentWell, toImprove and keyPlayers are all about the coach's own team. The OTHER team in the title is the opponent (the "opponent" field is about them). Match the own club to the home OR the away side BY NAME — do NOT assume the home / first-named team is the coach's team. If the named club does not appear in the report, say so in the headline and brief neutrally.
- Use ONLY what is in the uploaded report. Never invent numbers, players, or events. If the report doesn't state something, omit it (use "" or []).
- DESCRIPTIVE: report what happened and what the document shows. No prediction, no selection/transfer advice, no training prescription.
- Plain language a non-analyst coach reads at a glance. Expand jargon in one word where useful (xG = chance quality; PPDA = pressing intensity).
- Name both teams explicitly. Attribute goals/assists to the named players and minutes where the report gives them.
- Write in the requested language ONLY.
- Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  headline: string (one sentence — the single most important read of the match),
  score: string (e.g. "Breidablik 1-3 Valur", or "" if not stated),
  competition: string (competition + round + date if stated, else ""),
  summary: string (4-6 sentences — a full overview of how the match went),
  phases: string (how the game flowed across the 90 — first half vs second half, momentum swings, when goals came; 2-4 sentences; "" if not derivable),
  keyMoments: string[] (chronological, 4-10 items — goals with scorer + minute, big chances, cards, subs that changed the game; prefix with the minute when stated, e.g. "39' Valur goal — D. Orri Gardarson"),
  statHighlights: Array<{ label: string, value: string }> (6-12 notable numbers the report actually shows — e.g. {label:"xG", value:"0.9 - 1.95"}, possession, shots, shots on target, passing accuracy, PPDA, duels won, corners; only include what the report contains),
  wentWell: string[] (3-6 short points — what the coach's OWN team (named in the user message) did well),
  toImprove: string[] (3-6 short points — problems / areas to improve),
  keyPlayers: Array<{ name: string, note: string }> (up to 6 standout players the report highlights, with a short why and their rating if given),
  tactical: string (formation, key substitutions and their effect, shape and how it changed — 2-4 sentences; "" if not in the report),
  opponent: string (what the opponent did well / how they created and scored — 2-4 sentences; "" if not in the report).`;

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI read unavailable (no API key configured)." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  const lang = String(form.get("lang") ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  const date = isoDate(form.get("date"));
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (!isPdf) return NextResponse.json({ ok: false, error: "Upload the match report as a PDF." }, { status: 400 });
  if (file.size > 30 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That PDF is over 30 MB — export a smaller match report." }, { status: 400 });

  const ownName = String(auth.teamName ?? "").trim();
  const ownShort = String(auth.teamShort ?? "").trim();
  const ownLine = ownName
    ? `The coach's OWN club is "${ownName}"${ownShort && ownShort !== ownName ? ` (also written "${ownShort}")` : ""}. Centre the briefing on ${ownName} — they are "our team"; the other team in the report is the opponent. Match ${ownName} to the home or away side by name; it may be either.`
    : `Centre the briefing on the team the report is clearly about; label the other as the opponent.`;

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const content = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
    { type: "text", text: `${ownLine}\nWrite the briefing in ${lang}. Read the attached match report and return ONLY the JSON object.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      // A qualitative read, not extraction — disable adaptive thinking so the budget goes to
      // the answer. (No `temperature`: claude-sonnet-5 rejects it as deprecated.)
      body: JSON.stringify({ model: MODEL, max_tokens: 4000, thinking: { type: "disabled" }, system: SYSTEM, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "AI request failed." }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json({ ok: false, error: `AI read failed (${res.status}). ${detail.slice(0, 200)}` }, { status: 502 });
  }

  const j = await res.json();
  let text = String(j?.content?.[0]?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  text = a >= 0 && b > a ? text.slice(a, b + 1) : text;
  let read: Record<string, unknown> | null = null;
  try { read = JSON.parse(text); } catch { read = null; }
  if (!read) return NextResponse.json({ ok: false, error: "The model didn't return a readable summary — try again." }, { status: 422 });

  // Persist against the match so a revisit needs no re-upload / re-run. Best-effort:
  // a save failure still returns the read the coach is looking at.
  let saved = false;
  if (date) {
    const { error } = await auth.supabase.from("match_report_reads").upsert({
      team_id: auth.teamId, match_date: date, read, source_name: file.name, model: MODEL,
      created_by: auth.userId, updated_at: new Date().toISOString(),
    }, { onConflict: "team_id,match_date" });
    saved = !error;
  }

  return NextResponse.json({ ok: true, read, model: MODEL, source: file.name, saved, date });
}
