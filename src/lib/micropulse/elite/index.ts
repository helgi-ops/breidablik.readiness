/**
 * ELITE-tier gating for premium features (currently: all AI surfaces).
 *
 * Pricing model (set 2026-05-01):
 *   FREE  — wellness check-ins, basic readiness verdict
 *   PRO   — adds Catapult/VALD/GPS integrations, decision engine, decel
 *           intelligence raw metrics, notifications, full coach dashboard
 *   ELITE — adds AI Summary, Q&A, Decel Narrative, AI forecasts, weekly
 *           AI summaries (when built)
 *
 * The split: PRO gets the full deterministic intelligence layer (engines,
 * thresholds, alerts). ELITE gets the AI translation layer on top.
 *
 * Why: AI calls cost real money (~$0.003/call) and are the natural premium
 * differentiator. Without gating, ELITE has no clear value over PRO.
 *
 * Cache: per request, in-memory only — not worth Redis. Tier rarely changes.
 */

import { isFreeLocked } from "@/lib/micropulse/product/freeLock";

// Accept any SupabaseClient shape — the @supabase/supabase-js generic args
// vary between import contexts (PostgrestVersion is sometimes inferred as
// "12" and sometimes as never). Both are functionally identical at runtime
// since the only methods we call are .from().select().eq().maybeSingle().
type AnySupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => Promise<{ data: { plan_tier?: string } | null; error: unknown }>;
      };
    };
  };
};

export type PlanTier = "FREE" | "PRO" | "ELITE";

/**
 * Resolve a team's current plan tier. Returns null only when the row is
 * missing (caller should treat as a hard failure rather than fallthrough).
 * Defaults to "FREE" if the column is null/empty (e.g. a freshly-created
 * team that hasn't been categorised yet).
 */
export async function getTeamPlanTier(
  supabase: unknown,
  teamId: string,
): Promise<PlanTier | null> {
  const sb = supabase as AnySupabase;
  const { data, error } = await sb
    .from("teams")
    .select("plan_tier")
    .eq("id", teamId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = String(data.plan_tier ?? "").toUpperCase();
  if (raw === "ELITE") return "ELITE";
  if (raw === "PRO") return "PRO";
  return "FREE";
}

export async function isEliteTeam(
  supabase: unknown,
  teamId: string,
): Promise<boolean> {
  const tier = await getTeamPlanTier(supabase, teamId);
  return tier === "ELITE";
}

/**
 * Standardised 402 Payment Required response shape so all AI clients can
 * detect tier-gating and render the same upgrade prompt.
 */
export const ELITE_REQUIRED_RESPONSE = {
  status: 402 as const,
  body: {
    error: "ELITE_REQUIRED",
    message: "This feature requires an ELITE subscription.",
    feature: "AI",
    upgrade_url: "/pricing",
  },
};

/**
 * FREE lock on the server: club teams on the FREE plan (trials ended Nov 2026) get no syncs, no automatic sends,
 * no AI and no uploads. Same rule as the coach app (`isFreeLocked` in src/lib/micropulse/product/freeLock.ts):
 * plan FREE and not a personal-trainer practice. PRO/ELITE and PT teams are never affected.
 */
type TeamPlanRow = { id: string; plan_tier: string | null; team_type: string | null };

/**
 * Ids of every FREE-locked team, in one query, for the nightly jobs to skip. On a read error it returns an empty
 * set (the job runs as before): a paying team must never lose its nightly sync because this lookup failed.
 */
export async function getFreeLockedTeamIds(supabase: unknown): Promise<Set<string>> {
  const sb = supabase as {
    from: (t: string) => { select: (c: string) => PromiseLike<{ data: TeamPlanRow[] | null; error: unknown }> };
  };
  try {
    const { data, error } = await sb.from("teams").select("id, plan_tier, team_type");
    if (error || !data) {
      console.error("[free-lock] team plan lookup failed; nightly job runs for every team", error);
      return new Set();
    }
    return new Set(
      data
        .filter((t) => isFreeLocked(normalisePlan(t.plan_tier), t.team_type))
        .map((t) => String(t.id)),
    );
  } catch (e) {
    console.error("[free-lock] team plan lookup failed; nightly job runs for every team", e);
    return new Set();
  }
}

function normalisePlan(raw: string | null | undefined): PlanTier {
  const v = String(raw ?? "").toUpperCase();
  return v === "ELITE" ? "ELITE" : v === "PRO" ? "PRO" : "FREE";
}

/** 402 for a FREE-locked team calling a paid feature (AI, sends, syncs, uploads). */
export const PRO_REQUIRED_RESPONSE = {
  status: 402 as const,
  body: {
    error: "PRO_REQUIRED",
    message: "This feature is not part of the Free plan. Upgrade to Pro to use it.",
    feature: "PRO",
    upgrade_url: "/pricing",
  },
};
