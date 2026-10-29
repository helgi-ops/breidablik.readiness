/**
 * Read the player / quarter / game-clock out of an InStat short-clip FILENAME (e.g.
 * "farhiya_abdi_-_1st_quarter_9_52_-_10_2.mp4"). Text only — this reads the file's name, never the
 * video — so an uploaded possession pre-fills its tag. Pure, no IO. Descriptive scouting.
 */

export type ScoutClipName = { player: string | null; period: string | null; clock: string | null };

const titleCase = (s: string) => s.split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

export function parseScoutClipFilename(name: string): ScoutClipName {
  const base = String(name ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/_+/g, " ").trim();
  if (!base) return { player: null, period: null, clock: null };

  // Quarter: "1st quarter", "q2", "2nd period", or a lone "3rd".
  const qm = base.match(/([1-4])\s*(?:st|nd|rd|th)\s*(?:quarter|qtr|period|q)\b/i)
    || base.match(/\bq\s*([1-4])\b/i)
    || base.match(/\b([1-4])(?:st|nd|rd|th)\b/i);
  const period = qm ? `Q${qm[1]}` : null;
  const qIdx = qm ? base.toLowerCase().indexOf(qm[0].toLowerCase()) : -1;

  // Player: the text before the quarter marker (or before the first number), minus separators.
  const headRaw = qIdx >= 0 ? base.slice(0, qIdx) : base;
  const head = headRaw.replace(/[-–—]+/g, " ").replace(/\d.*$/, "").replace(/\s+/g, " ").trim();
  const player = head ? titleCase(head) : null;

  // Clock: the first m:ss-ish time AFTER the quarter marker (InStat names the window start→end).
  const after = qIdx >= 0 ? base.slice(qIdx + (qm ? qm[0].length : 0)) : base;
  const tm = after.match(/(\d{1,2})[\s:.](\d{1,2})\b/);
  const clock = tm ? `${Number(tm[1])}:${tm[2].padStart(2, "0")}` : null;

  return { player, period, clock };
}
