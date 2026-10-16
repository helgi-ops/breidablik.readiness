/**
 * Catapult OpenField per-player drill CSV — national-team / away-camp load.
 *
 * When a player is called up to a federation camp their club pod stays home, so
 * their MicroPulse load timeline goes blank. The federation sends a Catapult
 * OpenField export: ONE player per file, ONE row per drill. This module parses it,
 * aggregates the drills into daily rows, and maps each day to a
 * `player_external_load_daily` upsert object carrying the player's REAL camp load.
 *
 * Distinct from `catapult-csv/parser.ts` (the Activity-Report format with a
 * metadata preamble + human-readable headers). This one is the stable camelCase
 * per-drill export, so we read columns by their exact header names.
 *
 * Pure / IO-free / serialisable. Boundary: the rows feed the load/ACWR timeline
 * like any real session; they never set the readiness colour.
 */

export type OpenFieldDrillRow = {
  playerDisplayName: string;
  /** ISO YYYY-MM-DD (parsed from DD/MM/YYYY). */
  date: string;
  sessionType: string;
  drillTitle: string;
  minutes: number;
  distanceTotal: number;
  distanceZ5: number;
  distanceZ6: number;
  highSpeedRunning: number;
  maxSpeed: number;
  accelerations: number;
  decelerations: number;
  position: string;
};

export type OpenFieldParseResult = {
  athleteName: string | null;
  position: string | null;
  drills: OpenFieldDrillRow[];
  rowCount: number;
  headerOk: boolean;
  /** Required header columns that were missing (headerOk === false when non-empty). */
  missingColumns: string[];
};

export type OpenFieldDay = {
  /** ISO YYYY-MM-DD. */
  date: string;
  mdDayLabel: string | null;
  drillCount: number;
  totalDistance: number;
  highSpeedDistance: number;
  distanceZ5: number;
  /** Z6 (> ~25 km/h) — the sprint band. */
  distanceZ6: number;
  accelerations: number;
  decelerations: number;
  minutes: number;
  /** Peak across the day's drills — MAX, never summed. */
  maxSpeed: number;
};

const REQUIRED = [
  "playerDisplayName", "sessionDate", "sessionType", "drillTitle", "totalTime",
  "distanceTotal", "distanceZ5Abs", "distanceZ6Abs", "highSpeedRunningAbs",
  "maxSpeed", "accelerationsAbs", "decelerationsAbs",
] as const;

const num = (v: string | undefined): number => {
  if (v == null) return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
};

/** DD/MM/YYYY → ISO YYYY-MM-DD. Always European (the federation export is never US). */
export function parseEuroDate(value: string | undefined): string | null {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Tolerate an ISO value if one ever appears.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** "HH:MM:SS" (or "MM:SS") → minutes. */
export function hmsToMinutes(value: string | undefined): number {
  if (!value) return 0;
  const parts = String(value).trim().split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return Number.isFinite(parts[0]) ? parts[0] : 0;
}

/** Catapult `sessionType` → MD tag. "Match Day -2"→"MD-2", "Match Day +1"→"MD+1", "Match Day"→"MD". */
export function sessionTypeToMd(sessionType: string | undefined): string | null {
  if (!sessionType) return null;
  const s = String(sessionType).trim();
  const m = s.match(/match\s*day\s*([+-]\s*\d+)?/i);
  if (!m) return null;
  if (!m[1]) return "MD";
  return `MD${m[1].replace(/\s+/g, "")}`;
}

/** Quote-aware CSV line split (handles "" escapes), trimming each cell. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { buf += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(buf); buf = "";
    } else buf += ch;
  }
  out.push(buf);
  return out.map((c) => c.trim());
}

export function parseOpenFieldPlayerCsv(csvText: string): OpenFieldParseResult {
  const text = csvText.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { athleteName: null, position: null, drills: [], rowCount: 0, headerOk: false, missingColumns: [...REQUIRED] };
  }
  const header = splitCsvLine(lines[0]);
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { if (h) idx[h] = i; });
  const missingColumns = REQUIRED.filter((c) => !(c in idx));
  const headerOk = missingColumns.length === 0;

  const drills: OpenFieldDrillRow[] = [];
  let athleteName: string | null = null;
  let position: string | null = null;

  if (headerOk) {
    const cell = (cols: string[], name: string): string => cols[idx[name]] ?? "";
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      const date = parseEuroDate(cell(cols, "sessionDate"));
      if (!date) continue; // skip blank / malformed rows
      const name = cell(cols, "playerDisplayName").trim();
      if (name && !athleteName) athleteName = name;
      const pos = cell(cols, "playerPrimaryPosition")?.trim() || "";
      if (pos && !position) position = pos;
      drills.push({
        playerDisplayName: name,
        date,
        sessionType: cell(cols, "sessionType"),
        drillTitle: cell(cols, "drillTitle"),
        minutes: hmsToMinutes(cell(cols, "totalTime")),
        distanceTotal: num(cell(cols, "distanceTotal")),
        distanceZ5: num(cell(cols, "distanceZ5Abs")),
        distanceZ6: num(cell(cols, "distanceZ6Abs")),
        highSpeedRunning: num(cell(cols, "highSpeedRunningAbs")),
        maxSpeed: num(cell(cols, "maxSpeed")),
        accelerations: num(cell(cols, "accelerationsAbs")),
        decelerations: num(cell(cols, "decelerationsAbs")),
        position: pos,
      });
    }
  }

  return { athleteName, position, drills, rowCount: drills.length, headerOk, missingColumns };
}

/** Aggregate per-drill rows into one row per calendar day: Σ volume/counts/minutes, MAX speed. */
export function aggregateToDays(drills: OpenFieldDrillRow[]): OpenFieldDay[] {
  const byDate = new Map<string, OpenFieldDay>();
  for (const d of drills) {
    let day = byDate.get(d.date);
    if (!day) {
      day = {
        date: d.date, mdDayLabel: sessionTypeToMd(d.sessionType), drillCount: 0,
        totalDistance: 0, highSpeedDistance: 0, distanceZ5: 0, distanceZ6: 0,
        accelerations: 0, decelerations: 0, minutes: 0, maxSpeed: 0,
      };
      byDate.set(d.date, day);
    }
    day.drillCount += 1;
    day.totalDistance += d.distanceTotal;
    day.highSpeedDistance += d.highSpeedRunning;
    day.distanceZ5 += d.distanceZ5;
    day.distanceZ6 += d.distanceZ6;
    day.accelerations += d.accelerations;
    day.decelerations += d.decelerations;
    day.minutes += d.minutes;
    day.maxSpeed = Math.max(day.maxSpeed, d.maxSpeed); // peak — never summed
    if (!day.mdDayLabel) day.mdDayLabel = sessionTypeToMd(d.sessionType);
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return [...byDate.values()]
    .map((d) => ({
      ...d,
      totalDistance: round(d.totalDistance), highSpeedDistance: round(d.highSpeedDistance),
      distanceZ5: round(d.distanceZ5), distanceZ6: round(d.distanceZ6),
      minutes: round(d.minutes), maxSpeed: round(d.maxSpeed),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Map one aggregated day to a `player_external_load_daily` upsert object.
 * `source: "catapult"` so the load engine's reads pick it up; `raw_payload_json.away`
 * marks it a camp session (real measurement → `estimated: false`, so it feeds baselines).
 * total_player_load is omitted (this OpenField export is GPS-only — never fabricate it).
 */
export function openFieldDayToDbRow(
  day: OpenFieldDay,
  playerId: string,
  teamId: string,
  event: string,
  position?: string | null,
): Record<string, unknown> {
  return {
    player_id: playerId,
    team_id: teamId,
    date: day.date,
    source: "catapult",
    total_distance: day.totalDistance,
    high_speed_distance: day.highSpeedDistance,
    velocity_band5_total_distance: day.distanceZ5,
    velocity_band6_total_distance: day.distanceZ6,
    sprint_distance: day.distanceZ6,
    // Write the CSV-path accel/decel columns AND the base ones for max widget compatibility.
    tot_as: day.accelerations,
    tot_ds: day.decelerations,
    accelerations: Math.round(day.accelerations),
    decelerations: Math.round(day.decelerations),
    session_duration_minutes: day.minutes,
    max_velocity: day.maxSpeed,
    max_vel: day.maxSpeed,
    md_day_label: day.mdDayLabel,
    activity_count: day.drillCount,
    raw_payload_json: {
      away: true,
      event,
      source_detail: "ksi_openfield_csv",
      estimated: false,
      position: position ?? null,
    },
  };
}
