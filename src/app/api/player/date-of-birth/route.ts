/**
 * GET/POST /api/player/date-of-birth — the player's own DOB, for the consent gate.
 *
 * Why an endpoint and not a direct write: `players` has no RLS policy letting a
 * player update their own row (only coach/admin do), and adding one would be
 * wrong — Postgres RLS is ROW-scoped, not column-scoped, so a self-update policy
 * would also let a player change team_id, is_active, position… This route is the
 * column scope: it writes date_of_birth and nothing else, for the authenticated
 * player and no one else.
 *
 * SET-IF-NULL: a player may fill in a missing DOB, but not overwrite one that
 * exists — otherwise a minor could "correct" themselves into adulthood and walk
 * straight past the guardian gate this field exists to trigger. Corrections go
 * through a coach/admin, who already have update rights.
 *
 * DOB is sensitive: it is never logged, never put in a URL or query string, and
 * the GET returns the DERIVED age/minor flag rather than the date itself.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { requireAuthedPlayerId } from "@/lib/session-rpe/server";
import { ageYears, isMinor, isPlausibleDob } from "@/lib/legal/age";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the consent gate needs to know — the derived facts, not the raw date. */
export interface DobStatus {
  /** true = we have a usable DOB on file. */
  known: boolean;
  /** Whole years, or null when unknown. */
  age: number | null;
  /** true | false | null — null means UNKNOWN, which is not "adult". */
  isMinor: boolean | null;
}

async function readStatus(sb: ReturnType<typeof getSupabaseAdmin>, playerId: string): Promise<DobStatus> {
  const { data } = await sb.from("players").select("date_of_birth").eq("id", playerId).maybeSingle();
  const dob = (data as { date_of_birth?: string | null } | null)?.date_of_birth ?? null;
  return { known: dob != null, age: ageYears(dob), isMinor: isMinor(dob) };
}

export async function GET(req: Request) {
  const sb = getSupabaseAdmin();
  try {
    const { playerId } = await requireAuthedPlayerId(sb, req);
    return NextResponse.json(await readStatus(sb, playerId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: Request) {
  const sb = getSupabaseAdmin();
  let playerId: string;
  try {
    ({ playerId } = await requireAuthedPlayerId(sb, req));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { dateOfBirth?: string };
    const dob = String(body.dateOfBirth ?? "").slice(0, 10);
    if (!ISO_DATE.test(dob) || !isPlausibleDob(dob)) {
      // Deliberately does not echo the value back — it's sensitive.
      return NextResponse.json({ error: "invalid_date_of_birth" }, { status: 400 });
    }

    const { data: existing } = await sb
      .from("players").select("date_of_birth").eq("id", playerId).maybeSingle();
    const current = (existing as { date_of_birth?: string | null } | null)?.date_of_birth ?? null;
    if (current != null) {
      // Already on file — a change must come from a coach/admin, not from the
      // person the age gate is about.
      return NextResponse.json(
        { error: "already_set", ...(await readStatus(sb, playerId)) },
        { status: 409 },
      );
    }

    const { error } = await sb.from("players").update({ date_of_birth: dob }).eq("id", playerId);
    if (error) throw new Error(error.message);

    return NextResponse.json(await readStatus(sb, playerId));
  } catch {
    return NextResponse.json({ error: "could_not_save" }, { status: 400 });
  }
}
