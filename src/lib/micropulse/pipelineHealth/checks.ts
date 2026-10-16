/**
 * Pipeline health — does the system's own decision pipeline still flow?
 *
 * WHY THIS EXISTS
 * ---------------
 * Three silent failures showed the core promise ("what the coach sees = what the
 * AI / report / export sees") can break invisibly:
 *   - stage4_decisions stopped writing on 2026-09-14 (a dropped constraint) and
 *     nobody noticed for ~3.5 weeks — the READY/MODIFIED/RECOVERY tiles read 0.
 *   - v_team_readiness_today returned empty for teams that DID have check-ins.
 *   - week_plans was empty for a team, so Today fabricated a session.
 * Each would have been caught within a day by a freshness / consistency check.
 *
 * This is the complement to dataQuality.ts: that module watches whether the input
 * FEEDS (GPS / IMA / wearable signals) arrive per team; this one watches whether
 * the downstream DECISION pipeline (the engine's writes, the team-signal view, the
 * week plan, the sync crons) is alive and self-consistent.
 *
 * Pure / IO-free / serialisable — the loader assembles the facts, these functions
 * only judge them, so the judgement is unit-testable without a DB. Read-only
 * observation: never treats a colour as a verdict, never changes data.
 */

import type { Bi } from "@/lib/micropulse/periodization";
import { FEED_SILENT_DAYS } from "@/lib/micropulse/dataQuality";

export type HealthStatus = "ok" | "info" | "amber" | "red";

export type HealthCheckId =
  | "checkins_flowing"
  | "canonical_colour_fresh"
  | "stage4_alive"
  | "team_signal_consistent"
  | "week_plan_present"
  | "wearable_sync"
  | "external_load_ingestion";

export type HealthResult = {
  id: HealthCheckId;
  label: Bi;
  status: HealthStatus;
  /** Plain-language "what it means", coach/owner-readable, no jargon. */
  detail: Bi;
  /** The freshest data the check saw (date/time string) — provenance. */
  latest: string | null;
  /** What the check expected to see — provenance. */
  expected: string;
  href?: string;
};

export function isActionableHealth(r: HealthResult): boolean {
  return r.status === "amber" || r.status === "red";
}

/** Thresholds (per-check constants; team overrides are a later add). */
export const CHECKIN_SILENT_DAYS = 3;
export const WEARABLE_STALE_HOURS = 48;
export const LOAD_SILENT_DAYS = FEED_SILENT_DAYS; // reuse the one source (14)

/** Serialisable facts for one team — assembled by load.ts, judged here. */
export type TeamHealthFacts = {
  teamId: string;
  teamName: string;
  /** as-of date (YYYY-MM-DD, Reykjavík) and the matching epoch ms for time checks. */
  today: string;
  nowMs: number;

  activePlayerCount: number;
  /** team_settings.uses_wellness_features — gates the check-in / colour / signal checks. */
  usesWellness: boolean;
  /** GPS tier = full (or a live GPS metric) — gates the external-load check. */
  gpsExpected: boolean;
  /** Team's active players have ≥1 active wearable connection — gates the wearable check. */
  hasActiveWearables: boolean;

  /** max(entry_date) in readiness_entries for the team (any row). */
  readinessMaxDate: string | null;
  /** real (is_imputed=false) check-ins dated today. */
  realCheckinTodayCount: number;
  /** v_coach_readiness_today_v8 rows for today. */
  coachViewRowsToday: number;
  /** max(entry_date) in stage4_decisions across the team's active players. */
  stage4MaxDate: string | null;
  /** a v_team_readiness_today row exists for today. */
  teamSignalRowToday: boolean;
  /** a week_plans row with day_date = today exists. */
  weekPlanTodayExists: boolean;
  /** max(date) in player_external_load_daily (GPS sources) across the team's players. */
  externalLoadMaxDate: string | null;
  /** max(last_synced_at) among the team's active wearable connections. */
  wearableMaxSync: string | null;
  /** count of active connections carrying a last_sync_error. */
  wearableErrorCount: number;
};

/** Whole days between a YYYY-MM-DD date and the as-of day (null date → null). */
function daysSince(dateStr: string | null, today: string): number | null {
  if (!dateStr) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

const LABEL: Record<HealthCheckId, Bi> = {
  checkins_flowing: { en: "Check-ins flowing", is: "Skráningar berast" },
  canonical_colour_fresh: { en: "Readiness colour fresh", is: "Readiness-litur ferskur" },
  stage4_alive: { en: "Decision engine alive", is: "Ákvörðunarvél virk" },
  team_signal_consistent: { en: "Team signal consistent", is: "Liðsmerki samræmt" },
  week_plan_present: { en: "Week plan present", is: "Vikuáætlun til staðar" },
  wearable_sync: { en: "Wearable sync", is: "Snjalltæki samstillt" },
  external_load_ingestion: { en: "GPS load ingestion", is: "GPS-álag berst" },
};

const HREF: Partial<Record<HealthCheckId, string>> = {
  checkins_flowing: "/coach",
  canonical_colour_fresh: "/coach",
  stage4_alive: "/coach",
  team_signal_consistent: "/coach",
  week_plan_present: "/coach/week-setup",
  wearable_sync: "/coach/heart-rate-intelligence",
  external_load_ingestion: "/coach/data-quality",
};

const ok = (id: HealthCheckId, detail: Bi, latest: string | null, expected: string): HealthResult =>
  ({ id, label: LABEL[id], status: "ok", detail, latest, expected, href: HREF[id] });
const fire = (id: HealthCheckId, status: HealthStatus, detail: Bi, latest: string | null, expected: string): HealthResult =>
  ({ id, label: LABEL[id], status, detail, latest, expected, href: HREF[id] });

// ── Individual checks. Each returns null when the check is NOT APPLICABLE to the
// team (gated out), an "ok" result when healthy, or an amber/red result when it fires.

/** Players are submitting check-ins (real, not imputed). Wellness teams only. */
export function checkCheckinsFlowing(f: TeamHealthFacts): HealthResult | null {
  if (!f.usesWellness || f.activePlayerCount === 0) return null;
  const d = daysSince(f.readinessMaxDate, f.today);
  const expected = `a check-in within ${CHECKIN_SILENT_DAYS} days`;
  if (d == null) return fire("checkins_flowing", "amber", { en: "No check-ins have ever been recorded for this squad.", is: "Engar skráningar hafa nokkru sinni borist fyrir þetta lið." }, null, expected);
  if (d >= CHECKIN_SILENT_DAYS) return fire("checkins_flowing", "amber", { en: `No check-in for ${d} days — players may have stopped submitting, or reminders aren't reaching them.`, is: `Engin skráning í ${d} daga — leikmenn gætu verið hættir að skrá, eða áminningar berast ekki.` }, f.readinessMaxDate, expected);
  return ok("checkins_flowing", { en: "Check-ins are arriving.", is: "Skráningar berast." }, f.readinessMaxDate, expected);
}

/** The canonical colour view has rows today. Wellness teams with active players. */
export function checkCanonicalColourFresh(f: TeamHealthFacts): HealthResult | null {
  if (!f.usesWellness || f.activePlayerCount === 0) return null;
  const expected = "rows in v_coach_readiness_today_v8 today";
  if (f.coachViewRowsToday === 0) {
    // Only a fault if the squad actually checked in today — otherwise it's a quiet day.
    if (f.realCheckinTodayCount > 0) return fire("canonical_colour_fresh", "red", { en: `${f.realCheckinTodayCount} players checked in today but the canonical colour view shows 0 rows — the view is broken or stale.`, is: `${f.realCheckinTodayCount} leikmenn skráðu sig í dag en readiness-sýnin sýnir 0 raðir — sýnin er biluð eða úrelt.` }, null, expected);
    return fire("canonical_colour_fresh", "info", { en: "No readiness rows today (no check-ins yet today).", is: "Engar readiness-raðir í dag (engar skráningar enn í dag)." }, null, expected);
  }
  return ok("canonical_colour_fresh", { en: "Today's readiness colours are present.", is: "Readiness-litir dagsins eru til staðar." }, f.today, expected);
}

/** The Stage-4 engine is still writing — its latest decision isn't older than the
 *  latest check-in. This is the exact 2026-09-14 failure. Red when stalled. */
export function checkStage4Alive(f: TeamHealthFacts): HealthResult | null {
  if (!f.usesWellness || f.activePlayerCount === 0) return null;
  if (!f.readinessMaxDate) return null; // nothing to compare against yet
  const expected = `stage4_decisions as fresh as the latest check-in (${f.readinessMaxDate})`;
  const r = daysSince(f.readinessMaxDate, f.today);
  const s = daysSince(f.stage4MaxDate, f.today);
  if (f.stage4MaxDate == null || (s != null && r != null && s > r)) {
    const lag = s != null && r != null ? s - r : null;
    return fire("stage4_alive", "red", {
      en: `The decision engine has stalled — latest decision ${f.stage4MaxDate ?? "never"}, latest check-in ${f.readinessMaxDate}${lag ? ` (${lag} days behind)` : ""}. READY/MODIFIED/RECOVERY tiles are silently stale.`,
      is: `Ákvörðunarvélin hefur stöðvast — nýjasta ákvörðun ${f.stage4MaxDate ?? "aldrei"}, nýjasta skráning ${f.readinessMaxDate}${lag ? ` (${lag} dögum á eftir)` : ""}. READY/MODIFIED/RECOVERY reitir eru þöglir og úreltir.`,
    }, f.stage4MaxDate, expected);
  }
  return ok("stage4_alive", { en: "The decision engine is keeping up with check-ins.", is: "Ákvörðunarvélin heldur í við skráningar." }, f.stage4MaxDate, expected);
}

/** The team-signal view has a row when the squad checked in today. Red when missing. */
export function checkTeamSignalConsistent(f: TeamHealthFacts): HealthResult | null {
  if (!f.usesWellness || f.activePlayerCount === 0) return null;
  const expected = "a v_team_readiness_today row on a day with check-ins";
  if (f.realCheckinTodayCount > 0 && !f.teamSignalRowToday) {
    return fire("team_signal_consistent", "red", { en: `${f.realCheckinTodayCount} players checked in today but the team-signal view has no row — a downstream view has broken.`, is: `${f.realCheckinTodayCount} leikmenn skráðu sig í dag en liðsmerki-sýnin hefur enga röð — sýn neðar í keðjunni er biluð.` }, null, expected);
  }
  return ok("team_signal_consistent", { en: "The team signal matches today's check-ins.", is: "Liðsmerkið samræmist skráningum dagsins." }, f.teamSignalRowToday ? f.today : null, expected);
}

/** A plan row exists for today — no plan risks Today fabricating a session. */
export function checkWeekPlanPresent(f: TeamHealthFacts): HealthResult | null {
  if (f.activePlayerCount === 0) return null;
  const expected = "a week_plans row for today";
  if (!f.weekPlanTodayExists) {
    return fire("week_plan_present", "amber", { en: "No week plan for today — Today may fabricate a session instead of showing the real plan or a rest day.", is: "Engin vikuáætlun fyrir í dag — Today gæti búið til æfingu í stað þess að sýna raunáætlun eða hvíldardag." }, null, expected);
  }
  return ok("week_plan_present", { en: "Today's plan is in place.", is: "Áætlun dagsins er til staðar." }, f.today, expected);
}

/** Active wearable connections are syncing. Only for teams that have connections. */
export function checkWearableSync(f: TeamHealthFacts): HealthResult | null {
  if (!f.hasActiveWearables) return null;
  const expected = `a sync within ${WEARABLE_STALE_HOURS}h, no sync error`;
  if (f.wearableErrorCount > 0) {
    return fire("wearable_sync", "amber", { en: `${f.wearableErrorCount} wearable connection(s) reporting a sync error.`, is: `${f.wearableErrorCount} snjalltækja-tenging(ar) með samstillingarvillu.` }, f.wearableMaxSync, expected);
  }
  const hrs = f.wearableMaxSync ? (f.nowMs - Date.parse(f.wearableMaxSync)) / 3_600_000 : null;
  if (hrs == null || hrs > WEARABLE_STALE_HOURS) {
    return fire("wearable_sync", "amber", { en: `No wearable sync in ${hrs == null ? "a long time" : `${Math.round(hrs)}h`} — the sync cron or the provider connection may be down.`, is: `Engin snjalltækja-samstilling í ${hrs == null ? "langan tíma" : `${Math.round(hrs)} klst`} — samstillingar-cron eða tenging gæti verið niðri.` }, f.wearableMaxSync, expected);
  }
  return ok("wearable_sync", { en: "Wearables are syncing.", is: "Snjalltæki samstillast." }, f.wearableMaxSync, expected);
}

/** GPS load rows are being ingested. Only for GPS-capable (full-tier) teams. */
export function checkExternalLoadIngestion(f: TeamHealthFacts): HealthResult | null {
  if (!f.gpsExpected || f.activePlayerCount === 0) return null;
  const expected = `a GPS load row within ${LOAD_SILENT_DAYS} days`;
  const d = daysSince(f.externalLoadMaxDate, f.today);
  if (d == null) return fire("external_load_ingestion", "amber", { en: "No GPS load rows for a GPS-capable team — ingestion may have stopped.", is: "Engar GPS-álagsraðir fyrir GPS-hæft lið — innlestur gæti verið stöðvaður." }, null, expected);
  if (d >= LOAD_SILENT_DAYS) return fire("external_load_ingestion", "amber", { en: `No GPS load row in ${d} days — the Catapult/WIMU ingestion may have stopped.`, is: `Engin GPS-álagsröð í ${d} daga — Catapult/WIMU innlestur gæti verið stöðvaður.` }, f.externalLoadMaxDate, expected);
  return ok("external_load_ingestion", { en: "GPS load is being ingested.", is: "GPS-álag berst." }, f.externalLoadMaxDate, expected);
}

/** Run every check for a team; drops the ones that don't apply (null). Most-severe first. */
export function evaluateTeamHealth(f: TeamHealthFacts): HealthResult[] {
  const results = [
    checkStage4Alive(f),
    checkTeamSignalConsistent(f),
    checkCheckinsFlowing(f),
    checkCanonicalColourFresh(f),
    checkWeekPlanPresent(f),
    checkWearableSync(f),
    checkExternalLoadIngestion(f),
  ].filter((r): r is HealthResult => r != null);
  const rank: Record<HealthStatus, number> = { red: 0, amber: 1, info: 2, ok: 3 };
  return results.sort((a, b) => rank[a.status] - rank[b.status]);
}

/**
 * Alert dedup: fire once per transition into (or within) an actionable state, stay
 * silent while unchanged — so a persistent red alerts once, not daily, and a
 * recurrence after a clear alerts again. Pure.
 */
export function shouldAlert(prev: HealthStatus | null, cur: HealthStatus): boolean {
  return (cur === "red" || cur === "amber") && prev !== cur;
}
