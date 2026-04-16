import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-team training schedule overrides.
 *
 * Stored in team_settings.training_slots (jsonb). NULL / missing => fall back
 * to hardcoded defaults in:
 *   - src/lib/session-rpe/reminderConfig.ts  (push RPE reminders)
 *   - src/lib/reminders/emailSchedule.ts      (email readiness + RPE)
 *
 * Shape (all fields optional; absent keys fall through to the defaults):
 *
 * {
 *   "weekday_slots": {
 *     "0": { "training_time": "11:00", "rpe_reminders": ["14:00","15:00"] },
 *     "1": { ... },
 *     ...
 *     "6": { ... }
 *   },
 *   "readiness_reminder_time": "09:00",
 *   "rpe_email_time_weekday":  "14:00",
 *   "rpe_email_time_tue_thu":  "16:30"
 * }
 */

export type TrainingWeekdayKey = "0" | "1" | "2" | "3" | "4" | "5" | "6";

export type TrainingSlotsConfig = {
  weekday_slots?: Partial<Record<TrainingWeekdayKey, {
    training_time?: string | null;
    rpe_reminders?: readonly string[] | null;
  } | null>>;
  readiness_reminder_time?: string | null;
  rpe_email_time_weekday?: string | null;
  rpe_email_time_tue_thu?: string | null;
};

type CacheEntry = { value: TrainingSlotsConfig | null; expiresAt: number };

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function clearTrainingSlotsCache(): void {
  cache.clear();
}

function isValidHHMM(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v);
}

function sanitize(raw: unknown): TrainingSlotsConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const out: TrainingSlotsConfig = {};

  if (obj.weekday_slots && typeof obj.weekday_slots === "object") {
    const slots: TrainingSlotsConfig["weekday_slots"] = {};
    for (const key of ["0", "1", "2", "3", "4", "5", "6"] as const) {
      const entry = (obj.weekday_slots as Record<string, unknown>)[key];
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const training_time = isValidHHMM(e.training_time) ? e.training_time : null;
      const rpeRaw = Array.isArray(e.rpe_reminders) ? e.rpe_reminders : null;
      const rpe_reminders = rpeRaw ? rpeRaw.filter(isValidHHMM) : null;
      if (training_time || (rpe_reminders && rpe_reminders.length)) {
        slots[key] = { training_time, rpe_reminders };
      }
    }
    if (Object.keys(slots).length) out.weekday_slots = slots;
  }

  if (isValidHHMM(obj.readiness_reminder_time)) out.readiness_reminder_time = obj.readiness_reminder_time;
  if (isValidHHMM(obj.rpe_email_time_weekday)) out.rpe_email_time_weekday = obj.rpe_email_time_weekday;
  if (isValidHHMM(obj.rpe_email_time_tue_thu)) out.rpe_email_time_tue_thu = obj.rpe_email_time_tue_thu;

  return out;
}

/**
 * Fetch training_slots override for a team. Returns null when no row exists or no override set.
 * Cached for 60s to avoid hitting the DB every reminder tick.
 */
export async function getTeamTrainingSlots(
  sb: SupabaseClient,
  teamId: string | null | undefined
): Promise<TrainingSlotsConfig | null> {
  if (!teamId) return null;
  const now = Date.now();
  const hit = cache.get(teamId);
  if (hit && hit.expiresAt > now) return hit.value;

  try {
    const { data, error } = await sb
      .from("team_settings")
      .select("training_slots")
      .eq("team_id", teamId)
      .maybeSingle();
    if (error) {
      cache.set(teamId, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    const value = sanitize((data as { training_slots?: unknown } | null)?.training_slots ?? null);
    cache.set(teamId, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch {
    cache.set(teamId, { value: null, expiresAt: now + CACHE_TTL_MS });
    return null;
  }
}

/** Batch fetch to avoid N queries when processing multiple teams at once. */
export async function getTeamTrainingSlotsBulk(
  sb: SupabaseClient,
  teamIds: string[]
): Promise<Map<string, TrainingSlotsConfig | null>> {
  const result = new Map<string, TrainingSlotsConfig | null>();
  const now = Date.now();
  const missing: string[] = [];

  for (const id of teamIds) {
    const hit = cache.get(id);
    if (hit && hit.expiresAt > now) result.set(id, hit.value);
    else missing.push(id);
  }
  if (!missing.length) return result;

  try {
    const { data } = await sb
      .from("team_settings")
      .select("team_id, training_slots")
      .in("team_id", missing);
    const rows = (data ?? []) as Array<{ team_id: string; training_slots: unknown }>;
    const byTeam = new Map<string, unknown>();
    for (const row of rows) byTeam.set(String(row.team_id), row.training_slots);
    for (const id of missing) {
      const value = sanitize(byTeam.get(id) ?? null);
      cache.set(id, { value, expiresAt: now + CACHE_TTL_MS });
      result.set(id, value);
    }
  } catch {
    for (const id of missing) {
      cache.set(id, { value: null, expiresAt: now + CACHE_TTL_MS });
      result.set(id, null);
    }
  }
  return result;
}
