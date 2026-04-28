export const runtime = "nodejs";

/**
 * /api/coach/external-load/upload
 *
 * Two-phase CSV upload for external load data (Catapult Cloud, WIMU, etc.):
 *   phase = "preview"  → parse CSV, return aggregated rows + unmapped athletes
 *                        + unmapped columns. NO database writes.
 *   phase = "commit"   → upsert mapped rows to player_external_load_daily
 *                        + persist new aliases + write audit row.
 *
 * Currently supports source = "catapult". Adding "wimu" is a column-catalog
 * swap (the API surface itself is generic).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseCatapultCsv } from "@/lib/integrations/catapult-csv/parser";
import type { CatapultMetricKey } from "@/lib/integrations/catapult-csv/catalog";
import type { CatapultCsvRow } from "@/lib/integrations/catapult-csv/parser";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function getCoachTeam(req: NextRequest, targetTeamId?: string | null) {
  const supabase = getSupabase();
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { error: "Vantar auðkenningu", status: 401 };

  const { data: userRes, error: uErr } = await supabase.auth.getUser(token);
  if (uErr || !userRes?.user) return { error: "Ógilt token", status: 401 };

  const userId = userRes.user.id;
  const { data: prof } = await supabase
    .from("profiles")
    .select("team_id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(prof?.role ?? "").toUpperCase();
  if (!["COACH", "ADMIN", "STAFF"].includes(role))
    return { error: "Aðeins staff getur gert þetta", status: 403 };

  const primaryTeamId = prof?.team_id as string | null;
  if (!primaryTeamId) return { error: "Coach er ekki tengdur liði", status: 400 };

  if (!targetTeamId || targetTeamId === primaryTeamId) {
    return { userId, teamId: primaryTeamId };
  }

  const { data: coachRow } = await supabase
    .from("coach_teams")
    .select("team_id")
    .eq("coach_id", userId)
    .eq("team_id", targetTeamId)
    .maybeSingle();
  if (!coachRow) return { error: "Þú hefur ekki aðgang að þessu liði", status: 403 };

  return { userId, teamId: targetTeamId };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  // accept European decimal separator: 1.234,56 → 1234.56
  const cleaned = v.replace(/\s/g, "").replace(/,/g, ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function int(v: string | undefined): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

/** Aggregate multiple rows for the same (athleteKey, date) by summing counts/distances and taking max for peaks */
function aggregateByAthleteAndDate(rows: CatapultCsvRow[]) {
  type Bucket = {
    athleteId: string | null;
    athleteName: string | null;
    date: string;
    accum: Record<string, number>;
    maxOf:  Record<string, number>;
    sessions: Set<string>;
  };
  const map = new Map<string, Bucket>();

  for (const r of rows) {
    if (!r.date || !(r.athleteName || r.athleteId)) continue;
    const key = `${r.athleteId ?? r.athleteName}|${r.date}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        athleteId: r.athleteId,
        athleteName: r.athleteName,
        date: r.date,
        accum: {},
        maxOf: {},
        sessions: new Set<string>(),
      };
      map.set(key, bucket);
    }
    if (r.sessionName) bucket.sessions.add(r.sessionName);

    // SUM these (counts, distances, energy)
    const SUM_FIELDS: CatapultMetricKey[] = [
      "totalDistance", "highSpeedDistance", "sprintDistance",
      "velocityBand1Distance", "velocityBand2Distance", "velocityBand3Distance",
      "velocityBand4Distance", "velocityBand5Distance", "velocityBand6Distance",
      "velocityBand6Efforts",
      "playerLoad",
      "imaAccelBand1", "imaAccelBand2", "imaAccelBand3",
      "imaDecelBand1", "imaDecelBand2", "imaDecelBand3",
      "imaFrBand1Strides", "imaFrBand2Strides", "imaFrBand3Strides", "imaFrBand4Strides",
      "imaFrBand5Strides", "imaFrBand6Strides", "imaFrBand7Strides", "imaFrBand8Strides",
      "hmld", "totalMetabolicEnergy",
      "durationMinutes",
    ];
    for (const f of SUM_FIELDS) {
      const v = num(r.raw[f]);
      if (v != null) bucket.accum[f] = (bucket.accum[f] ?? 0) + v;
    }

    // MAX these (peaks, rates that don't aggregate by sum)
    const MAX_FIELDS: CatapultMetricKey[] = [
      "maxVelocity", "avgVelocity", "maxHeartRate", "avgHeartRate",
      "metabolicPower", "playerLoadPerMinute", "distancePerMinute",
      "imaFrBand1Rate", "imaFrBand2Rate", "imaFrBand3Rate", "imaFrBand4Rate",
      "imaFrBand5Rate", "imaFrBand6Rate", "imaFrBand7Rate", "imaFrBand8Rate",
    ];
    for (const f of MAX_FIELDS) {
      const v = num(r.raw[f]);
      if (v != null) {
        bucket.maxOf[f] = bucket.maxOf[f] != null ? Math.max(bucket.maxOf[f], v) : v;
      }
    }
  }
  return Array.from(map.values());
}

type AggregatedRow = ReturnType<typeof aggregateByAthleteAndDate>[number];

/**
 * Map an aggregated CSV row to the player_external_load_daily column shape.
 * Only fields that the CSV provided values for are included.
 */
function aggregatedToDbRow(b: AggregatedRow, playerId: string, teamId: string) {
  const a = b.accum;
  const m = b.maxOf;
  const out: Record<string, unknown> = {
    player_id: playerId,
    team_id:   teamId,
    date:      b.date,
    source:    "catapult_csv",
    external_athlete_id: b.athleteId ?? null,
    activity_count: b.sessions.size || 1,

    tot_ds: a.totalDistance ?? null,
    hsr_distance_m: a.highSpeedDistance ?? null,

    velocity_band1_total_distance: a.velocityBand1Distance ?? null,
    velocity_band2_total_distance: a.velocityBand2Distance ?? null,
    velocity_band3_total_distance: a.velocityBand3Distance ?? null,
    velocity_band4_total_distance: a.velocityBand4Distance ?? null,
    velocity_band5_total_distance: a.velocityBand5Distance ?? null,
    velocity_band6_total_distance: a.velocityBand6Distance ?? null,
    velocity_band6_total_efforts:  a.velocityBand6Efforts ?? null,

    total_player_load:        a.playerLoad ?? null,
    player_load_per_minute:   m.playerLoadPerMinute ?? null,

    ima_band1_accel_count: a.imaAccelBand1 ?? null,
    ima_band2_accel_count: a.imaAccelBand2 ?? null,
    ima_band3_accel_count: a.imaAccelBand3 ?? null,
    ima_band1_decel_count: a.imaDecelBand1 ?? null,
    ima_band2_decel_count: a.imaDecelBand2 ?? null,
    ima_band3_decel_count: a.imaDecelBand3 ?? null,

    ima_fr_band1_stride_count: a.imaFrBand1Strides ?? null,
    ima_fr_band2_stride_count: a.imaFrBand2Strides ?? null,
    ima_fr_band3_stride_count: a.imaFrBand3Strides ?? null,
    ima_fr_band4_stride_count: a.imaFrBand4Strides ?? null,
    ima_fr_band5_stride_count: a.imaFrBand5Strides ?? null,
    ima_fr_band6_stride_count: a.imaFrBand6Strides ?? null,
    ima_fr_band7_stride_count: a.imaFrBand7Strides ?? null,
    ima_fr_band8_stride_count: a.imaFrBand8Strides ?? null,
    ima_fr_band1_avg_stride_rate: m.imaFrBand1Rate ?? null,
    ima_fr_band2_avg_stride_rate: m.imaFrBand2Rate ?? null,
    ima_fr_band3_avg_stride_rate: m.imaFrBand3Rate ?? null,
    ima_fr_band4_avg_stride_rate: m.imaFrBand4Rate ?? null,
    ima_fr_band5_avg_stride_rate: m.imaFrBand5Rate ?? null,
    ima_fr_band6_avg_stride_rate: m.imaFrBand6Rate ?? null,
    ima_fr_band7_avg_stride_rate: m.imaFrBand7Rate ?? null,
    ima_fr_band8_avg_stride_rate: m.imaFrBand8Rate ?? null,

    high_metabolic_load_distance_m: a.hmld ?? null,
    metabolic_power: m.metabolicPower ?? null,
    metabolic_energy_kj: a.totalMetabolicEnergy ?? null,

    max_vel: m.maxVelocity ?? null,
    avg_heart_rate: m.avgHeartRate ?? null,
    max_heart_rate: m.maxHeartRate ?? null,

    session_duration_minutes: a.durationMinutes ?? null,
  };
  // Strip nulls so partial uploads don't clobber existing data
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    if (v !== null) cleaned[k] = v;
  }
  // Always include the upsert key columns even if value is null/undefined
  cleaned.player_id = playerId;
  cleaned.team_id   = teamId;
  cleaned.date      = b.date;
  cleaned.source    = "catapult_csv";
  return cleaned;
}

// ── POST ──────────────────────────────────────────────────────────────────────

type PreviewBody = {
  phase: "preview";
  team_id?: string | null;
  source: "catapult";
  filename?: string;
  csv: string;
};

type CommitBody = {
  phase: "commit";
  team_id?: string | null;
  source: "catapult";
  filename?: string;
  csv: string;
  /** Map from source athlete identifier (id-or-name) → MicroPulse player_id */
  athleteMap: Record<string, string>;
  /** Optional manual column overrides (raw header → metric key) */
  columnOverrides?: Record<string, CatapultMetricKey>;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as PreviewBody | CommitBody;
  const requestedTeamId = (body.team_id ?? "").trim() || null;
  const auth = await getCoachTeam(req, requestedTeamId);
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  if (body.source !== "catapult") {
    return NextResponse.json({ ok: false, error: "Source ekki stuðningur ennþá. Reyndu 'catapult'." }, { status: 400 });
  }

  if (!body.csv || typeof body.csv !== "string") {
    return NextResponse.json({ ok: false, error: "CSV vantar." }, { status: 400 });
  }

  // Phase: PARSE (always done — both phases need parsed rows)
  const overrides = body.phase === "commit" && body.columnOverrides
    ? new Map<string, CatapultMetricKey>(Object.entries(body.columnOverrides))
    : undefined;
  const parsed = parseCatapultCsv(body.csv, overrides);
  const aggregated = aggregateByAthleteAndDate(parsed.rows);

  // Distinct source athletes in the CSV
  const sourceAthletes = new Map<string, { id: string | null; name: string | null }>();
  for (const r of aggregated) {
    const key = r.athleteId ?? r.athleteName ?? "";
    if (!key) continue;
    if (!sourceAthletes.has(key)) {
      sourceAthletes.set(key, { id: r.athleteId, name: r.athleteName });
    }
  }

  const supabase = getSupabase();

  // Auto-resolve aliases already in DB for this team
  const aliasKeys: string[] = [];
  for (const [, sa] of sourceAthletes) {
    if (sa.id)   aliasKeys.push(sa.id);
    if (sa.name) aliasKeys.push(sa.name);
  }
  const { data: existingAliases } = await supabase
    .from("external_athlete_aliases")
    .select("player_id, source_athlete_id, source_athlete_name")
    .eq("team_id", auth.teamId)
    .eq("source", "catapult");
  const idAliasMap = new Map<string, string>();
  const nameAliasMap = new Map<string, string>();
  for (const a of (existingAliases ?? []) as Array<{
    player_id: string; source_athlete_id: string | null; source_athlete_name: string | null;
  }>) {
    if (a.source_athlete_id) idAliasMap.set(a.source_athlete_id, a.player_id);
    if (a.source_athlete_name) nameAliasMap.set(a.source_athlete_name.toLowerCase(), a.player_id);
  }

  // Build per-athlete resolution: cached → manual map → unresolved
  const manualMap = body.phase === "commit" ? body.athleteMap ?? {} : {};
  const resolution = Array.from(sourceAthletes.entries()).map(([key, sa]) => {
    let playerId: string | null = null;
    let resolvedFrom: "cached_id" | "cached_name" | "manual" | null = null;
    if (sa.id && idAliasMap.has(sa.id))           { playerId = idAliasMap.get(sa.id)!;           resolvedFrom = "cached_id"; }
    else if (sa.name && nameAliasMap.has(sa.name.toLowerCase())) {
      playerId = nameAliasMap.get(sa.name.toLowerCase())!; resolvedFrom = "cached_name";
    }
    else if (manualMap[key]) { playerId = manualMap[key];   resolvedFrom = "manual"; }
    return { sourceKey: key, sourceId: sa.id, sourceName: sa.name, playerId, resolvedFrom };
  });

  // Date range covered
  const dates = Array.from(new Set(aggregated.map((r) => r.date))).sort();
  const dateRange = dates.length > 0
    ? { start: dates[0], end: dates[dates.length - 1], days: dates.length }
    : null;

  if (body.phase === "preview") {
    return NextResponse.json({
      ok: true,
      phase: "preview",
      delimiter: parsed.delimiter,
      headerCells: parsed.headerCells,
      matchedColumns: Array.from(parsed.matched.entries()).map(([idx, k]) => ({
        index: idx, header: parsed.headerCells[idx] ?? null, key: k,
      })),
      unmatchedColumns: Array.from(parsed.unmatched.entries()).map(([idx, h]) => ({ index: idx, header: h })),
      dateRange,
      aggregatedRows: aggregated.length,
      sourceAthletes: resolution,
    });
  }

  // ── COMMIT phase ──
  // Upsert any new manual mappings into external_athlete_aliases first
  const newAliases: Array<Record<string, unknown>> = [];
  for (const r of resolution) {
    if (r.playerId && r.resolvedFrom === "manual") {
      newAliases.push({
        team_id:             auth.teamId,
        player_id:           r.playerId,
        source:              "catapult",
        source_athlete_id:   r.sourceId,
        source_athlete_name: r.sourceName,
        created_by:          auth.userId,
      });
    }
  }
  if (newAliases.length > 0) {
    const { error: aliasErr } = await supabase
      .from("external_athlete_aliases")
      .upsert(newAliases as never, { onConflict: "team_id,source,source_athlete_id" });
    if (aliasErr) {
      return NextResponse.json({ ok: false, error: `Alias save: ${aliasErr.message}` }, { status: 500 });
    }
  }

  // Build resolved player_id lookup
  const finalResolved = new Map<string, string>();
  for (const r of resolution) if (r.playerId) finalResolved.set(r.sourceKey, r.playerId);

  // Build DB rows
  const dbRows = aggregated
    .map((b) => {
      const key = b.athleteId ?? b.athleteName ?? "";
      const playerId = finalResolved.get(key);
      if (!playerId) return null;
      return aggregatedToDbRow(b, playerId, auth.teamId);
    })
    .filter((x): x is Record<string, unknown> => x !== null);

  let committed = 0;
  if (dbRows.length > 0) {
    const { error: upsertErr } = await supabase
      .from("player_external_load_daily")
      .upsert(dbRows as never, { onConflict: "player_id,date,source" });
    if (upsertErr) {
      return NextResponse.json({ ok: false, error: `Upsert: ${upsertErr.message}` }, { status: 500 });
    }
    committed = dbRows.length;
  }

  // Audit row
  const unmappedCount = resolution.filter((r) => !r.playerId).length;
  const unmappedColumns = Array.from(parsed.unmatched.values());
  await supabase.from("external_load_uploads").insert({
    team_id:           auth.teamId,
    uploaded_by:       auth.userId,
    source:            "catapult",
    filename:          body.filename ?? null,
    date_range_start:  dateRange?.start ?? null,
    date_range_end:    dateRange?.end ?? null,
    rows_parsed:       aggregated.length,
    rows_committed:    committed,
    athletes_total:    resolution.length,
    athletes_unmapped: unmappedCount,
    unmapped_columns:  unmappedColumns,
  } as never);

  return NextResponse.json({
    ok: true,
    phase: "commit",
    rowsCommitted: committed,
    rowsParsed:    aggregated.length,
    athletesTotal: resolution.length,
    athletesUnmapped: unmappedCount,
    dateRange,
    unmappedColumns,
  });
}
