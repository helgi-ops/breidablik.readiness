/**
 * Wyscout SportsCode XML → normalised time-stamped events (the fusion feed-1 ingester).
 *
 * This is the piece that was missing for the #2 flagship: the `peakPeriodContext` alignment engine
 * is feed-agnostic and already built; it just needed a real time-stamped event export mapped onto
 * its `MatchEvent` shape. Wyscout's "Download SportsCode XML" (player- or team-events) provides
 * exactly that — every action as an <instance> with a start/end time in SECONDS from match start.
 *
 * Verified against a real export (Breiðablik–Fram, 24 Aug 2026): player-events = 857 instances,
 * per-player <code> (e.g. "(9) O. Omarsson"), on-ball labels (Passes, Cross, Interceptions,
 * Accelerations, Recovery, duels …); team-events = 318 instances, <code>=team, tactical-phase labels
 * (Attacking/Defending style of play, Crosses, Shots …). Times 1→5710s (~95 min).
 *
 * Pure/IO-free: takes the already-decoded XML string (the upload handler decodes UTF-16 → string).
 * Descriptive tactical context only — never touches the readiness colour.
 */

export type SportscodeInstance = {
  id: string;
  startSec: number;   // seconds from match start (kickoff of period 1) — the alignment clock
  endSec: number;
  code: string;       // player (e.g. "(9) O. Omarsson") in player-events, or team in team-events
  labels: string[];   // event / tactical labels (usually one, e.g. "Passes", "Attacking style of play")
};

const num = (s: string | undefined): number => {
  const n = s == null ? NaN : Number(s.trim());
  return Number.isFinite(n) ? n : NaN;
};

/** Parse a Wyscout SportsCode XML string into normalised instances. Flat, dependency-free. */
export function parseSportscodeXml(xml: string): SportscodeInstance[] {
  if (!xml || typeof xml !== "string") return [];
  const out: SportscodeInstance[] = [];
  // Each action is one <instance> … </instance> block. The schema is flat and predictable.
  const blocks = xml.match(/<instance>[\s\S]*?<\/instance>/g);
  if (!blocks) return out;
  const pick = (block: string, tag: string): string | undefined => {
    const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    return m ? m[1] : undefined;
  };
  for (const b of blocks) {
    const startSec = num(pick(b, "start"));
    const endSec = num(pick(b, "end"));
    if (!Number.isFinite(startSec)) continue; // an instance with no time can't be aligned
    const code = (pick(b, "code") ?? "").trim();
    // Every <label><text>…</text></label> in the block (Wyscout usually emits one per instance).
    const labels: string[] = [];
    const labelBlocks = b.match(/<label>[\s\S]*?<\/label>/g) ?? [];
    for (const lb of labelBlocks) {
      const t = pick(lb, "text");
      if (t && t.trim()) labels.push(t.trim());
    }
    out.push({ id: (pick(b, "ID") ?? "").trim(), startSec, endSec: Number.isFinite(endSec) ? endSec : startSec, code, labels });
  }
  return out;
}

/** Decode a raw Wyscout XML buffer (SportsCode exports are UTF-16 with a BOM). */
export function decodeSportscodeBuffer(buf: Buffer): string {
  // UTF-16 LE/BE BOM, or NUL bytes early = UTF-16; else UTF-8.
  if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) {
    return buf.toString("utf16le").replace(/^﻿/, "");
  }
  if (buf.subarray(0, 40).includes(0x00)) return buf.toString("utf16le").replace(/^﻿/, "");
  return buf.toString("utf8").replace(/^﻿/, "");
}

export type WindowSummary = {
  windowStartSec: number;
  windowEndSec: number;
  actionCount: number;
  byLabel: Record<string, number>;
};

/**
 * The busiest fixed-length window for one subject (player code) — an event-density proxy for a
 * peak period until the Catapult physical peak-window feed (player_peak_window) is synced, at which
 * point pass that window's clock position instead. Returns the window + its tactical composition.
 */
export function busiestWindowFor(
  instances: SportscodeInstance[],
  subjectCode: string,
  windowSec = 180,
  stepSec = 30,
): WindowSummary | null {
  const his = instances.filter((i) => i.code === subjectCode).map((i) => i.startSec).sort((a, b) => a - b);
  if (his.length === 0) return null;
  const maxT = his[his.length - 1];
  let best: WindowSummary | null = null;
  for (let w0 = 0; w0 <= maxT; w0 += stepSec) {
    const inWin = instances.filter((i) => i.code === subjectCode && i.startSec >= w0 && i.startSec < w0 + windowSec);
    if (!best || inWin.length > best.actionCount) {
      const byLabel: Record<string, number> = {};
      for (const e of inWin) for (const l of e.labels) byLabel[l] = (byLabel[l] ?? 0) + 1;
      best = { windowStartSec: w0, windowEndSec: w0 + windowSec, actionCount: inWin.length, byLabel };
    }
  }
  return best;
}

/** Tactical labels (any code) active within a window — e.g. team style-of-play phases overlapping a peak. */
export function labelsInWindow(instances: SportscodeInstance[], startSec: number, endSec: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of instances) {
    if (i.startSec >= startSec && i.startSec < endSec) for (const l of i.labels) out[l] = (out[l] ?? 0) + 1;
  }
  return out;
}
