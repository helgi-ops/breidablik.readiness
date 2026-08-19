"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import TeamBreaksManager from "@/components/coach/TeamBreaksManager";
import ReadinessOutlookPanel from "@/components/coach/ReadinessOutlookPanel";
import { planSessionLoad } from "@/lib/micropulse/plannedSessionLoad";
import { parseMdOffset, mdOffsetForDate } from "@/lib/micropulse/readinessOutlook/assemble";
import type { PlannedDay } from "@/lib/micropulse/readinessOutlook";
import { usePlan } from "@/lib/micropulse/product";
import UpgradeWall from "@/components/micropulse/UpgradeWall";
import { type WeekType, coerceWeekType } from "@/lib/micropulse/weekSetup/weekType";
import { resolveTeamSport } from "@/lib/micropulse/weekSetup/resolveSport";
import { expectedWeekShape } from "@/lib/micropulse/weekSetup/gameDensity";
import type { SportId } from "@/lib/micropulse/sportProfiles";

// shadcn/ui
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type SeasonPhase = "preseason" | "inseason" | "playoffs" | "offseason";

const SEASON_PHASES: {
  id: SeasonPhase;
  label: string;
  sublabel: string;
  sublabelEN: string;
  icon: string;
  activeClass: string;
  baseClass: string;
}[] = [
  { id: "preseason",  label: "Preseason",            sublabel: "Undirbúningur",    sublabelEN: "Preparation",  icon: "🌱", activeClass: "border-amber-500 bg-amber-100 ring-1 ring-amber-400",   baseClass: "border-amber-200 bg-amber-50" },
  { id: "inseason",   label: "In-season",             sublabel: "Keppnistímabil",   sublabelEN: "Competition",  icon: "⚡", activeClass: "border-emerald-500 bg-emerald-100 ring-1 ring-emerald-400", baseClass: "border-emerald-200 bg-emerald-50" },
  { id: "playoffs",   label: "Playoffs",              sublabel: "Úrslitakeppni",    sublabelEN: "Playoffs",     icon: "🔥", activeClass: "border-red-500 bg-red-100 ring-1 ring-red-400",         baseClass: "border-red-200 bg-red-50" },
  { id: "offseason",  label: "Off-season",            sublabel: "Frítímabil",       sublabelEN: "Off-season",   icon: "🌙", activeClass: "border-slate-500 bg-slate-100 ring-1 ring-slate-400",   baseClass: "border-slate-200 bg-slate-50" },
];

type MatchInput = {
  match_id: string;
  date: string; // YYYY-MM-DD
  kickoff_time?: string;
  home_away?: "H" | "A";
};

type DayType = "TRAIN" | "RECOVERY" | "GAME" | "OFF";

// Manual intents for NO_MATCH week (coach editable)
type NoMatchIntent =
  | "FORCE_LIGHT"
  | "FORCE"
  | "NEURAL_VELOCITY"
  | "VELOCITY"
  | "POLISH_CALM"
  | "ACTIVATION"
  | "RECOVERY"
  | "RECOVERY_PLUS"
  | "GAME"
  | "OFF";

type WeekRow = {
  id: string;
  team_id?: string; // mikilvægt til að disambiguate-a
  week_start_date: string;
  week_type: WeekType;
  matches: MatchInput[];
  no_match_intents?: NoMatchIntent[];
};

const NO_MATCH_OPTIONS: { value: NoMatchIntent; label: string }[] = [
  { value: "FORCE_LIGHT", label: "Force (light) / MD-5" },
  { value: "FORCE", label: "Force / MD-4" },
  { value: "NEURAL_VELOCITY", label: "Neural / Velocity / MD-3" },
  { value: "VELOCITY", label: "Velocity / MD-2" },
  { value: "POLISH_CALM", label: "Polish / Calm / MD-2" },
  { value: "ACTIVATION", label: "Activation / MD-1" },
  { value: "RECOVERY", label: "Recovery / MD+1 & MD+2" },
  { value: "RECOVERY_PLUS", label: "Recovery / MD+3" },
  { value: "GAME", label: "Game / MD" },
  { value: "OFF", label: "Off" },
];

const DEFAULT_MATCHES: MatchInput[] = [
  { match_id: "M1", date: "", kickoff_time: "", home_away: "H" },
  { match_id: "M2", date: "", kickoff_time: "", home_away: "A" },
];

function isoMondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoMondayOfISO(yyyyMmDd: string) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  return isoMondayOf(d);
}

function addDays(yyyyMmDd: string, days: number) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  d.setDate(d.getDate() + days);
  // Format from LOCAL date parts (not toISOString, which is UTC and shifts the
  // date back a day in timezones ahead of UTC). Keeps this consistent with
  // isoMondayOf so the week grid labels the right calendar dates everywhere.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function diffDays(aYYYYMMDD: string, bYYYYMMDD: string) {
  const a = new Date(aYYYYMMDD + "T00:00:00");
  const b = new Date(bYYYYMMDD + "T00:00:00");
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// Keep only the dated matches that actually fall inside the viewed week,
// earliest first — the shared basis for both the MD label and the seed below.
function matchesInWeek(weekStart: string, weekEnd: string, matchDates: (string | undefined)[]): string[] {
  return matchDates
    .map((d) => (d || "").trim())
    .filter((d) => d && d >= weekStart && d <= weekEnd)
    .sort((a, b) => a.localeCompare(b));
}

// MD label for a given day relative to the nearest match in the week
// (e.g. "MD", "MD-4", "MD+1"). Null when there's no match to anchor to, so
// the manual grid only shows the chip on real match weeks.
function mdLabelForDay(weekStart: string, weekEnd: string, matchDates: (string | undefined)[], dayIndex: number): string | null {
  const inWeek = matchesInWeek(weekStart, weekEnd, matchDates);
  if (inWeek.length === 0) return null;
  const day = addDays(weekStart, dayIndex);
  if (inWeek.includes(day)) return "MD";
  const next = inWeek.find((m) => m > day);
  if (next) return `MD-${Math.abs(diffDays(day, next))}`;
  let prev: string | null = null;
  for (let i = inWeek.length - 1; i >= 0; i--) { if (inWeek[i] < day) { prev = inWeek[i]; break; } }
  if (prev) return `MD+${diffDays(day, prev)}`;
  return null;
}

// Seed the 7 daily intents from the match position so the editable grid starts
// anchored to the game — Force at MD-4, taper at MD-2/MD-1, GAME on match day,
// Recovery after — instead of the position-blind generic default. The coach can
// then tweak any day. Mirrors the auto-MD ordering in autoMdDayEdits so the two
// paths agree. Returns null when the week has no dated match.
function matchAnchoredIntents(weekStart: string, weekEnd: string, matchDates: (string | undefined)[]): NoMatchIntent[] | null {
  const inWeek = matchesInWeek(weekStart, weekEnd, matchDates);
  if (inWeek.length === 0) return null;
  const set = new Set(inWeek);
  const nextMatch = (day: string) => inWeek.find((m) => m > day) ?? null;
  const prevMatch = (day: string) => {
    for (let i = inWeek.length - 1; i >= 0; i--) if (inWeek[i] < day) return inWeek[i];
    return null;
  };
  return Array.from({ length: 7 }).map((_, i) => {
    const day = addDays(weekStart, i);
    if (set.has(day)) return "GAME";
    const next = nextMatch(day);
    if (next) {
      const md = Math.abs(diffDays(day, next));
      if (md >= 4) return (md - 4) % 2 === 0 ? "FORCE" : "NEURAL_VELOCITY"; // MD-4 force, MD-5 neural…
      if (md === 3) return "NEURAL_VELOCITY";
      if (md === 2) return "POLISH_CALM";
      if (md === 1) return "ACTIVATION";
    }
    const prev = prevMatch(day);
    if (prev && diffDays(day, prev) >= 1 && i !== 6) return "RECOVERY";
    return i === 6 ? "OFF" : "FORCE";
  }) as NoMatchIntent[];
}

function intentsEqualDefault(arr: NoMatchIntent[] | null | undefined): boolean {
  if (!Array.isArray(arr) || arr.length !== 7) return true; // absent/invalid = never customized
  const def = getDefaultNoMatchIntents();
  return arr.every((v, i) => v === def[i]);
}

// MD label helper: MD-4 and earlier (MD-5, MD-6...) alternate FORCE ↔ NEURAL
function preMatchMicrodoseFocus(mdMinus: number) {
  const k = mdMinus - 4; // 0..n from MD-4
  const isForce = k % 2 === 0; // MD-4 force, MD-5 neural, MD-6 force...
  return isForce ? `MD-${mdMinus} FORCE / RESTART` : `MD-${mdMinus} NEURAL / VELOCITY`;
}

// Detect week type from the number of fixtures in the week. THREE_MATCHES only
// applies to basketball (a week is defined by its game count 0–3); football
// keeps its existing 0/1/2 mapping exactly — three league games in a week stays
// TWO_MATCHES, so football behaviour is unchanged.
function detectWeekType(fixtureCount: number, isBasketball: boolean): WeekType {
  if (fixtureCount <= 0) return "NO_MATCH";
  if (fixtureCount === 1) return "ONE_MATCH";
  if (isBasketball && fixtureCount >= 3) return "THREE_MATCHES";
  return "TWO_MATCHES";
}

function intentToDayType(i: NoMatchIntent): DayType {
  if (i === "OFF") return "OFF";
  if (i === "GAME") return "GAME"; // ✅ NEW
  if (i === "RECOVERY" || i === "RECOVERY_PLUS") return "RECOVERY"; // MD+3 is a recovery day like MD+2
  return "TRAIN"; // FORCE_LIGHT (MD-5) is a (lighter) training day
}

function intentToFocusLabel(i: NoMatchIntent): string {
  // The MD-5 / MD+3 labels carry the md-day token so v_player_today_microdose_final
  // pins them directly (a manual pick wins over the fixtures-based derivation).
  if (i === "FORCE_LIGHT") return "MD-5 FORCE (LIGHT)";
  if (i === "FORCE") return "FORCE";
  if (i === "NEURAL_VELOCITY") return "NEURAL / VELOCITY";
  if (i === "VELOCITY") return "VELOCITY";
  if (i === "POLISH_CALM") return "POLISH / CALM";
  if (i === "ACTIVATION") return "ACTIVATION";
  if (i === "RECOVERY") return "RECOVERY";
  if (i === "RECOVERY_PLUS") return "MD+3 RECOVERY";
  if (i === "GAME") return "GAME"; // ✅ NEW
  return "OFF";
}

function getDefaultNoMatchIntents(): NoMatchIntent[] {
  return ["FORCE", "NEURAL_VELOCITY", "RECOVERY", "ACTIVATION", "POLISH_CALM", "RECOVERY", "OFF"];
}

const WEEKDAYS_SHORT = ["Mán", "Þri", "Mið", "Fim", "Fös", "Lau", "Sun"];

export default function WeekSetupPage() {
  const { isAtLeastPro } = usePlan();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => isoMondayOf(new Date()));
  const [weekType, setWeekType] = useState<WeekType>("NO_MATCH");
  const [seasonPhase, setSeasonPhase] = useState<SeasonPhase | null>(null);
  const [matches, setMatches] = useState<MatchInput[]>(DEFAULT_MATCHES);
  // Provenance when the match day was auto-detected from the Fixtures schedule
  // (match_schedule) rather than typed manually. Cleared once a saved Week Setup
  // exists for the week (the coach's own data takes over).
  const [scheduleNote, setScheduleNote] = useState<string | null>(null);

  const [intensityTarget, setIntensityTarget] = useState<number>(6);
  // Opponent (+ context) per fixture date, read from match_schedule — display-only,
  // powers the "vs FH" match cards and the provenance pill. Never saved.
  const [matchOpponents, setMatchOpponents] = useState<Record<string, string>>({});
  const [teamId, setTeamId] = useState<string | null>(null);
  // Team sport — drives the game-density week model (basketball) vs the MD-day
  // model (football). Defaults to football so an unknown team behaves as before.
  const [sport, setSport] = useState<SportId>("football");
  const isBasketball = sport === "basketball";

  const [noMatchIntents, setNoMatchIntents] = useState<NoMatchIntent[]>(getDefaultNoMatchIntents());
  // Declared team breaks (read-only here) — days inside a break are auto-locked
  // as "Frí" in the daily grid so you can't schedule training on a break day.
  const [teamBreaks, setTeamBreaks] = useState<Array<{ start_date: string; end_date: string }>>([]);
  const isDateOnBreak = (dateIso: string) =>
    teamBreaks.some((b) => b.start_date <= dateIso && dateIso <= b.end_date);
  const [lang] = useLang();
  const isIS = lang === "IS";
  const weekdaysShort = isIS ? WEEKDAYS_SHORT : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const t = isIS ? {
    subtitle: "Stilltu vikuna. Kerfið sendir leikmönnum réttan æfingadag.",
    week: "Vika", done: "✓ Lokið", error: "Villa",
    step1: "Skref 1 — Vikugerð", step1desc: "Veldu vikudagsetningu og hvort það séu leikir í vikunni.",
    weekTypePill: "Vikugerð", setupPill: "Uppsetning",
    teamIdHint: "Ef þetta er tómt: þá er coach ekki tengdur liði í profiles/coach_teams.",
    weekStart: "Vikuupphaf (mánudagur)", season: "Tímabil", weekType: "Vikugerð",
    noMatch: "Enginn leikur", oneMatch: "1 leikur", twoMatches: "2 leikir", threeMatches: "3 leikir",
    fromSchedule: "Sótt sjálfkrafa úr Leikjadagatali:",
    fromScheduleHint: "Þú getur samt breytt vikugerð eða leikupplýsingum að neðan.",
    manualTitle: "Leyfa handvirka vikugerð (eins og NO_MATCH)",
    manualDesc: "Gott í preseason: þú stýrir dag-til-dags áherslum þó það séu 1–2 leikir.",
    next: "Næsta →", back: "← Til baka",
    step2: "Skref 2 — Uppsetning",
    manualCtrl: "Manual vikustýring", autoOrder: "Auto MD röðun",
    step2manual: "Manual vikustýring: veldu áherslu per dag (virkar líka þó 1–2 leikir).",
    step2auto: "Auto MD: settu inn dagsetningar (kerfið sér um MD röðun).",
    match: "Leikur", date: "Dagsetning", kickoff: "Byrjunartími (valfrjáls)", home: "Heimavöllur", away: "Leikavöllur",
    dailyIntent: "Dagleg áhersla (mán → sun)", reset: "Endurstilla", fillFromMatch: "Fylla út frá leik (MD)",
    autoActive: "Auto MD er virkt. Ef þú vilt handvirkt eins og preseason: settu Manual override á ON í Skrefi 1.",
    intensityHint: "1 = mjög létt · 10 = mjög erfitt",
    step3: "Skref 3 — Yfirlit & Virkja", step3desc: "Svona mun vikan líta út fyrir leikmenn (þetta er það sem verður sent).",
    microTitle: "Microcycle yfirferð", microOk: "✓ Í lagi", microNote: "ábending",
    microDesc: "Sjálfvirk yfirferð á vikuhringnum út frá rannsóknum (Buchheit o.fl. 2024). Ábendingar, ekki hindrun.",
    microNone: "Vikuhringurinn fylgir helstu microcycle-reglum — engin ábending.",
    saving: "Vista...", loadingW: "Hleður...", saveWeek: "Vista viku",
    applying: "Virkjar...", activate: "Virkja → senda leikmönnum",
    manualWeek: "Manual vika", autoWeek: "Auto MD vika", editSetup: "← Breyta uppsetningu",
  } : {
    subtitle: "Set up the week. The system sends each player the right training day.",
    week: "Week", done: "✓ Done", error: "Error",
    step1: "Step 1 — Week type", step1desc: "Choose the week's dates and whether there are matches this week.",
    weekTypePill: "Week type", setupPill: "Setup",
    teamIdHint: "If this is empty, the coach isn't linked to a team in profiles/coach_teams.",
    weekStart: "Week start (Monday)", season: "Season", weekType: "Week type",
    noMatch: "No match", oneMatch: "1 match", twoMatches: "2 matches", threeMatches: "3 games",
    fromSchedule: "Auto-detected from Fixtures:",
    fromScheduleHint: "You can still change the week type or match details below.",
    manualTitle: "Allow manual week setup (like NO_MATCH)",
    manualDesc: "Good in preseason: you control day-to-day intent even with 1–2 matches.",
    next: "Next →", back: "← Back",
    step2: "Step 2 — Setup",
    manualCtrl: "Manual week control", autoOrder: "Auto MD ordering",
    step2manual: "Manual week control: pick the intent per day (works even with 1–2 matches).",
    step2auto: "Auto MD: enter the match dates (the system handles MD ordering).",
    match: "Match", date: "Date", kickoff: "Kickoff time (optional)", home: "Home", away: "Away",
    dailyIntent: "Daily intent (Mon → Sun)", reset: "Reset", fillFromMatch: "Fill from match (MD)",
    autoActive: "Auto MD is active. For manual control like preseason: set Manual override to ON in Step 1.",
    intensityHint: "1 = very light · 10 = very hard",
    step3: "Step 3 — Review & Activate", step3desc: "This is how the week will look for players (this is what gets sent).",
    microTitle: "Microcycle review", microOk: "✓ OK", microNote: "note",
    microDesc: "Automatic review of the microcycle from research (Buchheit et al. 2024). Suggestions, not blocks.",
    microNone: "The microcycle follows the main principles — no notes.",
    saving: "Saving...", loadingW: "Loading...", saveWeek: "Save week",
    applying: "Activating...", activate: "Activate → send to players",
    manualWeek: "Manual week", autoWeek: "Auto MD week", editSetup: "← Edit setup",
  };

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const visibleMatches = useMemo(() => {
    if (weekType === "ONE_MATCH") return [matches[0] ?? DEFAULT_MATCHES[0]];
    // THREE_MATCHES (basketball) reuses the two editable slots — the exact third
    // kickoff isn't needed for the sRPE-driven basketball model; the game-count
    // shape guidance is what matters.
    if (weekType === "TWO_MATCHES" || weekType === "THREE_MATCHES")
      return [matches[0] ?? DEFAULT_MATCHES[0], matches[1] ?? DEFAULT_MATCHES[1]];
    return [];
  }, [weekType, matches]);

  // The week grid is always directly editable now (the wizard + manual-override
  // toggle are gone): the MD ordering is only the seed for the daily intents, and
  // the coach can change any day. So the "manual week" path is always taken — the
  // preview and apply always read the editable grid (manualNoMatchDayEdits).
  const isManualWeek = true;

  // Is there a dated match inside the viewed week? Gates the MD chips + the
  // "Fill from match" seed button in the manual grid.
  // 1) LOAD TEAM ID (robust)
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data: uRes, error: uErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (uErr || !uRes.user) {
        setTeamId(null);
        return;
      }

      const uid = uRes.user.id;

      // Try profiles first
      const { data: prof } = await supabase
        .from("profiles")
        .select("team_id, id, user_id")
        .or(`id.eq.${uid},user_id.eq.${uid}`)
        .maybeSingle();

      if (!alive) return;

      const profTid = (prof?.team_id ?? "").toString().trim();
      if (profTid) {
        setTeamId(profTid);
        return;
      }

      // Fallback: coach_teams
      const { data: ct } = await supabase
        .from("coach_teams")
        .select("team_id,is_primary")
        .eq("coach_id", uid)
        .order("is_primary", { ascending: false })
        .limit(1);

      if (!alive) return;

      const ctTid = (ct?.[0]?.team_id ?? "").toString().trim();
      if (ctTid) {
        setTeamId(ctTid);
        return;
      }

      setTeamId(null);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Resolve the team's sport once we know the team (team-level source only).
  useEffect(() => {
    let alive = true;
    (async () => {
      const s = teamId ? await resolveTeamSport(supabase, teamId) : "football";
      if (alive) setSport(s);
    })();
    return () => { alive = false; };
  }, [teamId]);

  // 2) LOAD WEEK SETUP (filter by team_id + week_start_date)
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      const tid = (teamId ?? "").trim();

      // Ekki sækja fyrr en teamId er komið
      if (!tid) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setOk(null);

      const { data, error } = await supabase
        .from("coach_week_setup")
        .select("id, team_id, week_start_date, week_type, matches, no_match_intents, season_phase")
        .eq("team_id", tid)
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // Fixtures (match_schedule) are the SOURCE OF TRUTH for the week's games —
      // always read them for the viewed week, so a game the coach enters later
      // still surfaces even on a week that was already saved. (Before, this read
      // only ran when NO saved row existed, so any fixture added after the week
      // was saved was silently hidden.)
      const weekEndISO = addDays(weekStart, 6);
      const { data: sched } = await supabase
        .from("match_schedule")
        .select("match_date, opponent, is_home, kickoff_time")
        .eq("team_id", tid)
        .gte("match_date", weekStart)
        .lte("match_date", weekEndISO)
        .order("match_date", { ascending: true });
      if (!alive) return;
      const found = (sched ?? []) as Array<{ match_date: string; opponent: string | null; is_home: boolean | null; kickoff_time: string | null }>;
      const schedPicks = found.slice(0, 2);
      const toInput = (p: (typeof found)[number], id: string): MatchInput => ({
        match_id: id,
        date: p.match_date,
        kickoff_time: p.kickoff_time ? p.kickoff_time.slice(0, 5) : "",
        home_away: p.is_home === false ? "A" : "H",
      });
      const schedMatches: MatchInput[] = [
        schedPicks[0] ? toInput(schedPicks[0], "M1") : DEFAULT_MATCHES[0],
        schedPicks[1] ? toInput(schedPicks[1], "M2") : DEFAULT_MATCHES[1],
      ];
      const schedNote = schedPicks.length
        ? schedPicks.map((p) => `${p.match_date}${p.opponent ? ` — ${p.opponent}` : ""} (${p.is_home === false ? "A" : "H"})`).join(" · ")
        : null;
      // Opponent lookup for the match cards + provenance pill (display-only).
      setMatchOpponents(Object.fromEntries(found.map((f) => [f.match_date, (f.opponent ?? "").trim()])));

      if (data) {
        const row = data as WeekRow;
        const wt = coerceWeekType((row as any).week_type);

        // ✅ alltaf hlaða no_match_intents ef til (því við viljum manual override líka á match vikum)
        const rawIntents = (data as { no_match_intents?: unknown }).no_match_intents;
        const savedIntents: NoMatchIntent[] | null =
          Array.isArray(rawIntents) && rawIntents.length === 7 ? (rawIntents as NoMatchIntent[]) : null;

        // Hlaða season_phase
        const sp = (data as any)?.season_phase;
        const validPhases: SeasonPhase[] = ["preseason", "inseason", "playoffs", "offseason"];
        setSeasonPhase(validPhases.includes(sp) ? (sp as SeasonPhase) : null);

        const savedMatches = row.matches ?? [];
        const savedHasRealMatch = savedMatches.some((m) => (m?.date || "").trim() !== "");

        if (!savedHasRealMatch && found.length > 0) {
          // The week was saved WITHOUT a dated match, but the Fixtures schedule now
          // has one → adopt it (prefill) instead of showing a stale empty week, and
          // seed the daily intents from where the game falls (no coach plan to keep).
          setWeekType(detectWeekType(found.length, isBasketball));
          setMatches(schedMatches);
          setScheduleNote(schedNote);
          setNoMatchIntents(
            matchAnchoredIntents(weekStart, weekEndISO, found.map((f) => f.match_date)) ?? getDefaultNoMatchIntents()
          );
        } else {
          // The coach's saved matches are the source for this week.
          setWeekType(wt);
          const safeMatches = savedMatches.length > 0 ? savedMatches : DEFAULT_MATCHES;
          const m0 = safeMatches[0] ?? DEFAULT_MATCHES[0];
          const m1 = safeMatches[1] ?? DEFAULT_MATCHES[1];
          setMatches([
            { match_id: (m0.match_id || "M1").trim(), date: (m0.date || "").trim(), kickoff_time: (m0.kickoff_time || "").trim(), home_away: (m0.home_away as any) || "H" },
            { match_id: (m1.match_id || "M2").trim(), date: (m1.date || "").trim(), kickoff_time: (m1.kickoff_time || "").trim(), home_away: (m1.home_away as any) || "A" },
          ]);
          setScheduleNote(null);

          // Anchor the editable daily grid to the match ONLY when the coach hasn't
          // customized it (saved intents absent or still the generic default). A
          // real custom plan the coach saved always wins — never overwrite it.
          const anchored = savedHasRealMatch
            ? matchAnchoredIntents(weekStart, weekEndISO, savedMatches.map((m) => m?.date))
            : null;
          setNoMatchIntents(
            anchored && intentsEqualDefault(savedIntents)
              ? anchored
              : savedIntents ?? getDefaultNoMatchIntents()
          );
        }
      } else {
        // No saved Week Setup for this week yet → auto-detect the match day from
        // the Fixtures schedule. Prefilled (not locked) so the coach keeps control.
        if (found.length === 0) {
          setNoMatchIntents(getDefaultNoMatchIntents());
          setWeekType("NO_MATCH");
          setMatches(DEFAULT_MATCHES);
          setScheduleNote(null);
        } else {
          setWeekType(detectWeekType(found.length, isBasketball));
          setMatches(schedMatches);
          setScheduleNote(schedNote);
          // Seed the editable daily grid from where the game falls.
          setNoMatchIntents(
            matchAnchoredIntents(weekStart, weekEndISO, found.map((f) => f.match_date)) ?? getDefaultNoMatchIntents()
          );
        }
      }

      setLoading(false);
    }

    void loadWeek();
    return () => {
      alive = false;
    };
  }, [weekStart, teamId, isBasketball]);

  // On first open, if the CURRENT week has no fixture, land on the next week that
  // does — so a coach opening Week Setup on a match-less day (e.g. Sunday, current
  // week already played) starts on the week they actually need to plan, with its
  // game pulled straight from the Fixtures schedule. Runs once; the coach can page
  // back freely afterwards.
  const didAutoNavRef = useRef(false);
  useEffect(() => {
    const tid = (teamId ?? "").trim();
    if (!tid || didAutoNavRef.current) return;
    didAutoNavRef.current = true;
    let alive = true;
    void (async () => {
      const curMon = isoMondayOf(new Date());
      const curEnd = addDays(curMon, 6);
      // Does the current week already have a fixture? If so, stay put.
      const { data: cur } = await supabase
        .from("match_schedule").select("match_date").eq("team_id", tid)
        .gte("match_date", curMon).lte("match_date", curEnd).limit(1);
      if (!alive || (cur?.length ?? 0) > 0) return;
      // No game this week → jump to the next week that has one.
      const { data: next } = await supabase
        .from("match_schedule").select("match_date").eq("team_id", tid)
        .gt("match_date", curEnd).order("match_date", { ascending: true }).limit(1);
      if (!alive) return;
      const nextDate = (next?.[0] as { match_date?: string } | undefined)?.match_date;
      if (nextDate) setWeekStart(isoMondayOfISO(nextDate));
    })();
    return () => { alive = false; };
  }, [teamId]);

  // Load declared team breaks for the grid lock.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch(`/api/coach/team/breaks?team_id=${encodeURIComponent(teamId)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (alive && json.ok) {
          setTeamBreaks(((json.breaks ?? []) as Array<{ start_date: string; end_date: string }>)
            .map((b) => ({ start_date: b.start_date, end_date: b.end_date })));
        }
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [teamId]);

  function setMatch(i: number, patch: Partial<MatchInput>) {
    if (patch.date && patch.date.trim()) {
      const matchMonday = isoMondayOfISO(patch.date.trim());
      if (matchMonday !== weekStart) setWeekStart(matchMonday);
    }
    setMatches((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  async function handleSave(): Promise<boolean> {
    setSaving(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError(isIS ? "Vantar team_id (coach er ekki tengdur liði)." : "Missing team_id (coach not linked to a team).");
      setSaving(false);
      return false;
    }

    const trimmed =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches.map((m, idx) => ({
            match_id: (m.match_id || `M${idx + 1}`).trim(),
            date: (m.date || "").trim(),
            kickoff_time: (m.kickoff_time || "").trim() || undefined,
            home_away: (m.home_away || "H") as "H" | "A",
          }));

    // ✅ ALDREI null í no_match_intents (DB column er NOT NULL)
    // ✅ Vista alltaf, líka á match vikum (til að manual override virki í preseason)
    const baseIntents: NoMatchIntent[] =
      Array.isArray(noMatchIntents) && noMatchIntents.length === 7
        ? noMatchIntents
        : getDefaultNoMatchIntents();
    // Declared break days are always OFF — the break owns them, so we never
    // save a training day on a break day even if the picker had a stale value.
    const safeNoMatchIntents: NoMatchIntent[] = baseIntents.map((intent, i) =>
      isDateOnBreak(addDays(weekStart, i)) ? "OFF" : intent
    );

    const { error } = await supabase.rpc("save_week_setup", {
      p_team_id: tid,
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed, // jsonb
      p_no_match_intents: safeNoMatchIntents, // ✅ alltaf 7 stök
      p_season_phase: seasonPhase ?? null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return false;
    }

    setOk(isIS ? "Vikan var vistuð ✅" : "Week saved ✅");
    setSaving(false);
    return true;
  }

  const autoMdDayEdits = useMemo(() => {
    const matchInWeek =
      weekType === "NO_MATCH"
        ? []
        : visibleMatches
            .map((m, idx) => ({
              idx,
              id: (m.match_id || `M${idx + 1}`).trim(),
              date: (m.date || "").trim(),
            }))
            .filter((m) => !!m.date)
            .filter((m) => m.date >= weekStart && m.date <= weekEnd)
            .sort((a, b) => a.date.localeCompare(b.date));

    if (weekType === "NO_MATCH" || matchInWeek.length === 0) return [];

    const matchDatesSet = new Set(matchInWeek.map((m) => m.date));

    function nextMatchDate(day_date: string) {
      return matchInWeek.find((m) => m.date > day_date)?.date ?? null;
    }

    function prevMatchDate(day_date: string) {
      for (let i = matchInWeek.length - 1; i >= 0; i--) {
        if (matchInWeek[i].date < day_date) return matchInWeek[i].date;
      }
      return null;
    }

    function postMatchFocus(mdPlus: number) {
      if (mdPlus === 1) return "MD+1 POST MATCH";
      return `MD+${mdPlus} RECOVERY`;
    }

    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const day_date = addDays(weekStart, i);

      let day_type: DayType = day_index === 7 ? "OFF" : "TRAIN";
      let focus: string | null = day_type === "OFF" ? "OFF" : "TRAIN";
      let notes: string | null = null;

      if (matchDatesSet.has(day_date)) {
        day_type = "GAME";
        focus = "MD (GAME)";
        notes = "Match day (within week)";
        return { day_index, day_type, focus, notes };
      }

      const next = nextMatchDate(day_date);
      if (next) {
        const delta = diffDays(day_date, next);
        const mdMinus = Math.abs(delta);

        if (mdMinus >= 4)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: preMatchMicrodoseFocus(mdMinus),
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 3)
          return {
            day_index,
            day_type: "TRAIN" as DayType,
            focus: "MD-3 NEURAL / VELOCITY",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 2)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-2 POLISH / CALM",
            notes: `Upcoming match: ${next}`,
          };
        if (mdMinus === 1)
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: "MD-1 ACTIVATION",
            notes: `Upcoming match: ${next}`,
          };
      }

      const prev = prevMatchDate(day_date);
      if (prev) {
        const deltaPlus = diffDays(day_date, prev);
        if (deltaPlus >= 1 && day_index !== 7) {
          return {
            day_index,
            day_type: "RECOVERY" as DayType,
            focus: postMatchFocus(deltaPlus),
            notes: `Previous match: ${prev}`,
          };
        }
      }

      return { day_index, day_type, focus, notes };
    });
  }, [visibleMatches, weekStart, weekEnd, weekType]);

  const manualNoMatchDayEdits = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const day_index = i + 1;
      const intent = noMatchIntents[i] ?? "OFF";
      return {
        day_index,
        day_type: intentToDayType(intent),
        focus: intentToFocusLabel(intent),
        notes: "Manual week (coach)",
      };
    });
  }, [noMatchIntents]);

  const previewDays = useMemo(() => {
    // ✅ PRESEASON / manual override: alltaf manual preview
    if (isManualWeek) return manualNoMatchDayEdits;
    return autoMdDayEdits;
  }, [isManualWeek, manualNoMatchDayEdits, autoMdDayEdits]);

  // Live plan → Readiness Outlook: each grid day becomes a PlannedDay (date + MD offset +
  // the intent's planned session load). Recomputes as the coach edits, so the forecast
  // reflects the UNSAVED plan. Empty (e.g. NO_MATCH auto weeks) → panel uses the saved plan.
  const outlookPlannedDays = useMemo<PlannedDay[]>(() => {
    const mds = visibleMatches.map((m) => m.date).filter((d): d is string => !!d);
    return previewDays.map((d, i) => {
      const date = addDays(weekStart, i);
      const mdLabel = mdLabelForDay(weekStart, weekEnd, mds, i);
      const mdOffset = parseMdOffset(mdLabel) ?? mdOffsetForDate(date, mds);
      const plan = planSessionLoad({ mdDay: mdLabel, dayType: d.day_type, focus: d.focus });
      return { date, mdOffset, plannedLoad: plan.applicable ? plan.sessionLoad : 0, mdLabel: mdLabel ?? undefined };
    });
  }, [previewDays, weekStart, weekEnd, visibleMatches]);

  // Microcycle checks — evidence-informed periodization principles
  // (Buchheit et al. 2024, "The 11 Principles of Microcycle Periodization").
  // Each check reads the resolved 7-day previewDays array and flags a
  // planned week that drifts from the evidence. Decision-support, not a block.
  const microcycleChecks = useMemo<{ id: string; tone: "warn" | "info"; title: string; body: string }[]>(() => {
    const days = previewDays;
    const checks: { id: string; tone: "warn" | "info"; title: string; body: string }[] = [];
    const gameIdx: number[] = [];
    days.forEach((d, i) => { if (d.day_type === "GAME") gameIdx.push(i); });

    // A "hard" training day = acquisition-phase intensity (force / speed / neural).
    const isHardFocus = (focus: string | null | undefined) => {
      const f = String(focus ?? "").toUpperCase();
      return f.includes("FORCE") || f.includes("VELOCITY") || f.includes("NEURAL");
    };

    // 1. Rest day at MD+1 — Buchheit 2023: a day off at MD+2 is associated
    //    with a substantially lower non-contact injury rate (Principle 2).
    for (const g of gameIdx) {
      if (days[g + 1]?.day_type === "OFF" &&
          (days[g + 2]?.day_type === "TRAIN" || days[g + 2]?.day_type === "RECOVERY")) {
        checks.push({
          id: "rest-md2", tone: "warn",
          title: isIS ? "Hvíldardagur á MD+1" : "Rest day at MD+1",
          body: isIS
            ? "Frídagurinn er daginn eftir leik. Rannsóknir (Buchheit o.fl. 2023, 56 lið-tímabil) tengja frídag á MD+2 við marktækt lægri tíðni álagsmeiðsla — hópurinn mætir ferskari í fyrstu hörðu æfinguna. Íhugaðu að færa frídaginn á MD+2. (Regla 2)"
            : "The rest day is the day after the match. Research (Buchheit et al. 2023, 56 team-seasons) links a day off at MD+2 with a markedly lower overuse-injury rate — the squad turns up fresher to the first hard session. Consider moving the rest day to MD+2. (Principle 2)",
        });
        break;
      }
    }

    // 2. No day off at all — at least one rest day per week; injury risk
    //    rises beyond ~5-6 consecutive days on feet (Principle 1/2).
    if (!days.some((d) => d.day_type === "OFF")) {
      checks.push({
        id: "no-off", tone: "warn",
        title: isIS ? "Enginn frídagur í vikunni" : "No rest day this week",
        body: isIS
          ? "Vikan inniheldur engan frídag. Meiðslatíðni hækkar eftir 5-6 samfellda daga á fótum — rannsóknir mæla með a.m.k. einum frídegi í hverri viku. (Regla 1/2)"
          : "The week has no rest day. Injury rate rises after 5-6 consecutive days on feet — research recommends at least one rest day each week. (Principle 1/2)",
      });
    }

    // 3. Hard day in the taper — MD-2 and MD-1 should be light (Principle 8).
    for (const g of gameIdx) {
      const md1 = days[g - 1];
      const md2 = days[g - 2];
      const md1Hard = !!md1 && md1.day_type === "TRAIN" && isHardFocus(md1.focus);
      const md2Hard = !!md2 && md2.day_type === "TRAIN" && isHardFocus(md2.focus);
      if (md1Hard || md2Hard) {
        checks.push({
          id: "taper", tone: "warn",
          title: isIS ? "Þung æfing í niðurtröppun" : "Hard session in the taper",
          body: isIS
            ? `${md1Hard ? "MD-1" : "MD-2"} er ákefðar-/kraftæfing. Síðustu 1-2 dagar fyrir leik eiga að vera léttir (polish / activation) — þung vinna svo nálægt leik er tengd hærri meiðslaáhættu og lakari leikdags-ferskleika. (Regla 8)`
            : `${md1Hard ? "MD-1" : "MD-2"} is an intensity/power session. The last 1-2 days before a match should be light (polish / activation) — heavy work this close to a match is linked to higher injury risk and poorer match-day freshness. (Principle 8)`,
        });
        break;
      }
    }

    // 4. Heavy strength/eccentric late post-match — eccentric work belongs
    //    early in the microcycle (MD-4), not MD+3 (Principle 7).
    for (const g of gameIdx) {
      const md3 = days[g + 3];
      if (md3 && md3.day_type === "TRAIN" && String(md3.focus ?? "").toUpperCase().includes("FORCE")) {
        checks.push({
          id: "ecc-late", tone: "info",
          title: isIS ? "Styrktaráhersla seint eftir leik" : "Heavy strength late after a match",
          body: isIS
            ? "Þung kraft-/eccentric-vinna er sett á MD+3. Eccentric æfingar seint eftir leik gefa viðvarandi vöðvaskemmd (hækkað CK) og eymsli — best er að staðsetja þær snemma í vikunni (MD-4). (Regla 7)"
            : "Heavy strength / eccentric work is placed at MD+3. Eccentric sessions late after a match cause prolonged muscle damage (elevated CK) and soreness — best placed early in the week (MD-4). (Principle 7)",
        });
        break;
      }
    }

    return checks;
  }, [previewDays, isIS]);

  async function handleApplyPlan() {
    setApplying(true);
    setError(null);
    setOk(null);

    const tid = (teamId ?? "").trim();
    if (!tid) {
      setError(isIS ? "Vantar team_id. Sláðu inn Team ID (uuid)." : "Missing team_id. Enter the Team ID (uuid).");
      setApplying(false);
      return;
    }

    // ✅ Ef manual override er OFF og þetta er match vika → validate match dates
    if (!isManualWeek && weekType !== "NO_MATCH") {
      const m1 = (visibleMatches[0]?.date || "").trim();
      if (!m1) {
        setError("Veldu match date fyrir M1.");
        setApplying(false);
        return;
      }
      if (weekType === "TWO_MATCHES") {
        const m2 = (visibleMatches[1]?.date || "").trim();
        if (!m2) {
          setError("Veldu match date fyrir M2.");
          setApplying(false);
          return;
        }
      }
    }

    const saved = await handleSave();
    if (!saved) {
      setApplying(false);
      return;
    }

    const res = await fetch("/api/coach/week-setup/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: tid,
        week_start: weekStart,
        system_key: "MICRODOSING_PLAYBOOK",
        intensity_target: intensityTarget,
        notes: isManualWeek ? `Manual override ON · WeekType=${weekType}` : `Auto MD ON · WeekType=${weekType}`,
        days: previewDays,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(payload?.error || "Apply failed.");
      setApplying(false);
      return;
    }

    setOk(isIS ? "Vika var virkjuð ✅ Leikmenn fá nú réttan æfingadag sendan." : "Week activated ✅ Players now receive the right training day.");
    setApplying(false);
  }

  if (!isAtLeastPro) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4 md:p-6">
        <UpgradeWall
          requiredPlan="PRO"
          featureName={{ EN: "Week setup", IS: "Vikuuppsetning" }}
          description={{
            EN: "Set up the training week, assign match days, and configure session intent for each day.",
            IS: "Settu upp æfingavikuna, merktu leikdaga og stilltu álagsáherslu hvers dags.",
          }}
        />
      </div>
    );
  }

  // ── Single-page render helpers ──────────────────────────────────────────
  const monthsIS = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];
  const monthsEN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const months = isIS ? monthsIS : monthsEN;
  const dS = new Date(weekStart + "T00:00:00");
  const dE = new Date(weekEnd + "T00:00:00");
  const weekLabel = dS.getMonth() === dE.getMonth()
    ? `${dS.getDate()}.–${dE.getDate()}. ${months[dE.getMonth()]} ${dE.getFullYear()}`
    : `${dS.getDate()}. ${months[dS.getMonth()]}–${dE.getDate()}. ${months[dE.getMonth()]} ${dE.getFullYear()}`;

  const archivo = { fontFamily: "var(--font-archivo)" } as const;
  const inWeekMatchDates = matchesInWeek(weekStart, weekEnd, visibleMatches.map((m) => m.date));
  const matchIdxForDate = (dateIso: string) => matches.findIndex((m) => (m.date || "").trim() === dateIso);

  const weekTypeLabel = weekType === "NO_MATCH" ? t.noMatch : weekType === "ONE_MATCH" ? t.oneMatch : weekType === "THREE_MATCHES" ? t.threeMatches : t.twoMatches;
  const weekTypePills: { key: WeekType; label: string }[] = [
    { key: "NO_MATCH", label: t.noMatch },
    { key: "ONE_MATCH", label: t.oneMatch },
    { key: "TWO_MATCHES", label: t.twoMatches },
    ...(isBasketball ? ([{ key: "THREE_MATCHES", label: t.threeMatches }] as { key: WeekType; label: string }[]) : []),
  ];
  const phaseDot: Record<SeasonPhase, string> = { preseason: "#de9328", inseason: "#1c7a4a", playoffs: "#a83e28", offseason: "#9aa0a6" };
  const dayColor = (dt: DayType, onBreak: boolean) =>
    onBreak ? "#1c7a4a" : dt === "GAME" ? "#a83e28" : dt === "RECOVERY" ? "#1c7a4a" : dt === "OFF" ? "#9aa0a6" : "#2740e6";
  const dayBadgeText = (dt: DayType, onBreak: boolean) =>
    onBreak ? (isIS ? "FRÍ" : "OFF")
    : dt === "GAME" ? (isIS ? "LEIKUR" : "MATCH")
    : dt === "RECOVERY" ? (isIS ? "ENDURHEIMT" : "RECOVERY")
    : dt === "OFF" ? (isIS ? "FRÍ" : "OFF")
    : (isIS ? "ÆFING" : "TRAINING");
  const provenanceText = inWeekMatchDates.map((d) => {
    const dd = new Date(d + "T00:00:00");
    const opp = matchOpponents[d];
    const idx = matchIdxForDate(d);
    const ha = matches[idx]?.home_away === "A" ? "A" : "H";
    return `${dd.getDate()}.${dd.getMonth() + 1}. — ${opp || (isIS ? "Leikur" : "Match")} (${ha})`;
  }).join(" · ");
  const busy = loading || saving || applying;

  return (
    <div className="mx-auto w-full max-w-[1160px] px-5 pb-28 pt-6 md:px-7" style={{ color: "#14181c" }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight md:text-[28px]" style={archivo}>
            {isIS ? "Vikuuppsetning" : "Week setup"}
          </h1>
          <PagePurpose
            en="set up the training week and tag each day's match-day context"
            is="setja upp æfingavikuna og merkja leikdags-samhengi hvers dags"
            tutorial="week-setup"
          />
        </div>
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-center gap-1 rounded-[10px] border border-[#dcd8cc] bg-white p-1">
            <button type="button" onClick={() => { setWeekStart(addDays(weekStart, -7)); setOk(null); setError(null); }} disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[#6b6f76] transition-colors hover:bg-[#f4f2ec] disabled:opacity-40" aria-label="Fyrri vika">‹</button>
            <span className="min-w-[170px] text-center text-[14px] font-semibold" style={archivo}>{weekLabel}</span>
            <button type="button" onClick={() => { setWeekStart(addDays(weekStart, 7)); setOk(null); setError(null); }} disabled={busy}
              className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[#6b6f76] transition-colors hover:bg-[#f4f2ec] disabled:opacity-40" aria-label="Næsta vika">›</button>
          </div>
          {inWeekMatchDates.length > 0 && (
            <div className="rounded-full border border-[#dcd8cc] bg-white px-3 py-1 text-[12px] text-[#6b6f76]" title={scheduleNote ?? undefined}>
              ⚲ {t.fromSchedule}{" "}
              <a href="/coach/fixtures" className="text-[#2740e6] hover:underline">{isIS ? "Leikjadagatali" : "Fixtures"}</a>:{" "}
              <span className="font-medium text-[#14181c]">{provenanceText}</span>
            </div>
          )}
        </div>
      </div>

      {/* OK / error banner */}
      {error && (
        <div className="mt-4 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium" style={{ borderColor: "rgba(168,62,40,0.35)", background: "rgba(168,62,40,0.08)", color: "#a83e28" }}>
          {t.error}: {error}
        </div>
      )}
      {ok && (
        <div className="mt-4 rounded-[12px] border px-4 py-2.5 text-[13px] font-medium" style={{ borderColor: "rgba(28,122,74,0.35)", background: "rgba(28,122,74,0.08)", color: "#1c7a4a" }}>
          {ok}
        </div>
      )}

      {/* Missing team id (edge) */}
      {(!teamId || teamId.trim().length === 0) && (
        <div className="mt-4 grid gap-2 rounded-[14px] border border-[#e3e0d5] bg-white p-4">
          <Label>Team ID (uuid)</Label>
          <Input placeholder="Paste team_id (uuid) here" value={teamId ?? ""} onChange={(e) => setTeamId(e.target.value)} />
          <p className="text-xs text-[#6b6f76]">{t.teamIdHint}</p>
        </div>
      )}

      {/* Context bar */}
      <div className="mt-5 grid grid-cols-1 gap-7 rounded-[14px] border border-[#e3e0d5] bg-white p-5 md:grid-cols-[1.2fr_1.3fr_1fr]">
        {/* Season */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa0a6]">{isIS ? "Tímabil" : "Season"}</div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {SEASON_PHASES.map((phase) => {
              const active = seasonPhase === phase.id;
              return (
                <button key={phase.id} type="button" disabled={busy}
                  onClick={() => setSeasonPhase((p) => (p === phase.id ? null : phase.id))}
                  className={`flex items-center gap-1.5 rounded-[9px] border px-2.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50 ${active ? "border-[#14181c] bg-[#14181c] text-white" : "border-[#e3e0d5] bg-white text-[#14181c] hover:bg-[#faf9f4]"}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseDot[phase.id] }} />
                  {phase.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* Week type (read-only) */}
        <div className="md:border-l md:border-[#eeece3] md:pl-7">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa0a6]">{isIS ? "Vikugerð" : "Week type"}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {weekTypePills.map((p) => {
              const active = weekType === p.key;
              return (
                <span key={p.key} className={`cursor-default rounded-full border px-3 py-1.5 text-[12px] font-medium ${active ? "border-[#2740e6] text-[#2740e6]" : "border-[#e3e0d5] text-[#9aa0a6]"}`} style={active ? { background: "rgba(39,64,230,0.08)" } : { background: "#fff" }}>
                  {p.label}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] text-[#6b6f76]">
            {inWeekMatchDates.length > 0
              ? (isIS ? "Ræðst sjálfkrafa af fjölda leikja í Leikjadagatali — bættu við eða fjarlægðu leiki þar." : "Set automatically from the number of games in Fixtures — add or remove games there.")
              : (isIS ? "Engir leikir fundust í vikunni — vikan er handvirk uppbyggingarvika." : "No games found this week — the week is a manual build week.")}
          </p>
        </div>
        {/* Intensity */}
        <div className="md:border-l md:border-[#eeece3] md:pl-7">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9aa0a6]">{isIS ? "Álagsmarkmið" : "Intensity target"}</div>
            <div className="text-[30px] font-bold leading-none tabular-nums" style={archivo}>{intensityTarget}</div>
          </div>
          <input type="range" min={1} max={10} step={1} value={intensityTarget} onChange={(e) => setIntensityTarget(Number(e.target.value))}
            className="mt-3 w-full" style={{ accentColor: "#2740e6" }} />
          <div className="mt-1 text-[11px] text-[#9aa0a6]">{t.intensityHint}</div>
        </div>
      </div>

      {/* Week grid */}
      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[17px] font-semibold" style={archivo}>{isIS ? "Vikan — dagleg áhersla" : "The week — daily focus"}</div>
            <div className="mt-0.5 text-[12px] text-[#6b6f76]">{isIS ? "MD-röðunin er sjálfgefin út frá leiknum — þú getur breytt hverjum degi beint." : "The MD ordering is seeded from the match — you can change any day directly."}</div>
          </div>
          <div className="flex gap-2">
            {inWeekMatchDates.length > 0 && (
              <button type="button" disabled={busy}
                onClick={() => { const a = matchAnchoredIntents(weekStart, weekEnd, visibleMatches.map((m) => m.date)); if (a) { setNoMatchIntents(a); setOk(null); } }}
                className="rounded-[9px] border border-[#dcd8cc] bg-white px-3.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
                {isIS ? "Fylla frá leik (MD)" : "Fill from match (MD)"}
              </button>
            )}
            <button type="button" disabled={busy}
              onClick={() => { setNoMatchIntents(getDefaultNoMatchIntents()); setOk(null); }}
              className="rounded-[9px] border border-[#dcd8cc] bg-white px-3.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
              {isIS ? "Endurstilla" : "Reset"}
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => {
            const date = addDays(weekStart, i);
            const dd = new Date(date + "T00:00:00");
            const onBreak = isDateOnBreak(date);
            const mdLabel = mdLabelForDay(weekStart, weekEnd, visibleMatches.map((m) => m.date), i);
            const isMatchDay = mdLabel === "MD";
            const dType = previewDays[i]?.day_type ?? "TRAIN";
            const stripe = dayColor(dType, onBreak);
            const badgeColor = dayColor(dType, onBreak);
            const badgeText = dayBadgeText(dType, onBreak);
            const mIdx = isMatchDay ? matchIdxForDate(date) : -1;
            const opp = matchOpponents[date];
            return (
              <div key={date} className="flex flex-col overflow-hidden rounded-[12px] border border-[#e3e0d5] bg-white">
                <div className="h-1" style={{ background: stripe }} />
                <div className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-2.5">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[13px] font-semibold" style={archivo}>{weekdaysShort[i]}</div>
                      <div className="text-[11px] text-[#9aa0a6]">{dd.getDate()}.{dd.getMonth() + 1}.</div>
                    </div>
                    {mdLabel && !onBreak && (
                      <span className="rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold" style={mdLabel === "MD" ? { background: "rgba(168,62,40,0.12)", color: "#a83e28", ...archivo } : { background: "#f0eee6", color: "#6b6f76", ...archivo }}>{mdLabel}</span>
                    )}
                  </div>

                  {onBreak ? (
                    <div className="flex flex-col items-center justify-center rounded-[9px] border border-dashed px-2 py-3 text-center" style={{ borderColor: "rgba(28,122,74,0.4)", background: "rgba(28,122,74,0.06)" }}>
                      <div className="text-[12px] font-semibold text-[#1c7a4a]">{isIS ? "FRÍ" : "OFF"}</div>
                      <div className="mt-0.5 text-[10px] text-[#1c7a4a]">{isIS ? "Skráð frí liðsins — læst" : "Team break — locked"}</div>
                    </div>
                  ) : isMatchDay ? (
                    <div className="flex flex-col gap-1.5 rounded-[9px] border p-2" style={{ borderColor: "rgba(168,62,40,0.35)", background: "rgba(168,62,40,0.06)" }}>
                      <div className="text-[12px] font-bold text-[#a83e28]" style={archivo}>
                        {matches[mIdx]?.home_away === "A" ? "@" : "vs"} {opp || (isIS ? "Leikur" : "Match")}
                      </div>
                      <div className="flex gap-1.5">
                        <input value={matches[mIdx]?.kickoff_time ?? ""} placeholder="19:15" disabled={mIdx < 0}
                          onChange={(e) => setMatch(mIdx, { kickoff_time: e.target.value })}
                          className="w-full rounded-[6px] border border-[#e3e0d5] px-1.5 py-1 text-[11px] disabled:opacity-50" />
                        <select value={matches[mIdx]?.home_away ?? "H"} disabled={mIdx < 0}
                          onChange={(e) => setMatch(mIdx, { home_away: e.target.value as "H" | "A" })}
                          className="rounded-[6px] border border-[#e3e0d5] px-1 py-1 text-[11px] disabled:opacity-50">
                          <option value="H">H</option>
                          <option value="A">{isIS ? "Ú" : "A"}</option>
                        </select>
                      </div>
                      <div className="text-[9px] text-[#9aa0a6]">{isIS ? "úr Leikjadagatali" : "from Fixtures"}</div>
                    </div>
                  ) : (
                    <select className="w-full rounded-[8px] border border-[#e3e0d5] bg-white px-1.5 py-1.5 text-[11.5px]"
                      value={noMatchIntents[i] ?? "OFF"}
                      onChange={(e) => { const v = e.target.value as NoMatchIntent; setNoMatchIntents((prev) => { const n = [...prev]; n[i] = v; return n; }); setOk(null); }}>
                      {NO_MATCH_OPTIONS.filter((o) => o.value !== "GAME").map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.value === "OFF" ? (isIS ? "Frí" : "Off") : opt.label}</option>
                      ))}
                    </select>
                  )}

                  <div className="mt-auto flex justify-center pt-1">
                    <span className="rounded-full px-2.5 py-0.5 text-[9.5px] font-bold tracking-[0.05em]" style={{ color: badgeColor, background: `${badgeColor}1a`, ...archivo }}>{badgeText}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Forward-looking Readiness Outlook — forecasts the planned week you're editing.
          A labelled model forecast, distinct from today's readiness colour. */}
      {teamId && (
        <div className="mt-5">
          <ReadinessOutlookPanel teamId={teamId} asOf={addDays(weekStart, -1)}
            plannedDays={outlookPlannedDays.length ? outlookPlannedDays : undefined} />
        </div>
      )}

      {/* Insight row */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1.5fr_1fr] md:items-start">
        {/* Microcycle review */}
        <div className="rounded-[14px] border border-[#e3e0d5] bg-white p-4 md:px-[18px]">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold" style={archivo}>{t.microTitle}</span>
            {microcycleChecks.length === 0 ? (
              <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(28,122,74,0.1)", color: "#1c7a4a" }}>{t.microOk}</span>
            ) : (
              <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold" style={{ background: "rgba(222,147,40,0.14)", color: "#9a6a14" }}>{microcycleChecks.length} {t.microNote}</span>
            )}
          </div>
          <p className="mt-1 text-[12px] text-[#6b6f76]">{t.microDesc}</p>
          {microcycleChecks.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#1c7a4a]">{t.microNone}</p>
          ) : (
            <div className="mt-2 grid gap-2">
              {microcycleChecks.map((c) => (
                <div key={c.id} className="rounded-[10px] border px-3 py-2.5"
                  style={c.tone === "warn" ? { borderColor: "rgba(222,147,40,0.45)", background: "rgba(222,147,40,0.08)", color: "#7a5210" } : { borderColor: "rgba(39,64,230,0.3)", background: "rgba(39,64,230,0.05)", color: "#1c2a80" }}>
                  <div className="text-[12.5px] font-semibold">{c.title}</div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="grid gap-4">
          {(() => {
            const shape = expectedWeekShape(sport, weekType);
            if (!shape) return null;
            return (
              <div className="rounded-[14px] border bg-white p-4" style={{ borderColor: "rgba(122,92,196,0.4)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "#7a5cc4" }}>{isIS ? "Vikulögun — Karfa" : "Week shape — Basketball"}</div>
                <div className="mt-1 text-[14px] font-semibold" style={archivo}>{isIS ? shape.headline.is : shape.headline.en}</div>
                <div className="mt-0.5 text-[12px] text-[#6b6f76]">{isIS ? shape.detail.is : shape.detail.en}</div>
                <div className="mt-1 text-[10px] uppercase tracking-wide" style={{ color: "#7a5cc4" }}>{shape.citation}</div>
              </div>
            );
          })()}

          <div className="rounded-[14px] border border-[#e3e0d5] bg-white p-4">
            <div className="text-[15px] font-semibold" style={archivo}>{isIS ? "Frídagar liðsins" : "Team breaks"}</div>
            <p className="mt-1 text-[12px] text-[#6b6f76]">{isIS ? "Dagar innan skráðs frís læsast sem FRÍ í vikunni — engin æfing send, áminningar í pásu." : "Days inside a declared break lock as OFF for the week — no session sent, reminders paused."}</p>
            <div className="mt-3">
              <TeamBreaksManager teamId={teamId} />
            </div>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 left-0 right-0 z-20 mt-6 -mx-5 border-t border-[#e3e0d5] px-5 py-3 md:-mx-7 md:px-7" style={{ background: "rgba(255,255,255,0.96)", backdropFilter: "blur(6px)" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] text-[#6b6f76]">{weekLabel} · {weekTypeLabel} · MICRODOSING_PLAYBOOK</div>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => void handleSave()} disabled={busy}
              className="rounded-[10px] border border-[#dcd8cc] bg-white px-4.5 py-2 text-[13px] font-medium transition-colors hover:bg-[#faf9f4] disabled:opacity-50">
              {saving ? t.saving : loading ? t.loadingW : t.saveWeek}
            </button>
            <button type="button" onClick={() => void handleApplyPlan()} disabled={busy}
              className="rounded-[10px] px-5 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50" style={{ background: "#2740e6" }}>
              {applying ? t.applying : t.activate}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
