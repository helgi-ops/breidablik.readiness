/**
 * GET /api/coach/consent-status?teamId=…
 *
 * Coach visibility into privacy consent, so the SOFT on-open consent prompt has
 * a loop: the coach can see who still hasn't given data-processing consent and
 * follow up in person. For a confirmed minor (real DOB < 18) it also flags when
 * the only consent is a self-grant rather than a parent/guardian one.
 *
 * Reads the existing player_consents (no new store). Coach-scoped auth.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";

export const runtime = "nodejs";

interface PlayerRow { id: string; full_name: string | null; date_of_birth: string | null }
interface ConsentRow {
  player_id: string;
  granted_by_relationship: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

function confirmedMinor(dob: string | null): boolean {
  if (!dob) return false; // no DOB → can't confirm minor (adult self-consent path)
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 18);
  return new Date(dob) > cutoff;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamIdParam = url.searchParams.get("teamId") || undefined;

    const sb = getSupabaseAdmin();
    const { teamId } = await requireCoachAccessForTeam(sb, req, teamIdParam);
    if (!teamId) return NextResponse.json({ error: "Team context is required" }, { status: 400 });

    const { data: players } = await sb
      .from("players")
      .select("id, full_name, date_of_birth")
      .eq("team_id", teamId)
      .eq("is_active", true);
    const roster = (players ?? []) as PlayerRow[];
    const ids = roster.map((p) => p.id);

    const { data: consents } = ids.length
      ? await sb.from("player_consents")
          .select("player_id, granted_by_relationship, valid_from, valid_to")
          .eq("consent_type", "data_processing")
          .is("revoked_at", null)
          .in("player_id", ids)
      : { data: [] as ConsentRow[] };

    const now = Date.now();
    const activeByPlayer = new Map<string, ConsentRow>();
    for (const c of (consents ?? []) as ConsentRow[]) {
      const vf = c.valid_from ? new Date(c.valid_from).getTime() : 0;
      const vt = c.valid_to ? new Date(c.valid_to).getTime() : Number.POSITIVE_INFINITY;
      if (vf <= now && vt >= now) activeByPlayer.set(c.player_id, c);
    }

    const out = roster.map((p) => {
      const consent = activeByPlayer.get(p.id) ?? null;
      const minor = confirmedMinor(p.date_of_birth);
      return {
        playerId: p.id,
        fullName: p.full_name,
        isMinor: minor,
        hasConsent: consent != null,
        relationship: consent?.granted_by_relationship ?? null,
        // A confirmed minor whose only consent is a self-grant needs a guardian.
        needsGuardian: minor && consent != null && consent.granted_by_relationship === "self",
      };
    });
    out.sort((a, b) => Number(a.hasConsent) - Number(b.hasConsent) || String(a.fullName).localeCompare(String(b.fullName)));

    return NextResponse.json({
      teamId,
      players: out,
      summary: {
        total: out.length,
        consented: out.filter((p) => p.hasConsent).length,
        outstanding: out.filter((p) => !p.hasConsent).length,
        needsGuardian: out.filter((p) => p.needsGuardian).length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const code = /forbidden|access/i.test(msg) ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
