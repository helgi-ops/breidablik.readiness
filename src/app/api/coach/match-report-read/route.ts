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
  if (!(prof as { team_id?: string } | null)?.team_id) return { error: "Coach not linked to a team", status: 400 } as const;
  return { ok: true } as const;
}

const SYSTEM = `You are reading a football MATCH REPORT (PDF) for a head coach and writing a concise briefing of what the report says about THIS one match.

Hard rules:
- Use ONLY what is in the uploaded report. Never invent numbers, players, or events. If the report doesn't say something, omit it.
- DESCRIPTIVE: report what happened and what the document shows. No prediction, no selection/transfer advice, no training prescription.
- Plain language a non-analyst coach reads at a glance. Expand jargon in one word where useful.
- Name the team the report is written for as "us"/"we" only if it is clear which team the coach owns; otherwise name both teams.
- Write in the requested language ONLY.
- Return ONLY a JSON object (no markdown fence) with EXACTLY these keys:
  headline: string (one sentence — the single most important read of the match),
  score: string (e.g. "Breidablik 1-3 Valur", or "" if not stated),
  competition: string (competition + round/date if stated, else ""),
  summary: string (2-4 sentences — how the match went overall),
  wentWell: string[] (2-5 short bullet points, what the team did well),
  toImprove: string[] (2-5 short bullet points, problems/areas to improve),
  keyPlayers: Array<{ name: string, note: string }> (up to 5 standout players the report highlights, with a short why),
  tactical: string (formation, key substitutions and their effect, shape — 1-3 sentences; "" if not in the report),
  opponent: string (what the opponent did well / how they scored — 1-3 sentences; "" if not in the report).`;

export async function POST(req: NextRequest) {
  const auth = await getCoachTeam(req);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: "AI read unavailable (no API key configured)." }, { status: 503 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 }); }
  const file = form.get("file");
  const lang = String(form.get("lang") ?? "EN").toUpperCase() === "IS" ? "Icelandic" : "English";
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
  if (!isPdf) return NextResponse.json({ ok: false, error: "Upload the match report as a PDF." }, { status: 400 });
  if (file.size > 30 * 1024 * 1024) return NextResponse.json({ ok: false, error: "That PDF is over 30 MB — export a smaller match report." }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const content = [
    { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
    { type: "text", text: `Write the briefing in ${lang}. Read the attached match report and return ONLY the JSON object.` },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      // A qualitative read, not extraction — disable adaptive thinking so the budget goes to the answer.
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, temperature: 0.3, thinking: { type: "disabled" }, system: SYSTEM, messages: [{ role: "user", content }] }),
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

  return NextResponse.json({ ok: true, read, model: MODEL, source: file.name });
}
