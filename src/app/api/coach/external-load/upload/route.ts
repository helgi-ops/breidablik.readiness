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
import { getSupabaseServer as getSupabase } from "@/lib/supabaseServer";
import { parseCatapultCsv } from "@/lib/integrations/catapult-csv/parser";
import type { CatapultMetricKey } from "@/lib/integrations/catapult-csv/catalog";
import type { CatapultCsvRow } from "@/lib/integrations/catapult-csv/parser";


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

/**
 * Pre-aggregation dedupe — Activity Report exports include both a canonical
 * session-total row (periodName = "Session", periodNumber 0) AND a duplicate
 * "Auto Created Period" row with identical values. Summing them doubles every
 * count/distance for every athlete. When a canonical Session row exists for
 * a given (athlete, date), drop the auto-created/numbered-period duplicates.
 *
 * Timeline-format exports don't have this duplication and survive untouched
 * because none of their rows match the "Session" periodName.
 */
function dedupeAutoCreatedPeriods(rows: CatapultCsvRow[]): CatapultCsvRow[] {
  // Group by (athlete, date), then check whether a canonical Session row exists.
  const groupKey = (r: CatapultCsvRow) =>
    `${r.athleteId ?? r.athleteName ?? ""}|${r.date ?? ""}`;
  const groups = new Map<string, CatapultCsvRow[]>();
  for (const r of rows) {
    const list = groups.get(groupKey(r)) ?? [];
    list.push(r);
    groups.set(groupKey(r), list);
  }
  const out: CatapultCsvRow[] = [];
  for (const list of groups.values()) {
    const hasSession = list.some(
      (r) => (r.periodName ?? "").trim().toLowerCase() === "session",
    );
    if (hasSession) {
      // Keep only the canonical Session row(s); drop "Auto Created Period"
      // and any other numbered sub-periods that are duplicates of the total.
      out.push(...list.filter(
        (r) => (r.periodName ?? "").trim().toLowerCase() === "session",
      ));
    } else {
      // No Session-total row → must aggregate from sub-periods.
      out.push(...list);
    }
  }
  return out;
}

/** Aggregate multiple rows for the same (athleteKey, date) by summing counts/distances and taking max for peaks */
function aggregateByAthleteAndDate(rows: CatapultCsvRow[]) {
  type Bucket = {
    athleteId: string | null;
    athleteName: string | null;
    date: string;
    accum: Record<string, number>;
    maxOf:  Record<string, number>;
    firstStr: Record<string, string>;
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
        firstStr: {},
        sessions: new Set<string>(),
      };
      map.set(key, bucket);
    }
    if (r.sessionName) bucket.sessions.add(r.sessionName);

    // SUM these (counts, distances, energy)
    const SUM_FIELDS: CatapultMetricKey[] = [
      "totalDistance", "highSpeedDistance", "sprintDistance",
      "highSpeedEfforts", "sprintEfforts",
      "velocityBand1Distance", "velocityBand2Distance", "velocityBand3Distance",
      "velocityBand4Distance", "velocityBand5Distance", "velocityBand6Distance",
      "velocityBand6Efforts",
      "playerLoad",
      "totalAccelerations", "totalDecelerations",
      "accelB23Efforts", "decelB23Efforts", "accelDecelEfforts",
      "imaAccelBand1", "imaAccelBand2", "imaAccelBand3",
      "imaDecelBand1", "imaDecelBand2", "imaDecelBand3",
      "imaFrBand1Strides", "imaFrBand2Strides", "imaFrBand3Strides", "imaFrBand4Strides",
      "imaFrBand5Strides", "imaFrBand6Strides", "imaFrBand7Strides", "imaFrBand8Strides",
      "imaFrBand58Distance",
      "imaFrBand5Distance", "imaFrBand6Distance", "imaFrBand7Distance", "imaFrBand8Distance",
      "imaCodLeftHigh", "imaCodLeftMedium", "imaCodLeftLow",
      "imaCodRightHigh", "imaCodRightMedium", "imaCodRightLow",
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
      "maxAcceleration", "maxDeceleration",
      "metabolicPower", "playerLoadPerMinute", "distancePerMinute",
      "imaFrBand1Rate", "imaFrBand2Rate", "imaFrBand3Rate", "imaFrBand4Rate",
      "imaFrBand5Rate", "imaFrBand6Rate", "imaFrBand7Rate", "imaFrBand8Rate",
    ];
    for (const f of MAX_FIELDS) {
      const v = num(r.raw[f]);
      if (v != null) {
        // Max-of-magnitude: deceleration usually arrives as a negative number.
        const mag = (f === "maxDeceleration") ? Math.abs(v) : v;
        bucket.maxOf[f] = bucket.maxOf[f] != null ? Math.max(bucket.maxOf[f], mag) : mag;
      }
    }

    // STRING-FIRST: take the first non-empty value across periods (mdDay rarely varies within a day)
    const STRING_FIELDS: CatapultMetricKey[] = ["mdDayLabel"];
    for (const f of STRING_FIELDS) {
      const v = (r.raw[f] ?? "").trim();
      if (v && !bucket.firstStr[f]) bucket.firstStr[f] = v;
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
  const s = b.firstStr;

  // velocity_band6_total_efforts comes from either the explicit `Sprint Efforts`
  // column (preferred — that's the canonical Catapult Gen 2 sprint count) or
  // the legacy `Velocity Band 6 Effort Count` column. Fall back order matters
  // because some CSV templates have both and the Sprint Efforts variant is
  // typically the higher-fidelity one.
  const sprintEffortsCount = a.sprintEfforts ?? a.velocityBand6Efforts ?? null;
  const hsrEffortsCount    = a.highSpeedEfforts ?? null;

  const out: Record<string, unknown> = {
    player_id: playerId,
    team_id:   teamId,
    date:      b.date,
    // source MUST equal "catapult" — every downstream widget filters
    // player_external_load_daily by source='catapult' (Squad Load,
    // Quadrant, Indoor Briefing, McBurnie engine, …). A separate
    // value like "catapult_csv" makes the rows invisible everywhere.
    // Provenance lives in external_load_uploads (filename, uploader,
    // date_range) which is queryable separately for audit purposes.
    source:    "catapult",
    external_athlete_id: b.athleteId ?? null,
    activity_count: b.sessions.size || 1,

    // Volume — actual schema column names (verified against Supabase information_schema):
    //   high_speed_distance, sprint_distance, hir_dist, total_distance.
    //   Velocity bands 1–4 distance columns do NOT exist; only 5 & 6.
    total_distance:      a.totalDistance ?? null,
    high_speed_distance: a.highSpeedDistance ?? null,
    sprint_distance:     a.sprintDistance ?? null,

    velocity_band5_total_distance: a.velocityBand5Distance ?? null,
    velocity_band6_total_distance: a.velocityBand6Distance ?? null,

    // Effort counts (Gen 2 schema — what the API integration writes too)
    velocity_band5_total_efforts_gen2: hsrEffortsCount,
    velocity_band6_total_efforts_gen2: sprintEffortsCount,

    // Accel/Decel totals & B2-3 efforts (CSV-side counterpart to API integration)
    tot_as: a.totalAccelerations ?? null,
    tot_ds: a.totalDecelerations ?? null,
    accel_b2_3_tot_effs_gen2: a.accelB23Efforts ?? null,
    decel_b2_3_tot_effs_gen2: a.decelB23Efforts ?? null,
    accel_decel_efforts: a.accelDecelEfforts ?? null,
    max_acceleration:    m.maxAcceleration ?? null,
    max_deceleration:    m.maxDeceleration ?? null,

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
    ima_fr_band5_total_distance: a.imaFrBand5Distance ?? null,
    ima_fr_band6_total_distance: a.imaFrBand6Distance ?? null,
    ima_fr_band7_total_distance: a.imaFrBand7Distance ?? null,
    ima_fr_band8_total_distance: a.imaFrBand8Distance ?? null,
    // Total = explicit combined column if present, else the sum of the per-band
    // distances (so the total stays consistent however the report is exported).
    ima_fr_band58_total_distance:
      a.imaFrBand58Distance ??
      (a.imaFrBand5Distance != null || a.imaFrBand6Distance != null ||
       a.imaFrBand7Distance != null || a.imaFrBand8Distance != null
        ? (a.imaFrBand5Distance ?? 0) + (a.imaFrBand6Distance ?? 0) +
          (a.imaFrBand7Distance ?? 0) + (a.imaFrBand8Distance ?? 0)
        : null),
    ima_fr_band1_avg_stride_rate: m.imaFrBand1Rate ?? null,
    ima_fr_band2_avg_stride_rate: m.imaFrBand2Rate ?? null,
    ima_fr_band3_avg_stride_rate: m.imaFrBand3Rate ?? null,
    ima_fr_band4_avg_stride_rate: m.imaFrBand4Rate ?? null,
    ima_fr_band5_avg_stride_rate: m.imaFrBand5Rate ?? null,
    ima_fr_band6_avg_stride_rate: m.imaFrBand6Rate ?? null,
    ima_fr_band7_avg_stride_rate: m.imaFrBand7Rate ?? null,
    ima_fr_band8_avg_stride_rate: m.imaFrBand8Rate ?? null,

    // L/R IMA Change of Direction (Stride Intelligence asymmetry)
    ima_cod_left_high:    a.imaCodLeftHigh    ?? null,
    ima_cod_left_medium:  a.imaCodLeftMedium  ?? null,
    ima_cod_left_low:     a.imaCodLeftLow     ?? null,
    ima_cod_right_high:   a.imaCodRightHigh   ?? null,
    ima_cod_right_medium: a.imaCodRightMedium ?? null,
    ima_cod_right_low:    a.imaCodRightLow    ?? null,

    high_metabolic_load_distance_m: a.hmld ?? null,
    metabolic_power: m.metabolicPower ?? null,
    metabolic_energy_kj: a.totalMetabolicEnergy ?? null,

    // Top speed: write BOTH columns. Coach surfaces (player-game-report,
    // position-comparison, load-verdict…) read `max_velocity`; the CSV path
    // historically only wrote `max_vel`, so Core/Lite teams showed 0% top speed
    // even though it was captured. Both are km/h; read-sites clamp >45 glitches.
    max_vel: m.maxVelocity ?? null,
    max_velocity: m.maxVelocity ?? null,
    avg_heart_rate: m.avgHeartRate ?? null,
    max_heart_rate: m.maxHeartRate ?? null,

    session_duration_minutes: a.durationMinutes ?? null,

    md_day_label: s.mdDayLabel ?? null,
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
  cleaned.source    = "catapult";
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
  /** Optional ISO YYYY-MM-DD that overrides ALL row dates in this upload.
   *  Use when the parsed CSV date is wrong — typically because Catapult
   *  Activity Report exports stamp the EXPORT date in the preamble (not
   *  the actual session date). The coach picks the real session date on
   *  the upload UI and we apply it to every aggregated row before upsert. */
  dateOverride?: string | null;
  /** When true, this upload IS a match: also create match_player_minutes rows
   *  (minutes derived from the CSV) so TLYP / post-match surfaces recognise the
   *  day as a match. Lets Core/Lite clubs (no API match feed) land a full match
   *  from one CSV — no separate minutes entry. */
  isMatch?: boolean;
  /** Match length in minutes for the appearances created when isMatch is true
   *  (the CSV has no reliable playing time). Defaults to 90. */
  matchMinutes?: number;
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
  // Drop "Auto Created Period" duplicate rows before summing — see comment
  // on dedupeAutoCreatedPeriods. Otherwise every count/distance is doubled.
  const dedupedRows = dedupeAutoCreatedPeriods(parsed.rows);
  const aggregated = aggregateByAthleteAndDate(dedupedRows);

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

  // Apply optional date override BEFORE building DB rows. Validates strict
  // ISO YYYY-MM-DD so we never write garbage like "yesterday" into the
  // primary key column.
  const overrideDate = body.phase === "commit" && typeof body.dateOverride === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dateOverride)
    ? body.dateOverride
    : null;

  // Build DB rows
  const dbRows = aggregated
    .map((b) => {
      const key = b.athleteId ?? b.athleteName ?? "";
      const playerId = finalResolved.get(key);
      if (!playerId) return null;
      const row = aggregatedToDbRow(b, playerId, auth.teamId);
      if (overrideDate) row.date = overrideDate;
      return row;
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

  // ── Optional: this upload IS a match → populate match_player_minutes so TLYP
  // and the post-match surfaces recognise it. The OpenField match CSV carries NO
  // reliable playing time (its "Duration" is pod-on time — warmup→cooldown, often
  // hours), so we use a coach-supplied match length (default 90) for every player
  // who actually took part. Participation is inferred from match-day load
  // (Player Load ≥ MATCH_MIN_LOAD) so a pod-off / DNP / unused keeper doesn't get
  // a phantom 90-minute appearance. Subs are fine-tuned on the match-minutes page.
  // Conflict on (player_id, match_date) so a re-upload updates, never duplicates.
  const MATCH_MIN_LOAD = 150; // Player Load floor to count as "played" (real players ≫ this; pod-off ≈ 17–55)
  let matchMinutesUpserted = 0;
  if (body.phase === "commit" && body.isMatch) {
    const minutes = typeof body.matchMinutes === "number" && body.matchMinutes > 0 ? Math.round(body.matchMinutes) : 90;
    const minutesRows = aggregated
      .map((b) => {
        const key = b.athleteId ?? b.athleteName ?? "";
        const playerId = finalResolved.get(key);
        const matchDate = overrideDate ?? b.date;
        const tpl = b.accum.playerLoad ?? 0;
        if (!playerId || !matchDate || tpl < MATCH_MIN_LOAD) return null;
        return { player_id: playerId, team_id: auth.teamId, match_date: matchDate, minutes_played: minutes, is_dnp: false };
      })
      .filter((x): x is { player_id: string; team_id: string; match_date: string; minutes_played: number; is_dnp: boolean } => x !== null);
    if (minutesRows.length > 0) {
      const { error: mmErr } = await supabase
        .from("match_player_minutes")
        .upsert(minutesRows as never, { onConflict: "player_id,match_date" });
      if (mmErr) {
        return NextResponse.json({ ok: false, error: `Match minutes: ${mmErr.message}` }, { status: 500 });
      }
      matchMinutesUpserted = minutesRows.length;
    }
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
    matchMinutesUpserted,
    athletesUnmapped: unmappedCount,
    dateRange,
    unmappedColumns,
  });
}
