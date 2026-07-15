/**
 * Data-processing policy versioning.
 *
 * Bump CURRENT_POLICY_VERSION whenever the DataProcessingSummary text changes in
 * a way that warrants fresh consent. A stored consent satisfies the current
 * policy only when its `policy_version` (treating NULL — a pre-versioning
 * consent — as the INITIAL version) equals CURRENT. So the day the text changes
 * and the version bumps, players are re-asked; until then, existing consents
 * (including NULL ones) stand and nobody is re-prompted.
 *
 * Keep the date in sync with the "last updated" shown on /privacy.
 */

/** The version at which consent-versioning began. A NULL stored version means
 *  the consent predates this column and is treated as this version. */
export const INITIAL_POLICY_VERSION = "2026-07-15";

/** The version currently in force. Bump this when the policy text changes. */
export const CURRENT_POLICY_VERSION = "2026-07-15";

/** Does a stored consent version satisfy the current policy? */
export function policyVersionSatisfies(stored: string | null | undefined): boolean {
  return (stored ?? INITIAL_POLICY_VERSION) === CURRENT_POLICY_VERSION;
}
