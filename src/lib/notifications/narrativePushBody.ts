import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Push notification narrative builder.
 *
 * The threshold-detection function writes a short, factual `summary`
 * (e.g. "Sleep dropped from 4 to 2"). This helper enriches that body
 * with WHY context drawn from the player's last 2 days of wellness
 * scores and recent verdict change so coaches can decide on the lock
 * screen — without opening the app.
 *
 * Sample outputs:
 *   "Hákon → REDUCED · Sleep 4→2 + soreness rose. Tap to review."
 *   "Atli sprint speed −13% vs personal peak. Watch sprint blocks."
 *   "Affi decel burden 0.78 (high). Cap eccentric work today."
 *
 * Pure deterministic. No LLM. One batch query for wellness context per
 * push run keeps it cheap.
 */

export type PushContextRow = {
  /** ISO date YYYY-MM-DD. */
  date: string;
  sleep_quality: number | null;
  muscle_soreness: number | null;
  fatigue_energy: number | null;
  stress_mood: number | null;
};

export type PushContext = Map<string, PushContextRow[]>;

/** Pull the last 2 days of wellness scores for a batch of players. One query. */
export async function loadPushContext(
  supabase: SupabaseClient,
  playerIds: string[],
  todayIso: string,
): Promise<PushContext> {
  const result: PushContext = new Map();
  if (playerIds.length === 0) return result;

  const start = (() => {
    const d = new Date(`${todayIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const { data, error } = await supabase
    .from("readiness_entries")
    .select("player_id, entry_date, sleep_quality, muscle_soreness, fatigue_energy, stress_mood")
    .in("player_id", playerIds)
    .gte("entry_date", start)
    .lte("entry_date", todayIso)
    .order("entry_date", { ascending: true });

  if (error) return result;

  for (const r of (data ?? []) as Array<{
    player_id: string;
    entry_date: string;
    sleep_quality: number | null;
    muscle_soreness: number | null;
    fatigue_energy: number | null;
    stress_mood: number | null;
  }>) {
    const arr = result.get(r.player_id) ?? [];
    arr.push({
      date: r.entry_date,
      sleep_quality: r.sleep_quality,
      muscle_soreness: r.muscle_soreness,
      fatigue_energy: r.fatigue_energy,
      stress_mood: r.stress_mood,
    });
    result.set(r.player_id, arr);
  }
  return result;
}

/** Identify the wellness metric(s) that moved most between yesterday and today.
 *  Returns a short comma-joined string like "Sleep 4→2 · soreness rose"
 *  or null when no significant change. */
function describeWellnessDelta(rows: PushContextRow[] | undefined, lang: "IS" | "EN"): string | null {
  if (!rows || rows.length < 2) return null;
  const prev = rows[rows.length - 2];
  const curr = rows[rows.length - 1];
  type Item = { keyEn: string; keyIs: string; prev: number | null; curr: number | null; better_is_higher: boolean };
  const items: Item[] = [
    { keyEn: "Sleep", keyIs: "Svefn", prev: prev.sleep_quality, curr: curr.sleep_quality, better_is_higher: true },
    { keyEn: "Soreness", keyIs: "Verkir", prev: prev.muscle_soreness, curr: curr.muscle_soreness, better_is_higher: true },
    { keyEn: "Energy", keyIs: "Orka", prev: prev.fatigue_energy, curr: curr.fatigue_energy, better_is_higher: true },
    { keyEn: "Mood", keyIs: "Skap", prev: prev.stress_mood, curr: curr.stress_mood, better_is_higher: true },
  ];

  // Worsening = current LOWER than previous (since high = good for all 4 metrics)
  const worsened = items
    .filter((i) => i.prev != null && i.curr != null && (i.prev as number) - (i.curr as number) >= 1)
    .sort((a, b) => ((b.prev as number) - (b.curr as number)) - ((a.prev as number) - (a.curr as number)))
    .slice(0, 2);
  if (worsened.length === 0) return null;
  return worsened
    .map((i) => `${lang === "IS" ? i.keyIs : i.keyEn} ${i.prev}→${i.curr}`)
    .join(" · ");
}

export type NotifLite = {
  parameter: string;
  direction: string | null;
  severity: string;
  summary: string;
  summary_is: string | null;
  value_now: number | null;
  value_prev: number | null;
  player_id: string;
  player_name: string;
};

/** Build a coach-friendly push body. Caps total at 140 chars (PWA-safe). */
export function buildPushBody(
  notif: NotifLite,
  context: PushContext,
  lang: "IS" | "EN" = "EN",
): string {
  const baseSummary = (lang === "IS" ? notif.summary_is : notif.summary) ?? notif.summary;
  const param = notif.parameter.toLowerCase();
  const isVerdictChange = param.includes("training_action") || param.includes("verdict") || param.includes("recommendation");
  const isWellness = param.includes("sleep") || param.includes("soreness") || param.includes("energy") || param.includes("mood") || param.includes("stress");

  let suffix = "";
  if (isVerdictChange || isWellness) {
    const delta = describeWellnessDelta(context.get(notif.player_id), lang);
    if (delta) suffix = ` · ${delta}`;
  }

  // Action hint based on severity / parameter family
  let action = "";
  if (notif.severity === "urgent") {
    action = lang === "IS" ? " · Skoðaðu strax." : " · Review now.";
  } else if (param.includes("decel")) {
    action = lang === "IS" ? " · Lækka eccentric álag." : " · Cap eccentric work.";
  } else if (param.includes("sprint")) {
    action = lang === "IS" ? " · Fylgstu með sprint-blokkum." : " · Watch sprint blocks.";
  } else if (param.includes("hid") || param.includes("hsr")) {
    action = lang === "IS" ? " · Lækka volume á háhraðahlaupi." : " · Trim HSR volume.";
  }

  const candidate = `${baseSummary}${suffix}${action}`;
  // Hard cap at 140 chars — PWA push bodies render reliably up to ~150
  if (candidate.length <= 140) return candidate;
  // Trim suffix first, then action, then the summary itself
  const compact = `${baseSummary}${suffix}`;
  if (compact.length <= 140) return compact;
  return baseSummary.slice(0, 137) + "…";
}
