/**
 * /api/coach/transfer-report/[playerId]
 *
 * GET — assembles a departing player's performance dossier over a 3–4 month
 * window (default 120 days) for a receiving club. Loads via the shared loader
 * `loadTransferRawInput` (one source of truth, also used by the /xlsx and
 * /sessions.zip exports); the shaping is done by the pure engine
 * `buildTransferDossier`. Read-only, descriptive — it never touches the
 * readiness colour, the load target, or the daily decision.
 *
 * POST — { days, lang, ai:true } → a labelled AI summary written from the same
 * numbers (rules pick the facts; the model phrases them).
 */

import { NextRequest, NextResponse } from "next/server";
import { buildTransferDossier } from "@/lib/micropulse/transferReport";
import { buildTransferAiSummary } from "@/lib/micropulse/transferReport/ai";
import { authCoach, windowDaysFrom, consentOk, loadTransferRawInput } from "@/lib/micropulse/transferReport/loadData";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await loadTransferRawInput(auth.teamId, playerId, windowDaysFrom(req));
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });
  const dossier = buildTransferDossier(raw);
  const consent = await consentOk(playerId).catch(() => false);
  return NextResponse.json({ ok: true, dossier, consentOk: consent });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  if (!body?.ai) return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
  const days = Math.max(30, Math.min(365, Math.round(Number(body.days) || 120)));
  const lang = body.lang === "IS" ? "IS" : "EN";
  const raw = await loadTransferRawInput(auth.teamId, playerId, days);
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });
  const dossier = buildTransferDossier(raw);
  try {
    const ai = await buildTransferAiSummary(dossier, lang);
    return NextResponse.json({ ok: true, ai });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI error" }, { status: 500 });
  }
}
