/**
 * AI extraction step for a clinical report. Reads the stored PDF, proposes a
 * structured extraction, and stores it as `extracted_json` with status
 * 'extracted'. This is a PROPOSAL only — nothing is written to injury/risk tables
 * here; a human confirms via the confirm route.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractClinicalReport } from "@/lib/clinical/extractReport";

export const runtime = "nodejs";

async function requireReport(req: NextRequest, id: string) {
  const sb: SupabaseClient = getSupabaseServer();
  const a = req.headers.get("authorization") ?? "";
  const token = a.startsWith("Bearer ") ? a.slice(7) : "";
  if (!token) return { error: "Missing auth", status: 401 } as const;
  const { data: userRes } = await sb.auth.getUser(token);
  if (!userRes?.user) return { error: "Invalid token", status: 401 } as const;
  const uid = userRes.user.id;
  const { data: prof } = await sb.from("profiles").select("role, team_id").eq("id", uid).maybeSingle();
  const p = (prof ?? {}) as { role?: string; team_id?: string | null };
  const role = String(p.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role)) return { error: "Coach role required", status: 403 } as const;

  const { data: report } = await sb.from("clinical_reports").select("id, team_id, player_id, player_name_raw, report_date, file_path, file_name").eq("id", id).maybeSingle();
  const r = report as { id: string; team_id: string; player_id: string | null; player_name_raw: string | null; report_date: string | null; file_path: string; file_name: string | null } | null;
  if (!r) return { error: "Report not found", status: 404 } as const;
  if (role !== "ADMIN" && p.team_id !== r.team_id) {
    const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", uid).eq("team_id", r.team_id).maybeSingle();
    if (!ct) return { error: "Forbidden", status: 403 } as const;
  }
  return { sb, uid, report: r } as const;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireReport(req, id);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { sb, report } = a;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI extraction not configured" }, { status: 503 });

  const { data: blob, error: dlErr } = await sb.storage.from("clinical-reports").download(report.file_path);
  if (dlErr || !blob) return NextResponse.json({ error: "Could not read the file" }, { status: 500 });
  const buffer = Buffer.from(await blob.arrayBuffer());
  const isPdf = (report.file_name ?? "").toLowerCase().endsWith(".pdf") || (blob.type || "").includes("pdf");

  let out;
  try {
    out = await extractClinicalReport({ apiKey, buffer, isPdf, mediaType: blob.type || "application/pdf" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI extraction failed";
    // A JSON parse failure surfaces as a 422 (unreadable), network as 502.
    const status = msg.startsWith("AI ") ? 502 : 422;
    return NextResponse.json({ error: msg }, { status });
  }

  const { extracted, rawText } = out;
  // Fill provenance fields from the extraction where the row doesn't have them yet.
  await sb.from("clinical_reports").update({
    extracted_json: extracted,
    raw_text: rawText || null,
    status: "extracted",
    report_date: report.report_date ?? extracted.report_date ?? null,
    player_name_raw: report.player_name_raw ?? extracted.player_name ?? null,
    clinician_name: extracted.clinician?.name ?? null,
    clinician_licence: extracted.clinician?.licence ?? null,
    clinic: extracted.clinician?.clinic ?? null,
    clinician_email: extracted.clinician?.email ?? null,
  }).eq("id", id);

  return NextResponse.json({ ok: true, extracted, status: "extracted" });
}
