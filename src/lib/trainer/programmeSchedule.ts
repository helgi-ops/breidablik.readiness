/**
 * src/lib/trainer/programmeSchedule.ts
 *
 * Resolves "which phase + which day's block is today" for an active
 * pt_explosive_programme_assignment, given the assignment start date.
 *
 * Logic:
 *   - weeksSinceStart = floor((today - start_date) / 7), clamped 0..11
 *   - phase = floor(weeksSinceStart / 3) + 1, clamped 1..4
 *   - weekInPhase = (weeksSinceStart % 3) + 1, 1..3
 *
 *   - Block-per-weekday schedule depends on programme_key + n_blocks:
 *       research_3_4day  3 blocks → Mon/Wed/Fri    (rest Tue/Thu/Sat/Sun)
 *       research_3_4day  4 blocks → Mon/Tue/Thu/Fri (rest Wed/Sat/Sun)
 *       phase_based      2 blocks → Mon=block 0 (PUSH), Thu=block 1 (PULL)
 *                                   (rest Tue/Wed/Fri/Sat/Sun)
 *
 * Returns a structured ScheduleSlot describing today: either a programme
 * block to render, or a rest day with the next scheduled session.
 */

export type ScheduleSlot =
  | {
      kind: "session";
      phase: number;
      weekInPhase: number;
      weeksSinceStart: number;
      weekdayIso: number;           // 1=Mon..7=Sun
      blockIndex: number;
      blockName: string | null;
    }
  | {
      kind: "rest";
      phase: number;
      weekInPhase: number;
      weeksSinceStart: number;
      weekdayIso: number;
      nextSessionWeekdayIso: number | null;
      nextSessionLabel: string | null;
    }
  | { kind: "not_started"; daysUntilStart: number }
  | { kind: "completed"; weeksSinceStart: number };

type ProgrammeKey = "phase_based" | "research_3_4day" | string;

/**
 * ISO weekday: Monday=1 ... Sunday=7.
 */
function isoWeekday(d: Date): number {
  const day = d.getUTCDay();           // 0=Sun..6=Sat
  return day === 0 ? 7 : day;
}

/** Days between two YYYY-MM-DD dates (b - a), in UTC. */
function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso + "T00:00:00Z").getTime();
  const b = new Date(bIso + "T00:00:00Z").getTime();
  return Math.floor((b - a) / 86_400_000);
}

/**
 * For a given programme + number of blocks, return the block index (or
 * null = rest) for each ISO weekday 1..7.
 */
function weekdaySchedule(programmeKey: ProgrammeKey, nBlocks: number): Array<number | null> {
  // index by weekday-1 so we can use weekdayIso directly: arr[weekdayIso-1]
  const out: Array<number | null> = [null, null, null, null, null, null, null];
  if (programmeKey === "research_3_4day") {
    if (nBlocks === 4) {
      out[0] = 0; // Mon
      out[1] = 1; // Tue
      out[3] = 2; // Thu
      out[4] = 3; // Fri
    } else if (nBlocks === 3) {
      out[0] = 0; // Mon
      out[2] = 1; // Wed
      out[4] = 2; // Fri
    } else {
      // Fallback: spread blocks Mon..Fri
      const days = [0, 2, 4, 1, 3];
      for (let i = 0; i < nBlocks && i < days.length; i++) out[days[i]] = i;
    }
  } else if (programmeKey === "phase_based") {
    // PUSH (Mon) + PULL (Thu) — classic two-session-per-week split.
    if (nBlocks >= 2) {
      out[0] = 0;
      out[3] = 1;
    } else if (nBlocks === 1) {
      out[0] = 0;
    }
  } else {
    // Unknown variant — spread Mon..Fri.
    const days = [0, 2, 4, 1, 3];
    for (let i = 0; i < nBlocks && i < days.length; i++) out[days[i]] = i;
  }
  return out;
}

/** Find the next non-null index in a circular weekly schedule starting from
 *  (weekday + 1). Returns ISO weekday (1..7) or null if no session days. */
function nextSessionWeekday(schedule: Array<number | null>, fromIso: number): number | null {
  for (let i = 1; i <= 7; i++) {
    const wd = ((fromIso - 1 + i) % 7) + 1;
    if (schedule[wd - 1] != null) return wd;
  }
  return null;
}

const WEEKDAY_LABELS_IS = ["Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur","Sunnudagur"];

export function resolveProgrammeSlot(args: {
  programmeKey: ProgrammeKey;
  startDate: string;            // YYYY-MM-DD
  today: string;                // YYYY-MM-DD
  nBlocks: number;              // blocks in current phase (varies by level)
  /** Optional names of the blocks, in order. */
  blockNames?: Array<string | null>;
  /** How many weeks each phase lasts. Defaults to 3 (Explosive Power 12w).
   *  Starter templates use 2 (8-week programmes), some are 1.5/4 etc. */
  weeksPerPhase?: number;
  /** How many phases the programme has. Defaults to 4. */
  totalPhases?: number;
}): ScheduleSlot {
  const {
    programmeKey, startDate, today, nBlocks, blockNames = [],
    weeksPerPhase = 3, totalPhases = 4,
  } = args;

  const days = daysBetween(startDate, today);
  if (days < 0) return { kind: "not_started", daysUntilStart: -days };

  const weeksSinceStart = Math.floor(days / 7);
  const totalWeeks = weeksPerPhase * totalPhases;
  if (weeksSinceStart >= totalWeeks) return { kind: "completed", weeksSinceStart };

  const phase = Math.min(totalPhases, Math.floor(weeksSinceStart / weeksPerPhase) + 1);
  const weekInPhase = (weeksSinceStart % weeksPerPhase) + 1;
  const weekdayIso = isoWeekday(new Date(today + "T00:00:00Z"));
  const schedule = weekdaySchedule(programmeKey, nBlocks);
  const blockIndex = schedule[weekdayIso - 1];

  if (blockIndex == null) {
    const nextWd = nextSessionWeekday(schedule, weekdayIso);
    return {
      kind: "rest",
      phase, weekInPhase, weeksSinceStart, weekdayIso,
      nextSessionWeekdayIso: nextWd,
      nextSessionLabel: nextWd ? WEEKDAY_LABELS_IS[nextWd - 1] : null,
    };
  }

  return {
    kind: "session",
    phase, weekInPhase, weeksSinceStart, weekdayIso,
    blockIndex,
    blockName: blockNames[blockIndex] ?? null,
  };
}
