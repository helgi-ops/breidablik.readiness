import { NextResponse } from "next/server";
import { getSupabaseServer as getAdminClient } from "@/lib/supabaseServer";
import { fetchCatapultAthletes, getConfigForTeam, getConfigFromEnv, setActiveCatapultConfig } from "@/lib/integrations/catapult/api";
import { mapCatapultAthleteToPlayer, upsertCatapultAthleteMapping } from "@/lib/integrations/catapult/mapAthletes";
import type { CatapultAthleteMapRecord } from "@/lib/integrations/catapult/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const DEFAULT_BASE_URL = "https://backend-eu.openfield.catapultsports.com";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}


type AuthProfile = { role: string; team_id: string | null };

async function requireCoachContext(req: Request): Promise<{ teamId: string }> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Error("Unauthorized");

  const sb = getAdminClient();
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes?.user?.id) throw new Error("Unauthorized");

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role, team_id")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);

  const profile = prof as AuthProfile | null;
  const role = String(profile?.role ?? "").toUpperCase();
  if (!(role === "COACH" || role === "ADMIN" || role === "STAFF")) throw new Error("Forbidden");
  if (!profile?.team_id) throw new Error("No team context");
  return { teamId: profile.team_id };
}

/**
 * GET /api/integrations/catapult/unmatched-athletes
 * Fetches Catapult athletes, runs matching, returns unmatched + matched lists
 * along with the team's player roster for manual matching.
 */
export async function GET(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);

    // Get Catapult config for this team. Fall back to the legacy env config
    // (mirrors daily-sync) so env-configured teams like Breiðablik work — but
    // ONLY when the env account actually belongs to THIS team, so a different
    // team can never fetch another club's athletes.
    let config = await getConfigForTeam(teamId);
    if (!config) {
      try {
        const envConfig = getConfigFromEnv();
        if (envConfig.teamId && envConfig.teamId === teamId) config = envConfig;
      } catch {
        // No env config available — fall through to the 400 below.
      }
    }
    if (!config) {
      return NextResponse.json({
        error: "Catapult er ekki tengt fyrir þetta lið. Settu upp credentials í Catapult uppsetningu.",
      }, { status: 400 });
    }

    // Set active config so fetchCatapultAthletes uses the right org
    setActiveCatapultConfig(config);
    let athletes;
    try {
      athletes = await fetchCatapultAthletes();
    } finally {
      setActiveCatapultConfig(null);
    }

    // Try to match each athlete
    const matched: Array<{
      catapultId: string;
      catapultName: string;
      catapultEmail: string | null;
      playerId: string;
      matchMethod: string;
      confidence: number;
    }> = [];

    const unmatched: Array<{
      catapultId: string;
      catapultName: string;
      catapultEmail: string | null;
    }> = [];

    for (const athlete of athletes) {
      const mapping = await mapCatapultAthleteToPlayer(athlete, { sourceTeamId: teamId });
      const fullName = [athlete.firstName, athlete.lastName].filter(Boolean).join(" ").trim();
      if (mapping) {
        matched.push({
          catapultId: athlete.id,
          catapultName: fullName || athlete.id,
          catapultEmail: athlete.email ?? null,
          playerId: mapping.micropulsePlayerId,
          matchMethod: mapping.matchMethod,
          confidence: mapping.confidence,
        });
      } else {
        unmatched.push({
          catapultId: athlete.id,
          catapultName: fullName || athlete.id,
          catapultEmail: athlete.email ?? null,
        });
      }
    }

    // Fetch team roster for manual matching dropdown
    const sb = getAdminClient();
    const { data: players } = await sb
      .from("players")
      .select("id, full_name")
      .eq("team_id", teamId)
      .eq("is_active", true)
      .order("full_name");

    const roster = ((players ?? []) as Array<{ id: string; full_name: string | null }>).map(p => ({
      id: p.id,
      name: p.full_name ?? "(nafnlaus)",
    }));

    return NextResponse.json({
      teamId,
      totalAthletes: athletes.length,
      matched,
      unmatched,
      roster,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch athletes";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/**
 * POST /api/integrations/catapult/unmatched-athletes
 * Body: { catapultId, catapultName, catapultEmail?, playerId }
 * Saves a manual mapping.
 */
export async function POST(req: Request) {
  try {
    const { teamId } = await requireCoachContext(req);
    const body = await req.json();

    const catapultId = String(body.catapultId ?? "").trim();
    const playerId = String(body.playerId ?? "").trim();
    const catapultName = String(body.catapultName ?? "").trim() || null;
    const catapultEmail = body.catapultEmail ? String(body.catapultEmail).trim() : null;

    if (!catapultId || !playerId) {
      return NextResponse.json({ error: "catapultId and playerId are required." }, { status: 400 });
    }

    const record: CatapultAthleteMapRecord = {
      catapultAthleteId: catapultId,
      micropulsePlayerId: playerId,
      matchMethod: "manual",
      confidence: 1.0,
      catapultAthleteName: catapultName,
      catapultEmail: catapultEmail,
      sourceTeamId: teamId,
    };

    await upsertCatapultAthleteMapping(record);

    return NextResponse.json({ ok: true, mapping: record });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save mapping";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
