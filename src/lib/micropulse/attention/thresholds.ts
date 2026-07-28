/**
 * Attention thresholds — one cited source of truth.
 *
 * The "Needs attention" panel on the coach Today page is the single most
 * consequential surface in the app: it's the list a coach acts on every
 * morning. Bare numeric literals scattered across the attention list, the
 * dashboard badge, and the load/readiness engines drift apart silently — a
 * `>= 1.6` in one place and a `> 1.6` in another eventually disagree on the
 * same player. Every threshold that decides whether a player is flagged (or
 * how) lives here, named and cited, and is imported everywhere it's used.
 *
 * Each constant carries the paper it comes from (manifesto rule: every signal
 * carries a citation). Do NOT re-introduce the bare literal at the call site.
 */

// ── Readiness (personal-norm wellness score) ────────────────────────────────

/**
 * Low daily-readiness-score floor. `total_score` is the 0–25 wellness sum; at
 * or below this the day is a concern even if the colour engine hasn't tripped
 * RED yet. Replaces the old `(row.total_score ?? 99) <= 12` — the `?? 99`
 * sentinel silently treated a MISSING score as "fine", which is exactly the
 * no-data-as-green trap the manifesto forbids. Callers must gate on a real
 * number and treat null as no-data, never as a passing score.
 * Robertson 2017 (personal-norm wellness monitoring).
 */
export const READINESS_LOW_SCORE = 12;

// ── PlayerLoad / ACWR spike (yesterday vs 28-day personal norm) ─────────────

/**
 * PlayerLoad-spike ratio that warrants a *monitor* (yesterday's movement load
 * moderately above the player's own 28-day norm). Framed as spike size /
 * unfamiliar load, never as an injury predictor.
 * Gabbett 2017; Impellizzeri 2020 (ACWR is exposure, not a risk score).
 */
export const PL_SPIKE_MONITOR = 1.15;

/**
 * PlayerLoad-spike ratio that warrants an *alert* — a clear spike well above
 * the personal norm. Also the "unfamiliar load" badge threshold on the
 * dashboard attention row; both must read from THIS constant so they agree.
 * Gabbett 2017.
 */
export const PL_SPIKE_ALERT = 1.6;

// ── Composite external-load concern score (0–1) ─────────────────────────────

/**
 * Composite external-load score at/above which the load picture is "high".
 * (The per-player `concernLevel` enum is computed upstream; this is the numeric
 * anchor used where the raw composite is compared directly.)
 * Gabbett 2017; Buchheit 2024 (multi-signal load synthesis).
 */
export const COMPOSITE_HIGH_SCORE = 0.75;

// ── Day-over-day delta ──────────────────────────────────────────────────────

/**
 * Minimum move in `total_score` (of 25) for a same-colour day-over-day change
 * to be called a meaningful "better/worse" rather than routine noise. Below
 * this the delta reads "unchanged".
 * Robertson 2017 (smallest worthwhile change in wellness monitoring).
 */
export const DELTA_MEANINGFUL_SCORE = 3;

// ── Data-confidence coverage ratio (signals present / signals possible) ─────

/** Coverage ratio at/above which a verdict's data confidence is "high". */
export const CONFIDENCE_HIGH_RATIO = 0.8;

/** Coverage ratio at/above which a verdict's data confidence is "moderate". */
export const CONFIDENCE_MODERATE_RATIO = 0.5;

// ── Baseline maturity ───────────────────────────────────────────────────────

/**
 * Minimum personal-baseline observations for a verdict to rest on a *mature*
 * norm. At or below this the flag stays visible but is tagged "provisional" —
 * the manifesto's "every verdict shows its confidence" applied at the alert
 * level. A RED resting on 5 observations must not read identically to one on 25.
 * Robertson 2017 (personal norms need a stable observation base).
 */
export const MIN_MATURE_OBS = 10;
