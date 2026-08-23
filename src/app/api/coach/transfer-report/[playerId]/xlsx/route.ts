/**
 * GET /api/coach/transfer-report/[playerId]/xlsx
 * Streams the multi-sheet Excel performance export, built from the SAME loader as the dossier
 * (one source of truth). Same coach/admin auth gate as the report. Descriptive — no readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { authCoach, windowDaysFrom, loadTransferRawInput, asciiSlug } from "@/lib/micropulse/transferReport/loadData";
import { buildTransferXlsx } from "@/lib/micropulse/transferReport/transferReportXlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

const lastName = (name: string) => asciiSlug((name || "player").trim().split(/\s+/).pop() || "player") || "player";

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await loadTransferRawInput(auth.teamId, playerId, windowDaysFrom(req));
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });

  const buf = await buildTransferXlsx(raw);
  const fname = `${lastName(raw.identity.name)}-performance-data-${raw.end.slice(0, 4)}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
