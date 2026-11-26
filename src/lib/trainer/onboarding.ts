/**
 * PT onboarding checklist — the first ten minutes of a new practice.
 *
 *   1. Invite your first client   → a client invitation exists (any status)
 *   2. Pick a starting programme  → a starter programme is picked (or one is already assigned)
 *   3. Send the first session     → a real client has an active programme, so their first
 *                                   session is on their Today
 *
 * Progress is stored per team (pt_onboarding). A step's timestamp is set the first time it is
 * seen done and is never cleared, so the checklist only moves forward; once all three are done
 * completed_at is set and the checklist is hidden for good.
 */

export type OnboardingGoal = "speed" | "power" | "strength" | "general";
export const ONBOARDING_GOALS: OnboardingGoal[] = ["speed", "power", "strength", "general"];

/**
 * Starter programmes (pt_explosive_programmes, category 'starter_template') by goal.
 * A programme can serve more than one goal. Keys not listed here still show under "general"
 * via goalsForProgramme's fallback, so a new starter is never hidden.
 */
export const STARTER_GOALS: Record<string, OnboardingGoal[]> = {
  starter_sprint_speed_8w: ["speed"],
  starter_cod_asymmetry_6w: ["speed"],
  starter_vertical_jump_8w: ["power"],
  starter_french_contrast_8w: ["power"],
  starter_ballistic_rfd_6w: ["power"],
  starter_pulling_derivative_8w: ["power", "strength"],
  starter_strength_3day_8w: ["strength"],
  starter_long_length_hypertrophy_8w: ["strength"],
  starter_hypertrophy_3day_12w: ["strength", "general"],
  starter_beginner_fullbody_8w: ["general"],
};

export function goalsForProgramme(programmeKey: string): OnboardingGoal[] {
  return STARTER_GOALS[programmeKey] ?? ["general"];
}

export type OnboardingRow = {
  picked_programme_key: string | null;
  picked_level: string | null;
  invited_at: string | null;
  programme_at: string | null;
  session_at: string | null;
  completed_at: string | null;
};

export type OnboardingFacts = {
  /** Any client invitation for the team (pending, accepted, …). */
  hasInvitation: boolean;
  /** A real (non-demo) client has an active programme (starter or custom). */
  realClientHasProgramme: boolean;
};

export type OnboardingState = {
  invite: boolean;
  programme: boolean;
  session: boolean;
  completed: boolean;
  /** Timestamps to write (only the ones that are newly done). */
  patch: Partial<Pick<OnboardingRow, "invited_at" | "programme_at" | "session_at" | "completed_at">>;
};

/** Merge the stored progress with what the data shows now. Steps only move forward. */
export function resolveOnboarding(row: OnboardingRow | null, facts: OnboardingFacts, nowIso: string): OnboardingState {
  const r: OnboardingRow = row ?? {
    picked_programme_key: null, picked_level: null,
    invited_at: null, programme_at: null, session_at: null, completed_at: null,
  };
  const patch: OnboardingState["patch"] = {};

  const invite = !!r.invited_at || facts.hasInvitation;
  if (invite && !r.invited_at) patch.invited_at = nowIso;

  // Sending a session also means a programme was picked (it was assigned).
  const session = !!r.session_at || facts.realClientHasProgramme;
  if (session && !r.session_at) patch.session_at = nowIso;

  const programme = !!r.programme_at || !!r.picked_programme_key || session;
  if (programme && !r.programme_at) patch.programme_at = nowIso;

  const completed = !!r.completed_at || (invite && programme && session);
  if (completed && !r.completed_at) patch.completed_at = nowIso;

  return { invite, programme, session, completed, patch };
}
