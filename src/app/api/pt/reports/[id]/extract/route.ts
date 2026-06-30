/**
 * /api/pt/reports/[id]/extract
 *
 * POST — run AI extraction on an uploaded report PDF: send the file straight to
 *        Claude (no separate PDF parser) and get back a STRUCTURED candidate of
 *        the tests/metrics it contains. Stored on the report as a PENDING
 *        candidate; NOT trusted until a coach confirms.
 * PUT  — { extracted } save the coach-CONFIRMED (optionally edited) structure.
 *
 * Coach-only (extracting/confirming performance test data is S&C territory).
 * v1 stores the confirmed structure on the report record; feeding it into the
 * canonical VALD result tables (raw_test_id FK) is a deeper follow-up.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { ingestConfirmedReportToVald, type ExtractedReport } from "@/lib/integrations/vald/ingestReport";
import { buildValdDailySnapshot } from "@/lib/micropulse/vald/snapshot";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-haiku-4-5-20251001";


async function requireCoachForReport(req: NextRequest, reportId: string) {
  const sb = getSupabase();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const role = String((prof as { role?: string } | null)?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;
  const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
  const { data: rep } = await sb.from("pt_client_reports").select("id, player_id, team_id, file_path, file_name").eq("id", reportId).maybeSingle();
  const report = rep as { id: string; player_id: string; team_id: string | null; file_path: string; file_name: string } | null;
  if (!report) return { error: "Report not found", status: 404 } as const;
  if (role !== "ADMIN" && teamId && report.team_id && report.team_id !== teamId) {
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", uid).eq("team_id", report.team_id).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, report } as const;
}

const EXTRACT_SYSTEM = `You extract structured data from a sports performance test report (e.g. VALD ForceDecks, NordBord, ForceFrame). Return ONLY JSON, no prose.

Schema:
{
  "athlete": string | null,
  "report_date": "YYYY-MM-DD" | null,
  "body_weight_kg": number | null,
  "tests": [
    {
      "product": "forcedecks" | "nordbord" | "forceframe" | "other",
      "test_type": string,            // e.g. "CMJ", "Abalakov", "IMTP", "Nordic", "Hip 60° Adduction"
      "date": "YYYY-MM-DD" | null,
      "metrics": [ { "label": string, "value": number, "unit": string } ],
      "left_n": number | null,        // left-side peak force (N) when applicable
      "right_n": number | null,       // right-side peak force (N) when applicable
      "asymmetry_percent": number | null,
      "asymmetry_side": "L" | "R" | null
    }
  ]
}

Rules: extract the MOST RECENT value for each metric unless the report clearly lists multiple dated rows (then include one test object per dated row). Use numbers without thousands separators. If a value is absent, omit that metric. Do not invent values.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireCoachForReport(req, id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, report } = a;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI extraction not configured" }, { status: 503 });

  // Download the file and base64 it for the document block.
  const { data: blob, error: dlErr } = await sb.storage.from("pt-reports").download(report.file_path);
  if (dlErr || !blob) return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
  const isPdf = report.file_name.toLowerCase().endsWith(".pdf") || (blob.type || "").includes("pdf");
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

  const content: Array<Record<string, unknown>> = [
    isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: blob.type || "image/png", data: base64 } },
    { type: "text", text: "Extract the test data as JSON per the schema. JSON only." },
  ];

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: EXTRACT_SYSTEM, messages: [{ role: "user", content }] }),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `AI ${res.status}: ${(await res.text()).slice(0, 200)}` }, { status: 502 });

  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let extracted: unknown;
  try { extracted = JSON.parse(cleaned); }
  catch { return NextResponse.json({ error: "Could not read structured data from the report" }, { status: 422 }); }

  await sb.from("pt_client_reports").update({ extracted, extracted_status: "pending" }).eq("id", id);
  return NextResponse.json({ ok: true, extracted, status: "pending" });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireCoachForReport(req, id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, report } = a;
  const body = await req.json().catch(() => ({}));
  const extracted = body?.extracted;
  if (extracted == null) return NextResponse.json({ error: "extracted required" }, { status: 400 });
  const { error } = await sb.from("pt_client_reports").update({ extracted, extracted_status: "confirmed" }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Confirmation is the coach's trust gate — feed the confirmed numbers into the
  // canonical VALD tables so they power ValdStatusCard / the daily snapshot /
  // injury-risk alerts, then rebuild today's snapshot so the change shows now.
  let valdIngest: Awaited<ReturnType<typeof ingestConfirmedReportToVald>> | null = null;
  try {
    const nowIso = new Date().toISOString();
    valdIngest = await ingestConfirmedReportToVald(
      sb,
      { id: report.id, player_id: report.player_id, team_id: report.team_id },
      extracted as ExtractedReport,
      nowIso,
    );
    if (valdIngest.written > 0 && report.team_id) {
      await buildValdDailySnapshot(report.team_id, report.player_id, nowIso.slice(0, 10), sb).catch(() => null);
    }
  } catch (e) {
    // Don't fail the confirm if the canonical write hiccups — the confirmed
    // data is already saved on the report; surface the issue for visibility.
    valdIngest = { written: 0, skipped: 0, byProduct: { forcedecks: 0, nordbord: 0, forceframe: 0 }, notes: [e instanceof Error ? e.message : "VALD ingest failed"] };
  }

  return NextResponse.json({ ok: true, status: "confirmed", vald: valdIngest });
}
