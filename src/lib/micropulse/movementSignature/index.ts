/**
 * Movement Signature — "is he still moving like himself?" (Unfamiliar Load).
 *
 * Phase 1 of docs/unfamiliar-load.md. The thesis (Niklas Virtanen / Catapult
 * 2026): the primary risk/performance signal is not HIGH load but UNFAMILIAR
 * load — a player drifting outside his own normal movement behaviour, even when
 * total load looks normal. This is the Driver layer (IMA), sitting beside the
 * Engine layer (GPS volume / ACWR).
 *
 * We model four inertial components, each compared to the player's OWN recent
 * norm (personal z-score, Robertson 2017), not an absolute or squad threshold:
 *   1. multidirectional       — IMA band 5-8 distance (change-of-direction volume)
 *   2. explosive              — accel + decel B2-3 effort counts (micro-actions)
 *   3. multidirectional_share — IMA distance / total distance (catches the
 *                               "same meters, different movement" case)
 *   4. decel_share            — decel / (accel + decel) efforts (braking signature)
 *
 * Two drift modes:
 *   - intensity drift: a volume/explosive component is well above his norm
 *     (he's doing more of a movement than he's built up to)
 *   - shape drift: a SHARE changed while total distance stayed flat (same
 *     volume, different movement) — the literal hidden-fatigue case
 *
 * Confidence gate (manifesto): a personal norm needs enough training days
 * before a z-score means anything. Below the floor we say "building", never a
 * number we can't stand behind. Rules decide; this is deterministic, no IO.
 */

export type MovementDayRow = {
  date: string;          // YYYY-MM-DD
  totalDistance: number; // m
  imaDistance: number;   // IMA band 5-8 total distance, m
  accelEfforts: number;  // accel B2-3 effort count
  decelEfforts: number;  // decel B2-3 effort count
};

export type ComponentKey =
  | "multidirectional"
  | "explosive"
  | "multidirectional_share"
  | "decel_share";

export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  multidirectional: "Multidirectional running",
  explosive: "Explosive efforts",
  multidirectional_share: "Multidirectional share of work",
  decel_share: "Braking share",
};

// Share-type components describe the MIX (shape); the others describe VOLUME.
const SHARE_KEYS: ReadonlySet<ComponentKey> = new Set(["multidirectional_share", "decel_share"]);
// For volume/share-up components, "unfamiliar" means ABOVE the norm (positive z).
// decel_share is treated two-sided (a braking-pattern shift either way is "shape").
const TWO_SIDED: ReadonlySet<ComponentKey> = new Set(["decel_share"]);

export type ComponentDrift = {
  key: ComponentKey;
  label: string;
  today: number;        // recent micro-cycle value for this component
  mean: number;         // personal baseline mean over the window
  sd: number;           // personal baseline sd
  n: number;            // training days observed for this component
  z: number | null;     // (today - mean) / sd vs HIS OWN norm
  concerningZ: number | null; // signed so that "more unfamiliar" is positive
  flagged: boolean;     // concerningZ >= active/calibrating threshold
  // Group context (role when positions are set, else the squad): is he also
  // unusual vs his peers, or is the whole group doing it? Does not change the
  // personal flag — it's interpretation context (Phase 3).
  groupMean: number | null;
  groupSd: number | null;
  groupZ: number | null;
};

/** Per-component group baseline (role or squad) passed into the detector. */
export type GroupBaseline = Partial<Record<ComponentKey, { mean: number; sd: number; n: number }>>;

export type DriftType = "none" | "intensity" | "shape" | "mixed";

export type MovementSignature = {
  date: string;             // reference (most-recent) date used
  confident: boolean;       // baseline mature enough (>= ACTIVE_DAYS training days)
  calibrating: boolean;     // 8-13 days — wider bands, still reported with caution
  baselineDays: number;     // training days in the window (max across components)
  componentsPresent: number;// of 4, how many had a usable value today
  totalDistanceZ: number | null; // is overall volume itself elevated? (context)
  components: ComponentDrift[];
  drifting: ComponentDrift[];    // flagged subset, most concerning first
  driftType: DriftType;
  score: number;            // ranking magnitude (0 if no drift)
  headline: string | null;  // plain-language one-liner; null = moving like himself
  counterfactual: string | null;
  suggestedAction: string | null;
};

const WINDOW_DAYS = 28;
const MIN_DAYS = 8;       // baseline floor: need >= this many PRIOR training days to flag
const ACTIVE_DAYS = 14;   // baseline >= this = full sensitivity (±1 SD); 8-13 = calibrating (±1.5 SD)
const ACUTE_SESSIONS = 3; // "recent" = mean of the last up-to-N training sessions (this micro-cycle)
const GROUP_MIN = 12;     // min group-day samples before a group norm is shown as context

/**
 * Split a most-recent-first series into the recent micro-cycle (acute) and the
 * PRIOR baseline (reference). The baseline deliberately EXCLUDES the acute days
 * — comparing recent vs a prior reference period is what makes "unfamiliar"
 * meaningful; folding the recent days back into the baseline biases the z-score
 * toward zero (verified on sparse real IMA data). Returns null if there aren't
 * enough prior days to stand behind a norm.
 */
function splitAcuteBaseline(series: number[]): { acute: number; refMean: number; refSd: number; refN: number } | null {
  const n = series.length;
  if (n < MIN_DAYS + 1) return null; // need >= MIN_DAYS baseline + >= 1 recent
  const acuteCount = Math.min(ACUTE_SESSIONS, n - MIN_DAYS); // keep baseline >= MIN_DAYS
  const acuteVals = series.slice(0, acuteCount);
  const refVals = series.slice(acuteCount);
  const refMean = mean(refVals);
  return { acute: mean(acuteVals), refMean, refSd: sd(refVals, refMean), refN: refVals.length };
}

/**
 * Recent micro-cycle vs the player's own prior baseline for any metric series
 * (most-recent-first). Same method as the movement components, reusable for the
 * Engine (GPS) metrics in the movement-narrative profile. Returns null when
 * there isn't enough history to stand behind a norm.
 */
export function recentVsBaseline(series: number[]): { recent: number; mean: number; sd: number; z: number | null; n: number } | null {
  const split = splitAcuteBaseline(series);
  if (!split) return null;
  const z = split.refSd > 0 ? round((split.acute - split.refMean) / split.refSd, 1) : 0;
  return { recent: split.acute, mean: split.refMean, sd: split.refSd, z, n: split.refN };
}

function dayOffsetIso(refIso: string, back: number): string {
  return new Date(Date.parse(refIso + "T00:00:00Z") - back * 86_400_000).toISOString().slice(0, 10);
}
function round(n: number, d = 2): number { const f = 10 ** d; return Math.round(n * f) / f; }
function mean(xs: number[]): number { return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0; }
function sd(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/** Value of a component for one day, or null if the inputs aren't usable. */
export function componentValue(key: ComponentKey, r: MovementDayRow): number | null {
  const efforts = (Number(r.accelEfforts) || 0) + (Number(r.decelEfforts) || 0);
  switch (key) {
    case "multidirectional":
      return Number(r.imaDistance) > 0 ? Number(r.imaDistance) : null;
    case "explosive":
      return efforts > 0 ? efforts : null;
    case "multidirectional_share":
      return Number(r.totalDistance) > 0 && Number(r.imaDistance) >= 0
        ? Number(r.imaDistance) / Number(r.totalDistance) : null;
    case "decel_share":
      return efforts > 0 ? (Number(r.decelEfforts) || 0) / efforts : null;
  }
}

const ALL_KEYS: ComponentKey[] = ["multidirectional", "explosive", "multidirectional_share", "decel_share"];
/** The four movement components, exported for group-baseline aggregation. */
export const MOVEMENT_COMPONENTS: readonly ComponentKey[] = ALL_KEYS;

/**
 * @param rows    a player's daily inertial rows (any order; only rows on/before
 *                refDateIso within the window are used)
 * @param refDateIso the most-recent date with data for this player (resolve per
 *                player as max(date) <= the picked date)
 */
export function computeMovementSignature(
  rows: MovementDayRow[],
  refDateIso: string,
  opts?: { groupBaseline?: GroupBaseline },
): MovementSignature {
  // Index rows by date, keep only the window [refDate-27 .. refDate].
  const byDate = new Map<string, MovementDayRow>();
  for (const r of rows ?? []) {
    if (!r?.date) continue;
    const off = Math.round((Date.parse(refDateIso + "T00:00:00Z") - Date.parse(r.date + "T00:00:00Z")) / 86_400_000);
    if (off < 0 || off >= WINDOW_DAYS) continue;
    byDate.set(r.date, r);
  }
  // Ordered most-recent-first list of present days in the window.
  const presentDays: MovementDayRow[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = byDate.get(dayOffsetIso(refDateIso, i));
    if (d) presentDays.push(d);
  }

  const components: ComponentDrift[] = [];
  let maxDays = 0;
  let componentsPresent = 0;

  for (const key of ALL_KEYS) {
    // Series of usable training-day values, most-recent-first.
    const series: number[] = [];
    for (const r of presentDays) {
      const v = componentValue(key, r);
      if (v != null && Number.isFinite(v)) series.push(v);
    }
    if (componentValue(key, presentDays[0]) != null) componentsPresent += 1;
    const dec = key.endsWith("share") ? 3 : 0;
    // Recent micro-cycle value (used for both personal and group comparison).
    const acute = series.length ? mean(series.slice(0, Math.min(ACUTE_SESSIONS, series.length))) : 0;

    // Group (role / squad) context — does NOT change the personal flag.
    const gb = opts?.groupBaseline?.[key];
    const groupOk = gb != null && gb.n >= GROUP_MIN && gb.sd > 0;
    const groupMean = groupOk ? round(gb!.mean, dec) : null;
    const groupSd = groupOk ? round(gb!.sd, dec) : null;
    let groupZ: number | null = null;
    if (groupOk && series.length) {
      const gz = round((acute - gb!.mean) / gb!.sd, 1);
      groupZ = TWO_SIDED.has(key) ? Math.abs(gz) : gz;
    }

    const split = splitAcuteBaseline(series);
    if (!split) {
      // Not enough prior days to stand behind a personal norm → report (with
      // group context) but never flag on personal alone.
      const m = series.length ? mean(series) : 0;
      components.push({ key, label: COMPONENT_LABEL[key], today: round(acute, dec), mean: round(m, dec), sd: 0, n: series.length, z: null, concerningZ: null, flagged: false, groupMean, groupSd, groupZ });
      continue;
    }
    maxDays = Math.max(maxDays, split.refN);
    const z = split.refSd > 0 ? round((split.acute - split.refMean) / split.refSd, 1) : 0;
    const concerningZ = TWO_SIDED.has(key) ? Math.abs(z) : z;
    const calibrating = split.refN < ACTIVE_DAYS;
    const threshold = calibrating ? 1.5 : 1.0;
    const flagged = split.refSd > 0 && concerningZ >= threshold;
    components.push({ key, label: COMPONENT_LABEL[key], today: round(split.acute, dec), mean: round(split.refMean, dec), sd: round(split.refSd, dec), n: split.refN, z, concerningZ: round(concerningZ, 1), flagged, groupMean, groupSd, groupZ });
  }

  // Total-distance z for context (is overall volume itself up?).
  const tdSeries: number[] = [];
  for (const r of presentDays) { const v = Number(r.totalDistance) || 0; if (v > 0) tdSeries.push(v); }
  let totalDistanceZ: number | null = null;
  const tdSplit = splitAcuteBaseline(tdSeries);
  if (tdSplit) totalDistanceZ = tdSplit.refSd > 0 ? round((tdSplit.acute - tdSplit.refMean) / tdSplit.refSd, 1) : 0;

  const confident = maxDays >= ACTIVE_DAYS;
  const calibrating = maxDays >= MIN_DAYS && maxDays < ACTIVE_DAYS;
  const drifting = components.filter((c) => c.flagged).sort((a, b) => (b.concerningZ ?? 0) - (a.concerningZ ?? 0));

  // Classify the drift. Shape = a share moved while total distance is flat.
  const volumeFlat = totalDistanceZ == null || Math.abs(totalDistanceZ) < 1;
  const hasShape = drifting.some((c) => SHARE_KEYS.has(c.key)) && volumeFlat;
  const hasIntensity = drifting.some((c) => !SHARE_KEYS.has(c.key)) && (!volumeFlat || !drifting.some((c) => SHARE_KEYS.has(c.key)));
  let driftType: DriftType = "none";
  if (drifting.length) {
    driftType = hasShape && hasIntensity ? "mixed" : hasShape ? "shape" : "intensity";
  }

  const top = drifting[0] ?? null;
  const score = top ? round((top.concerningZ ?? 0) * (confident ? 1 : 0.6), 2) : 0;

  let headline: string | null = null;
  let counterfactual: string | null = null;
  let suggestedAction: string | null = null;
  if (top) {
    const zTxt = `${top.concerningZ}`;
    if (driftType === "shape") {
      headline = `Same volume, different movement — ${top.label.toLowerCase()} is ${zTxt} SD from his own norm while total distance is normal.`;
      suggestedAction = "Keep his total load, but ease role exposure to tight-space / change-of-direction tasks for 1-2 days, or phase the new demand in gradually.";
    } else if (driftType === "mixed") {
      headline = `Moving more — and more sharply — than usual: ${top.label.toLowerCase()} ${zTxt} SD above his norm.`;
      suggestedAction = "Both volume and movement mix are elevated; trim overall exposure and watch the change-of-direction demand.";
    } else {
      headline = `Moving more sharply than usual — ${top.label.toLowerCase()} is ${zTxt} SD above his own norm.`;
      suggestedAction = "Consider easing the high-intensity movement demand for 1-2 days so the new exposure is phased in, not spiked.";
    }
    counterfactual = `If ${top.label.toLowerCase()} were within ±1 SD of his norm, this would not flag.`;
  }

  return {
    date: refDateIso,
    confident,
    calibrating,
    baselineDays: maxDays,
    componentsPresent,
    totalDistanceZ,
    components,
    drifting,
    driftType,
    score,
    headline,
    counterfactual,
    suggestedAction,
  };
}
