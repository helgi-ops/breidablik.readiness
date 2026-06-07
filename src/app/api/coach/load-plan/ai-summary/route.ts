/**
 * /api/coach/load-plan/ai-summary — RETIRED.
 *
 * The Pre-Session Report's deterministic explanation now explains every number
 * directly (rules decide AND explain), so the AI narration layer was redundant
 * and has been removed from the UI. This endpoint is kept as an inert stub for
 * backward compatibility and always returns { summary: null }.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json({ ok: true, summary: null, retired: true });
}
