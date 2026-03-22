import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getDateKeyInTimezone, getOperationalTimezone } from "@/lib/notifications/schedule";
import { requireCoachAccessForTeam } from "@/lib/session-rpe/server";
import {
  computeMechanicalLoad,
  type MechanicalLoadBand,
  type MechanicalLoadConfidence,
  type MechanicalLoadSourceRow,
  type ResidualMechanicalLoadBand,
} from "@/lib/micropulse/mechanicalLoad";

export const runtime = "nodejs";

type PlayerRow = {
  id: string;
  full_name: string | null;
  team_id: string | null;
  user_id: string | null;
};

type ExternalLoadRow = {
  player_id: string;
  date: string;
  decel_b2_3_tot_effs_gen2: number | null;
  tot_ds: number | null;
  decelerations: number | null;
  ima_decel: number | null;
  accel_b2_3_tot_effs_gen2: number | null;
  tot_as: number | null;
  accelerations: number | null;
  ima_accel: number | null;
  cod_events: number | null;
  ima_cod: number | null;
  ima_total: number | null;
  player_load_per_minute: number | null;
  impacts: number | null;
  source: string | null;
};

const BASE_SELECT =
  "player_id, date, decel_b2_3_tot_effs_gen2, tot_ds, decelerations, accel_b2_3_tot_effs_gen2, tot_as, accelerations, player_load_per_minute, source";

const IMA_SELECT =
  "ima_decel, ima_accel, cod_events, ima_cod, ima_total, impacts";

type ResponseRow = {
  player_id: string;
  player_name: string;
  date: string;
  mli: number | null;
  mli_band: MechanicalLoadBand | null;
  residual_mli: number | null;
  residual_band: ResidualMechanicalLoadBand | null;
  dss: number | null;
  ass: number | null;
  css: number | null;
  gds: number | null;
  confidence: MechanicalLoadConfidence;
  confidence_reason: string;
  flags: string[];
};

type ResponsePayload = {
  ok: boolean;
  error?: string;
  summary?: {
    avgMli: number | null;
    highCount: number;
    extremeCount: number;
    residualElevatedCount: number;
  };
  rows?: ResponseRow[];
  missingPlayers?: Array<{ player_id: string; player_name: string; status: "NO_CATAPULT_DATA" }>;
  rosterCount?: number;
};

function validDateKey(input: string | null): string | null {
  if (!input) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function dateMinusDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function roundNumber(value: number | null, decimals = 1): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function mapSourceRow(row: ExternalLoadRow): MechanicalLoadSourceRow {
  return {
    date: row.date,
    high_decels: row.decel_b2_3_tot_effs_gen2,
    total_decels: row.tot_ds ?? row.decelerations,
    ima_decel: row.ima_decel,
    high_accels: row.accel_b2_3_tot_effs_gen2,
    total_accels: row.tot_as ?? row.accelerations,
    ima_accel: row.ima_accel,
    cod_events: row.cod_events,
    ima_cod: row.ima_cod,
    ima_total: row.ima_total,
    playerload_per_min: row.player_load_per_minute,
    impacts: row.impacts,
  };
}

async function fetchExternalLoadRows(
  sb: ReturnType<typeof getSupabaseAdmin>,
  teamId: string | null,
  startDate: string,
  dateKey: string
): Promise<ExternalLoadRow[]> {
  const buildQuery = (selectClause: string) => {
    let query = sb
      .from("player_external_load_daily")
      .select(selectClause)
      .eq("source", "catapult")
      .gte("date", startDate)
      .lte("date", dateKey)
      .order("date", { ascending: true });
    if (teamId) query = query.eq("team_id", teamId);
    return query;
  };

  const primary = await buildQuery(`${BASE_SELECT}, ${IMA_SELECT}`);
  if (!primary.error) {
    return (((primary.data ?? []) as unknown) as ExternalLoadRow[]).map((row) => ({
      ...row,
      ima_decel: row.ima_decel ?? null,
      ima_accel: row.ima_accel ?? null,
      cod_events: row.cod_events ?? null,
      ima_cod: row.ima_cod ?? null,
      ima_total: row.ima_total ?? null,
      impacts: row.impacts ?? null,
    }));
  }

  const missingColumnError =
    primary.error.message.includes("column player_external_load_daily.") &&
    (
      primary.error.message.includes(".ima_decel") ||
      primary.error.message.includes(".ima_accel") ||
      primary.error.message.includes(".cod_events") ||
      primary.error.message.includes(".ima_cod") ||
      primary.error.message.includes(".ima_total") ||
      primary.error.message.includes(".impacts")
    );

  if (!missingColumnError) {
    throw new Error(primary.error.message);
  }

  const fallback = await buildQuery(BASE_SELECT);
  if (fallback.error) throw new Error(fallback.error.message);

  return ((((fallback.data ?? []) as unknown) as Array<Record<string, unknown>>)).map((row) => ({
    player_id: String(row.player_id),
    date: String(row.date),
    decel_b2_3_tot_effs_gen2: (row.decel_b2_3_tot_effs_gen2 as number | null) ?? null,
    tot_ds: (row.tot_ds as number | null) ?? null,
    decelerations: (row.decelerations as number | null) ?? null,
    ima_decel: null,
    accel_b2_3_tot_effs_gen2: (row.accel_b2_3_tot_effs_gen2 as number | null) ?? null,
    tot_as: (row.tot_as as number | null) ?? null,
    accelerations: (row.accelerations as number | null) ?? null,
    ima_accel: null,
    cod_events: null,
    ima_cod: null,
    ima_total: null,
    player_load_per_minute: (row.player_load_per_minute as number | null) ?? null,
    impacts: null,
    source: (row.source as string | null) ?? null,
  }));
}

function buildFlags(row: ReturnType<typeof computeMechanicalLoad>): string[] {
  if (!row) return [];
  const flags: string[] = [];
  if (row.decelSpikeFlag) flags.push("Decel spike");
  if (row.codSpikeFlag) flags.push("COD spike");
  if (row.denseMechanicalFlag) flags.push("Dense load");
  if (row.extremeMechanicalFlag) flags.push("Extreme");
  else if (row.highMechanicalFlag) flags.push("High");
  if (row.residualBand === "CAUTION" || row.residualBand === "HIGH") flags.push("Residual elevated");
  return flags;
}

export async function GET(req: Request) {
  try {
    const sb = getSupabaseAdmin();
    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") || "").trim() || null;
    const { teamId } = await requireCoachAccessForTeam(sb, req, requestedTeamId);

    const timeZone = getOperationalTimezone();
    const dateKey = validDateKey(url.searchParams.get("date")) ?? getDateKeyInTimezone(new Date(), timeZone);

    let rosterQuery = sb.from("players").select("id, full_name, team_id, user_id").not("user_id", "is", null);
    if (teamId) rosterQuery = rosterQuery.eq("team_id", teamId);
    const { data: rosterData, error: rosterErr } = await rosterQuery;
    if (rosterErr) return NextResponse.json({ ok: false, error: rosterErr.message }, { status: 500 });
    const roster = (rosterData ?? []) as PlayerRow[];
    const rosterById = new Map(roster.map((p) => [p.id, p]));

    const startDate = dateMinusDays(dateKey, 30);
    const rows = await fetchExternalLoadRows(sb, teamId, startDate, dateKey);
    const grouped = new Map<string, MechanicalLoadSourceRow[]>();
    for (const row of rows) {
      const mapped = mapSourceRow(row);
      const current = grouped.get(row.player_id) ?? [];
      current.push(mapped);
      grouped.set(row.player_id, current);
    }

    const computedRows: ResponseRow[] = [];
    for (const [playerId, playerRows] of grouped.entries()) {
      const historicalMli = new Map<string, number | null>();
      for (const row of playerRows) {
        const computed = computeMechanicalLoad(playerRows, row.date, historicalMli);
        if (!computed) continue;
        historicalMli.set(row.date, computed.mli);
        if (row.date !== dateKey) continue;
        computedRows.push({
          player_id: playerId,
          player_name: rosterById.get(playerId)?.full_name ?? "Unknown player",
          date: row.date,
          mli: computed.mli,
          mli_band: computed.mliBand,
          residual_mli: computed.residualMli,
          residual_band: computed.residualBand,
          dss: computed.dss,
          ass: computed.ass,
          css: computed.css,
          gds: computed.gds,
          confidence: computed.confidence,
          confidence_reason: computed.confidenceReason,
          flags: buildFlags(computed),
        });
      }
    }

    computedRows.sort((a, b) => (b.mli ?? -1) - (a.mli ?? -1) || a.player_name.localeCompare(b.player_name));

    const mliValues = computedRows.map((row) => row.mli).filter((value): value is number => typeof value === "number");
    const avgMli = mliValues.length ? roundNumber(mliValues.reduce((sum, value) => sum + value, 0) / mliValues.length, 1) : null;
    const highCount = computedRows.filter((row) => row.mli_band === "VERY_HIGH" || row.mli_band === "EXTREME").length;
    const extremeCount = computedRows.filter((row) => row.mli_band === "EXTREME").length;
    const residualElevatedCount = computedRows.filter(
      (row) => row.residual_band === "ELEVATED" || row.residual_band === "CAUTION" || row.residual_band === "HIGH"
    ).length;

    const rowSet = new Set(computedRows.map((row) => row.player_id));
    const missingPlayers = roster
      .filter((player) => !rowSet.has(player.id))
      .map((player) => ({
        player_id: player.id,
        player_name: player.full_name ?? "Unknown player",
        status: "NO_CATAPULT_DATA" as const,
      }));

    const payload: ResponsePayload = {
      ok: true,
      summary: {
        avgMli,
        highCount,
        extremeCount,
        residualElevatedCount,
      },
      rows: computedRows,
      missingPlayers,
      rosterCount: roster.length,
    };

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
