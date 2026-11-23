/**
 * A coach's hand send follows a later check-in on Today (coach's call 2026-11-23, contradiction 12).
 *
 * A hand send (one player, whole squad, the 4-week block) is built when the coach presses send. When the player checks
 * in AFTER that, and today's colour is worse than the colour the session was built with, Today adjusts it:
 *   - the coach's exercises stay;
 *   - yellow: one set off each line;
 *   - red: warm-up and mobility only (as for a team template on a red day);
 *   - a line on the card says it was adjusted to today's check-in.
 * Never twice: a session built with yellow is not cut again on a yellow day. The automatic send (origin "auto") is
 * rebuilt at check-in on the server, and the corrective send is prep work only, so neither is adjusted here.
 *
 * Colour = today's canonical colour (`v_coach_readiness_today_v8.final_color`) only.
 */

export type ReadinessLevel = "GREEN" | "YELLOW" | "RED";

/** The engine's verdict → the check-in colour it stands for (one table; autoSession and the hand sends use it). */
export const LEVEL_OF_VERDICT = { FULL: "GREEN", MODIFIED: "YELLOW", REDUCED: "YELLOW", RECOVERY: "RED", HOLD: "RED" } as const;

export function levelOfVerdict(verdict: keyof typeof LEVEL_OF_VERDICT | null | undefined): ReadinessLevel | null {
  return verdict ? LEVEL_OF_VERDICT[verdict] : null;
}

const RANK: Record<ReadinessLevel, number> = { GREEN: 0, YELLOW: 1, RED: 2 };

function asLevel(v: string | null | undefined): ReadinessLevel | null {
  const s = String(v ?? "").trim().toUpperCase();
  if (s === "GREEN" || s === "GREEN_PLUS") return "GREEN";
  if (s === "YELLOW" || s === "AMBER") return "YELLOW";
  if (s === "RED") return "RED";
  return null;
}

/** The hand-send origins Today adjusts. Null = a row sent before origins were stored (always a hand send). */
const ADJUSTED_ORIGINS = new Set(["session", "bulk", "block", ""]);

/**
 * The colour Today adjusts a coach-sent session to, or null (leave it as sent).
 * `builtWith` = the colour stored on the send (null = built without a check-in, read as green).
 * `todayColour` = today's canonical colour, null when the player has not checked in.
 */
export function handSentLevel(args: { origin: string | null | undefined; builtWith: string | null | undefined; todayColour: string | null | undefined }): Exclude<ReadinessLevel, "GREEN"> | null {
  if (!ADJUSTED_ORIGINS.has(String(args.origin ?? "").trim().toLowerCase())) return null;
  const today = asLevel(args.todayColour);
  if (!today || today === "GREEN") return null;
  const built = asLevel(args.builtWith) ?? "GREEN";
  return RANK[today] > RANK[built] ? today : null;
}

/** A warm-up / mobility block of a Today structure: marked `kind: "prep"` (sends from 2026-11-23), else by its title. */
const PREP_TITLE = /(warm|upphit|prep|hreyfil[ií]n|mobil|li[ðd]leik|corrective|hreyfiskimun|flush)/i;
export function isPrepBlock(b: unknown): boolean {
  const r = (b ?? {}) as { kind?: unknown; block?: unknown };
  if (r.kind === "prep") return true;
  if (r.kind != null) return false;
  return PREP_TITLE.test(String(r.block ?? ""));
}

/** Red day: the structure's warm-up and mobility blocks only. */
export function prepOnly<T>(structure: T[]): T[] {
  return structure.filter(isPrepBlock);
}

/** The line the card shows on an adjusted hand send (EN / IS). */
export function handSentAdjustLine(level: Exclude<ReadinessLevel, "GREEN">, isIS: boolean, nothingLeft: boolean): string {
  if (level === "YELLOW") {
    return isIS
      ? "Aðlagað að innskráningu dagsins: gul, svo eitt sett er tekið af hverri línu. Æfingarnar eru þær sem þjálfarinn valdi."
      : "Adjusted to today's check-in: yellow, so one set comes off each line. The exercises are the ones your coach picked.";
  }
  if (nothingLeft) {
    return isIS
      ? "Aðlagað að innskráningu dagsins: rauð, svo í dag er aðeins upphitun og liðleiki. Þessi æfing hefur hvorugt, svo hún bíður. Láttu þjálfarann vita."
      : "Adjusted to today's check-in: red, so today is warm-up and mobility only. This session has neither, so it waits. Let your coach know.";
  }
  return isIS
    ? "Aðlagað að innskráningu dagsins: rauð, svo aðeins upphitun og liðleiki eru eftir í dag."
    : "Adjusted to today's check-in: red, so only the warm-up and mobility are left today.";
}
