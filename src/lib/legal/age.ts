/**
 * Age gating for consent.
 *
 * A minor cannot give valid consent to the processing of health / biometric data
 * — a guardian must. Date of birth is the ONLY field that reveals who that is,
 * so it is the trigger for the guardian-consent machinery that already exists in
 * `player_consents` (granted_by_relationship / _full_name / _contact).
 *
 * Age is derived HERE and nowhere else, so the threshold is one auditable
 * constant rather than a comparison copy-pasted across surfaces.
 *
 * DOB is sensitive personal data: it is minimised (one field, used only to derive
 * age) and must never reach logs, URLs, or analytics — pass the DERIVED age or
 * the boolean, not the date.
 *
 * NOT legal advice: the threshold and what counts as valid consent depend on
 * Icelandic law + GDPR. The sport-standard default is 18 for health/biometric
 * data; the club can change this one constant.
 */

/** Below this age, a guardian — not the player — gives the valid consent. */
export const CONSENT_MAJORITY_AGE = 18;

/** Calendar age in whole years. null = DOB unknown or unusable. */
export function ageYears(dob: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(`${String(dob).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = asOf.getUTCFullYear() - d.getUTCFullYear();
  const m = asOf.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < d.getUTCDate())) age -= 1;
  return age < 0 ? null : age; // a future DOB tells us nothing
}

/**
 * true = minor, false = adult, **null = unknown**.
 *
 * null is NOT "adult". Callers must treat unknown as "cannot confirm an adult"
 * and ask for the DOB — absence of data is not permission. Letting an unknown-age
 * player self-consent is exactly the failure this module exists to prevent.
 */
export function isMinor(dob: string | null | undefined, asOf: Date = new Date()): boolean | null {
  const a = ageYears(dob, asOf);
  return a == null ? null : a < CONSENT_MAJORITY_AGE;
}

/** Plausible range for a self-declared DOB — rejects typos and nonsense. */
export const MIN_PLAUSIBLE_AGE = 5;
export const MAX_PLAUSIBLE_AGE = 100;

/** Is this a usable DOB to store? (valid date, not future, sane age.) */
export function isPlausibleDob(dob: string | null | undefined, asOf: Date = new Date()): boolean {
  const a = ageYears(dob, asOf);
  return a != null && a >= MIN_PLAUSIBLE_AGE && a <= MAX_PLAUSIBLE_AGE;
}
