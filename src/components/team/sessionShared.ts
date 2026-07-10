// Shared types, copy and helpers for the published team-session surfaces
// (the /team launcher card, the /player/sessions overview and the
// /player/sessions/[id] detail page). One source so they can never drift.

export type SessionDrill = {
  drill_id: string | null;
  drill_name: string;
  sets: number;
  category: string | null;
  diagram_url: string | null;
  description: string | null;
};

export type PublishedSession = {
  id: string;
  session_name: string;
  md_day: string | null;
  target_pl: number | null;
  items: SessionDrill[];
  totals: {
    duration_min?: number | null;
    distance_m?: number | null;
    player_load?: number | null;
    hir_total?: number | null;
  } | null;
  session_date: string | null;
  focus_points: string[] | null;
  published_at: string | null;
};

export const SessionCopy = {
  IS: {
    back: "Til baka",
    heading: "Æfingar liðsins",
    subtitle: "Birtar æfingar frá þjálfara",
    launcherOpen: "Opna æfingar",
    loading: "Hleð…",
    empty: "Engar birtar æfingar núna.",
    upcoming: "Væntanlegar",
    nextUp: "Næsta æfing",
    today: "Í dag",
    tomorrow: "Á morgun",
    noDate: "Án dagsetningar",
    focus: "Áherslur",
    drills: "Drillur",
    duration: "Lengd",
    distance: "Vegalengd",
    load: "PL",
    target: "Markmið",
    min: "mín",
    minShort: " mín",
    sets: "set",
    block: "blokk",
    noSessions: "Engar æfingar",
  },
  EN: {
    back: "Back",
    heading: "Team training",
    subtitle: "Published by your coach",
    launcherOpen: "Open sessions",
    loading: "Loading…",
    empty: "No published sessions right now.",
    upcoming: "Upcoming",
    nextUp: "Next session",
    today: "Today",
    tomorrow: "Tomorrow",
    noDate: "No date",
    focus: "Focus",
    drills: "Drills",
    duration: "Duration",
    distance: "Distance",
    load: "PL",
    target: "Target",
    min: "min",
    minShort: " min",
    sets: "sets",
    block: "block",
    noSessions: "No sessions",
  },
} as const;

// Widened so both the IS and EN literal objects (and their union) satisfy it.
export type SessionCopyT = { [K in keyof (typeof SessionCopy)["IS"]]: string };

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Human date label: Today / Tomorrow / No date / weekday + short date. */
export function dateLabel(sessionDate: string | null, locale: string, t: SessionCopyT): string {
  if (!sessionDate) return t.noDate;
  const now = new Date();
  const today = ymd(now);
  const tomorrow = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  if (sessionDate === today) return t.today;
  if (sessionDate === tomorrow) return t.tomorrow;
  const d = new Date(`${sessionDate}T00:00:00`);
  return d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
}

/** Compact stats used across the cards. */
export function sessionStats(s: PublishedSession): {
  drillCount: number;
  duration: number | null;
  targetPl: number | null;
  distance: number | null;
} {
  const drillCount = s.items?.length ?? 0;
  const duration = s.totals?.duration_min != null ? Math.round(s.totals.duration_min) : null;
  const targetPl = s.target_pl != null ? Math.round(s.target_pl) : null;
  const distance = s.totals?.distance_m != null ? Math.round(s.totals.distance_m) : null;
  return { drillCount, duration, targetPl, distance };
}
