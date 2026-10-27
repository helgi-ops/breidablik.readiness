/**
 * International-break calendar — A-national-team windows (FIFA football / FIBA basketball), Men & Women,
 * 2026–2027. During a window the domestic league usually pauses, but the ACTUAL break length varies by team
 * (some players leave for national duty, others keep training), so the coach decides their team's break
 * length when adding it. These windows are surfaced in the Periodization Hub; the coach turns a window into
 * a real `team_breaks` row (coach-set dates) which the macro/meso then treats as a break (re-load block +
 * OFF days).
 *
 * Source: FIFA international match calendar + FIBA qualifier windows (see the club's shared calendar). These
 * are A-team windows, NOT confirmed Icelandic-league pauses — treat as candidates the coach confirms.
 * Dates are inclusive (both the first and last day count), matching the source spreadsheet.
 */

export type IntlSport = "football" | "basketball";
export type IntlGender = "M" | "F";
export type IntlBreakKind = "window" | "tournament";

export type IntlBreak = {
  sport: IntlSport;
  gender: IntlGender;
  start: string;        // YYYY-MM-DD, inclusive
  end: string;          // YYYY-MM-DD, inclusive
  days: number;         // inclusive day count (both ends)
  body: "FIFA" | "FIBA";
  kind: IntlBreakKind;
  label: { en: string; is: string };
};

const WINDOW_LABEL = {
  FIFA: { en: "International window (FIFA)", is: "Landsleikjahlé (FIFA)" },
  FIBA: { en: "International window (FIBA)", is: "Landsleikjahlé (FIBA)" },
} as const;

// A-national-team windows (the main "Landsleikjagluggar" sheet). Ordered by start date.
export const INTERNATIONAL_BREAKS: IntlBreak[] = [
  { sport: "football",   gender: "M", start: "2026-11-09", end: "2026-11-17", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "basketball", gender: "F", start: "2026-11-08", end: "2026-11-18", days: 11, body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "basketball", gender: "M", start: "2026-11-23", end: "2026-12-01", days: 9,  body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "football",   gender: "F", start: "2026-11-24", end: "2026-12-05", days: 12, body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "basketball", gender: "F", start: "2027-02-07", end: "2027-02-17", days: 11, body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "basketball", gender: "M", start: "2027-02-22", end: "2027-03-02", days: 9,  body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "football",   gender: "F", start: "2027-02-23", end: "2027-03-06", days: 12, body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "M", start: "2027-03-22", end: "2027-03-30", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "F", start: "2027-04-13", end: "2027-04-24", days: 12, body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "M", start: "2027-06-07", end: "2027-06-15", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "F", start: "2027-06-07", end: "2027-06-15", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "M", start: "2027-09-20", end: "2027-10-05", days: 16, body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "football",   gender: "F", start: "2027-10-04", end: "2027-10-12", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "basketball", gender: "F", start: "2027-11-07", end: "2027-11-17", days: 11, body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "football",   gender: "M", start: "2027-11-08", end: "2027-11-16", days: 9,  body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  { sport: "basketball", gender: "M", start: "2027-11-22", end: "2027-11-30", days: 9,  body: "FIBA", kind: "window", label: WINDOW_LABEL.FIBA },
  { sport: "football",   gender: "F", start: "2027-11-23", end: "2027-12-04", days: 12, body: "FIFA", kind: "window", label: WINDOW_LABEL.FIFA },
  // Major tournaments 2027 — longer absences for the players involved (Stórmót sheet).
  { sport: "basketball", gender: "F", start: "2027-06-16", end: "2027-06-27", days: 12, body: "FIBA", kind: "tournament", label: { en: "Women's EuroBasket", is: "EM kvenna (körfubolti)" } },
  { sport: "football",   gender: "F", start: "2027-06-24", end: "2027-07-25", days: 32, body: "FIFA", kind: "tournament", label: { en: "Women's World Cup", is: "HM kvenna (fótbolti)" } },
  { sport: "basketball", gender: "M", start: "2027-08-27", end: "2027-09-12", days: 17, body: "FIBA", kind: "tournament", label: { en: "Men's World Cup", is: "HM karla (körfubolti)" } },
];

const normSport = (s: string | null | undefined): IntlSport | null => {
  const v = String(s ?? "").toLowerCase();
  return v === "football" ? "football" : v === "basketball" ? "basketball" : null;
};
const normGender = (g: string | null | undefined): IntlGender | null => {
  const v = String(g ?? "").trim().toUpperCase();
  return v === "M" ? "M" : v === "F" ? "F" : null;
};

/**
 * The international-break windows relevant to a team, upcoming from `fromIso` (inclusive end). Filters by
 * sport and, when known, gender; an unknown gender returns both so nothing is hidden. Sorted by start.
 */
export function upcomingInternationalBreaks(opts: {
  sport?: string | null;
  gender?: string | null;
  fromIso: string;
  untilIso?: string | null;
}): IntlBreak[] {
  const sport = normSport(opts.sport);
  const gender = normGender(opts.gender);
  const from = opts.fromIso.slice(0, 10);
  const until = opts.untilIso ? opts.untilIso.slice(0, 10) : null;
  return INTERNATIONAL_BREAKS.filter((b) =>
    (sport == null || b.sport === sport) &&
    (gender == null || b.gender === gender) &&
    b.end >= from &&
    (until == null || b.start <= until),
  ).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** A stable key for a window (sport-gender-start), used to track per-window edits / coverage in the UI. */
export const intlBreakKey = (b: IntlBreak): string => `${b.sport}-${b.gender}-${b.start}`;
