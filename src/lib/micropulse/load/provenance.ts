/**
 * Load provenance — "where did this load number come from?" — the rule kept out
 * of the component so it is testable and every surface answers it identically.
 *
 * BACKGROUND
 * ----------
 * Readiness verdicts already carry provenance (v_coach_readiness_today_v8.is_imputed
 * → the estimated marker — see readiness/imputedVerdict.ts). Load numbers did not.
 * We routinely write rows into player_external_load_daily that are NOT direct device
 * readings and, until now, rendered identically to one:
 *   - ESTIMATED — the pod-forgot fallback (estimatePod.ts): a squad/personal average
 *     pro-rated by minutes, tagged raw_payload_json.estimated = true.
 *   - AWAY — a real measurement taken elsewhere (national-team / away camp,
 *     catapult-openfield upload, raw_payload_json.away = true): real, but not the
 *     club's own context.
 * A device reading has neither flag. "STALE" is computed, not stored: the number is
 * carried forward because no new reading has arrived while the player kept training.
 *
 * Same null-vs-zero discipline the ingestion layer applies to a missing GPS lock:
 * show the number, but never let an estimate impersonate a measurement. Descriptive
 * only — this never changes any load math and is never a readiness colour.
 */

export type Lang = "EN" | "IS";

/** The provenance tier of a single load number. `measured` renders no badge. */
export type LoadTier = "measured" | "estimated" | "away" | "stale";

/** Minimal provenance shape read off a row's raw_payload_json. */
export type LoadProvenanceFlags = {
  estimated?: boolean | null;
  away?: boolean | null;
};

/** A row is only an estimate / away when its flag is explicitly true (absent = measured). */
export function isEstimatedLoad(p: LoadProvenanceFlags | null | undefined): boolean {
  return p?.estimated === true;
}
export function isAwayLoad(p: LoadProvenanceFlags | null | undefined): boolean {
  return p?.away === true;
}

/** Days since the latest reading past which a carried-forward number reads as stale. */
export const LOAD_STALE_AFTER_DAYS = 10;

/**
 * Tier for one load number. Priority: an explicit estimate wins (it is a model
 * fill, the most important caveat), then away (real but elsewhere), then stale
 * (measured but old), else measured. `ageDays` is days since this reading; pass it
 * only where staleness is meaningful (e.g. a "latest load" number).
 */
export function loadRowTier(
  p: LoadProvenanceFlags | null | undefined,
  opts?: { ageDays?: number | null; staleAfterDays?: number },
): LoadTier {
  if (isEstimatedLoad(p)) return "estimated";
  if (isAwayLoad(p)) return "away";
  const age = opts?.ageDays;
  const threshold = opts?.staleAfterDays ?? LOAD_STALE_AFTER_DAYS;
  if (age != null && age >= threshold) return "stale";
  return "measured";
}

export type LoadProvenanceCopy = { label: string; tip: string };

/**
 * Bilingual marker copy. The label stays plain (layered-read rule); the "why" —
 * the estimate method, the camp name, or the staleness age — lives in the tooltip.
 * `ctx` fills those details when known.
 */
export function loadProvenanceCopy(
  tier: LoadTier,
  lang: Lang = "EN",
  ctx?: { event?: string | null; ageDays?: number | null; estimatedDays?: number; awayDays?: number; totalDays?: number },
): LoadProvenanceCopy {
  const isIS = lang === "IS";
  const nOfM = (n: number | undefined, m: number | undefined): string => {
    if (!n || !m) return "";
    return isIS ? ` (${n} af ${m} dögum)` : ` (${n} of ${m} days)`;
  };
  switch (tier) {
    case "estimated":
      return isIS
        ? { label: "áætlað", tip: `Áætlað álag${nOfM(ctx?.estimatedDays, ctx?.totalDays)} — podinn vantaði, svo talan er meðaltal (persónulegt/liðs) hlutfallað eftir mínútum. Raunmæling kemur í staðinn þegar hún berst. Áætlanir telja áfram inn í álag; merkið gerir þær bara sýnilegar.` }
        : { label: "estimated", tip: `Estimated load${nOfM(ctx?.estimatedDays, ctx?.totalDays)} — the pod was missing, so this is a squad/personal average pro-rated by minutes. A real reading replaces it when it arrives. Estimates still feed the load; the marker just makes that visible.` };
    case "away":
      return isIS
        ? { label: "annars staðar", tip: `Raunmæling en tekin annars staðar${ctx?.event ? ` (${ctx.event})` : " (landsliðs-/æfingabúðir)"}${nOfM(ctx?.awayDays, ctx?.totalDays)} — raunverulegt álag, ekki í samhengi félagsins.` }
        : { label: "away", tip: `A real measurement, taken elsewhere${ctx?.event ? ` (${ctx.event})` : " (national-team / away camp)"}${nOfM(ctx?.awayDays, ctx?.totalDays)} — real load, just not in the club's own context.` };
    case "stale":
      return isIS
        ? { label: "úrelt", tip: `Engin ný mæling í ${ctx?.ageDays ?? "margar"} daga — talan er borin áfram, ekki ný.` }
        : { label: "stale", tip: `No new reading in ${ctx?.ageDays ?? "several"} days — this number is carried forward, not fresh.` };
    default:
      return isIS ? { label: "mælt", tip: "Raunveruleg tækja-/handvirk mæling." } : { label: "measured", tip: "A real device / manual measurement." };
  }
}

export type LoadAggregateProvenance = {
  estimatedCount: number;
  awayCount: number;
  total: number;
  /** The most-cautious tier among the days (estimated > away > measured). */
  worstTier: LoadTier;
};

/**
 * Roll per-day flags into an aggregate provenance for a window (e.g. the days
 * behind an ACWR or a weekly sum) — the analogue of readiness `estimatedShare`,
 * so a card can say "N of M days estimated" instead of leaving the coach to count.
 */
export function aggregateLoadProvenance(days: ReadonlyArray<LoadProvenanceFlags>): LoadAggregateProvenance {
  let estimatedCount = 0;
  let awayCount = 0;
  for (const d of days) {
    if (isEstimatedLoad(d)) estimatedCount += 1;
    else if (isAwayLoad(d)) awayCount += 1;
  }
  const worstTier: LoadTier = estimatedCount > 0 ? "estimated" : awayCount > 0 ? "away" : "measured";
  return { estimatedCount, awayCount, total: days.length, worstTier };
}
