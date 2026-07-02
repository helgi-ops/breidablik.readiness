/**
 * POST /api/coach/match-movement/narrative
 *
 * A detailed AI explanation of the movement (IMA driver) comparison the coach is
 * viewing. The client sends only the SELECTION (mode + which player / matches) —
 * never numbers. The server re-computes the fingerprints from Catapult data, so
 * the AI can only rephrase real figures. Labelled as AI in the UI; rules decide.
 *
 * Body: { lang?, mode: "norm"|"ab"|"squad", teamId?, playerId?, matchA?, matchB?, squadMatch?, squadMatchB? }
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { computeMatchMovement } from "@/lib/micropulse/matchMovement";
import type { MovementFingerprint } from "@/lib/micropulse/matchMovement/types";
import { movementDimensions } from "@/lib/micropulse/matchMovement/types";
import { buildComparisonFacts, buildSquadFacts, callMatchMovementAI, COACH_SYSTEM } from "@/lib/micropulse/matchMovement/narrative";

export const runtime = "nodejs";
export const maxDuration = 30;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Squad mean of each dimension across a set of fingerprints (nulls skipped). */
function meanFp(fps: MovementFingerprint[], keys: string[]): MovementFingerprint {
  const out: MovementFingerprint = {};
  for (const k of keys) {
    const vals = fps.map((f) => f[k]).filter((v): v is number => v != null);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: userRes, error: uErr } = await sb.auth.getUser(token);
    if (uErr || !userRes?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = userRes.user.id;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

    const body = (await req.json().catch(() => ({}))) as {
      lang?: string; mode?: string; teamId?: string;
      playerId?: string; matchA?: string; matchB?: string; squadMatch?: string; squadMatchB?: string;
    };
    const lang = body.lang === "IS" ? "Icelandic" : "English";
    const mode = body.mode === "ab" || body.mode === "squad" ? body.mode : "norm";

    // Resolve team the coach actually belongs to (else their profile team).
    let teamId = (body.teamId || "").trim() || null;
    if (teamId) {
      const { data: ct } = await sb.from("coach_teams").select("team_id").eq("coach_id", userId).eq("team_id", teamId).maybeSingle();
      if (!ct) teamId = null;
    }
    if (!teamId) {
      const { data: prof } = await sb.from("profiles").select("team_id").eq("id", userId).maybeSingle();
      teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
    }
    if (!teamId) return NextResponse.json({ error: "No team context" }, { status: 400 });

    const data = await computeMatchMovement({ teamId });
    if (data.rows.length === 0) return NextResponse.json({ error: "No match movement data yet" }, { status: 422 });
    const dimKeys = movementDimensions(data.variant).map((d) => d.key);

    let facts: unknown;

    if (mode === "squad") {
      const squadMatch = body.squadMatch || data.matchDates[data.matchDates.length - 1] || "";
      const rows = data.rows.filter((r) => r.match_date === squadMatch);
      if (rows.length === 0) return NextResponse.json({ error: "No players in that match" }, { status: 422 });
      const compareDate = body.squadMatchB && body.squadMatchB !== squadMatch ? body.squadMatchB : null;
      const rowsB = compareDate ? data.rows.filter((r) => r.match_date === compareDate) : [];
      facts = buildSquadFacts(
        fmtDate(squadMatch),
        rows.map((r) => ({ name: r.name, position: r.position, fingerprint: r.fingerprint })),
        rowsB.length > 0
          ? { label: fmtDate(compareDate!), meanA: meanFp(rows.map((r) => r.fingerprint), dimKeys), meanB: meanFp(rowsB.map((r) => r.fingerprint), dimKeys) }
          : null,
        data.variant,
      );
    } else {
      const playerId = body.playerId || data.players.find((p) => p.matches >= 1)?.player_id || data.players[0]?.player_id || "";
      const pRows = data.rows.filter((r) => r.player_id === playerId).sort((a, b) => b.match_date.localeCompare(a.match_date));
      if (pRows.length === 0) return NextResponse.json({ error: "No matches for that player" }, { status: 422 });
      const name = data.players.find((p) => p.player_id === playerId)?.name ?? "the player";

      const a = pRows.find((r) => r.match_date === body.matchA) ?? pRows[0];
      if (mode === "ab") {
        const b = pRows.find((r) => r.match_date === body.matchB) ?? pRows[1];
        if (!b) return NextResponse.json({ error: "Need two matches to compare" }, { status: 422 });
        facts = { player: name, ...buildComparisonFacts(
          { label: `${name} — ${fmtDate(a.match_date)}`, minutes: a.minutes, fingerprint: a.fingerprint, sub: a.sub },
          { label: `${name} — ${fmtDate(b.match_date)}`, minutes: b.minutes, fingerprint: b.fingerprint, sub: b.sub },
          data.variant,
        ) };
      } else {
        const norm = data.playerAverages[playerId];
        const subNorm = data.subAverages[playerId] ?? null;
        if (!norm) return NextResponse.json({ error: "No norm for that player" }, { status: 422 });
        const n = data.players.find((p) => p.player_id === playerId)?.matches ?? 0;
        facts = { player: name, ...buildComparisonFacts(
          { label: `${name} — this match (${fmtDate(a.match_date)})`, minutes: a.minutes, fingerprint: a.fingerprint, sub: a.sub },
          { label: `${name} — his usual (average of ${n} matches)`, fingerprint: norm, sub: subNorm },
          data.variant,
        ) };
      }
    }

    const narrative = await callMatchMovementAI({ apiKey, system: COACH_SYSTEM, facts, lang, audience: "coach" });
    return NextResponse.json({ ok: true, narrative, model: "claude-haiku-4-5-20251001" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
