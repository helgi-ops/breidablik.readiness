/**
 * Format a prescribed strength session into a player-facing text message.
 *
 * Output is plain text (no markdown) — the player message board renders
 * it as-is, with whitespace + line breaks preserved. We aim for ~1200
 * characters so it fits comfortably inside the `body` column's 2000-char
 * limit (with room for coach notes appended).
 */

import type { StrengthSession } from "./types";

/**
 * Render a session as a player-facing text message.
 *
 * @param session   Built session from buildStrengthSession()
 * @param lang      "IS" | "EN" — controls block titles, dose labels, etc.
 * @param coachName Optional sender display name appended to the footer.
 */
export function formatSessionForPlayer(
  session: StrengthSession,
  lang: "IS" | "EN",
  coachName?: string,
): string {
  const t = (en: string, is: string) => (lang === "IS" ? is : en);
  const lines: string[] = [];

  // Header
  const headerEn = `MicroPulse — Strength session (${session.mdContext}, ~${session.durationMin} min)`;
  const headerIs = `MicroPulse — Styrktaræfing (${session.mdContext}, ~${session.durationMin} mín)`;
  lines.push(t(headerEn, headerIs));
  lines.push("");

  // Summary line
  lines.push(lang === "IS" ? session.summaryIS : session.summaryEN);

  if (session.blocks.length === 0) {
    lines.push("");
    lines.push(t(
      "No strength session today — focus on mobility / recovery.",
      "Engin styrktaræfing í dag — einbeitið ykkur að mobility / endurheimt.",
    ));
  } else {
    // Blocks
    for (const block of session.blocks) {
      lines.push("");
      lines.push(`▸ ${lang === "IS" ? block.titleIS : block.titleEN}`);
      const note = lang === "IS" ? (block.noteIS ?? block.noteEN) : (block.noteEN ?? block.noteIS);
      if (note) {
        // Trim block note for messaging (keeps body compact)
        const short = note.length > 140 ? note.slice(0, 137) + "…" : note;
        lines.push(`  ${short}`);
      }
      for (const ex of block.exercises) {
        const name = lang === "IS" ? ex.nameIS : ex.nameEN;
        const doseBits: string[] = [
          `${ex.dose.sets} × ${ex.dose.reps}`,
          ex.dose.intensity,
          `rest ${ex.dose.rest}`,
        ];
        if (ex.dose.intraRepRestSec) doseBits.push(`cluster ${ex.dose.intraRepRestSec}s`);
        if (ex.dose.velocityLossCap) doseBits.push(`stop @ −${ex.dose.velocityLossCap}%v`);
        lines.push(`  • ${name}  —  ${doseBits.join(" · ")}`);
        if (ex.dose.cue) lines.push(`      → ${ex.dose.cue}`);
        if (ex.modificationReason) {
          lines.push(`      ⚙ ${ex.modificationReason}`);
        }
      }
    }

    // Top-line audit (max 2 adaptations to keep message tight)
    if (session.appliedAdaptations.length > 0) {
      lines.push("");
      lines.push(t("Why these tweaks:", "Hvers vegna þessar breytingar:"));
      const topTwo = session.appliedAdaptations.slice(0, 2);
      for (const a of topTwo) {
        const trig = lang === "IS" ? a.triggerIS : a.triggerEN;
        const act = lang === "IS" ? a.actionIS : a.actionEN;
        lines.push(`  • ${trig} → ${act}`);
      }
      if (session.appliedAdaptations.length > 2) {
        const remaining = session.appliedAdaptations.length - 2;
        lines.push(t(
          `  (+${remaining} more — open the app to see all)`,
          `  (+${remaining} fleiri — opnaðu appið til að sjá öll)`,
        ));
      }
    }
  }

  // Footer
  lines.push("");
  lines.push("—".repeat(3));
  if (coachName) {
    lines.push(t(`Sent by ${coachName}`, `Sent af ${coachName}`));
  }
  lines.push(t(
    "Micro-dose by design — keep the load small, the quality high.",
    "Micro-dose by design — lítið magn, hágæða álag.",
  ));

  // Hard cap to ~1800 chars to leave headroom for coach notes
  const body = lines.join("\n");
  return body.length > 1800 ? body.slice(0, 1797) + "..." : body;
}
