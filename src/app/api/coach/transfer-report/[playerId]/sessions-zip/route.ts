/**
 * GET /api/coach/transfer-report/[playerId]/sessions-zip
 * Streams a ZIP of one .xlsx per session (Session summary + drill-by-drill), from the SAME
 * LoadDaily rows as the dossier plus the drill-level rows. Downloads as
 * "{lastname}-training-sessions-{season}.zip". Same coach/admin gate. Descriptive — no readiness.
 */

import { NextRequest, NextResponse } from "next/server";
import { authCoach, windowDaysFrom, loadTransferRawInput, loadDrillRows, asciiSlug } from "@/lib/micropulse/transferReport/loadData";
import { buildSessionsZip } from "@/lib/micropulse/transferReport/transferReportSessionsZip";

export const runtime = "nodejs";
export const maxDuration = 120;

const lastName = (name: string) => asciiSlug((name || "player").trim().split(/\s+/).pop() || "player") || "player";

export async function GET(req: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const auth = await authCoach(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const raw = await loadTransferRawInput(auth.teamId, playerId, windowDaysFrom(req));
  if ("error" in raw) return NextResponse.json({ error: raw.error }, { status: raw.status });

  const drills = await loadDrillRows(playerId, raw.start, raw.end);
  const buf = await buildSessionsZip(raw, drills);
  const fname = `${lastName(raw.identity.name)}-training-sessions-${raw.end.slice(0, 4)}.zip`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}
