/**
 * Periodization engine — season macro → meso from the team's OWN data, plus the per-player
 * individualisation targets and the "what data is missing" readiness check. PURE: it takes
 * already-derived inputs (fixtures, weekly load, weekly readiness, a player's MAS / VBT profile)
 * and composes the recommendation with cited rules — it never fetches, and it never touches the
 * daily readiness colour. Rules recommend; the coach decides and overrides.
 *
 * Model follows the coach's own annual plan (VBT + Type 1–5 interval speeds, MD-anchored), but every
 * number is sourced from the squad instead of assumptions (his frustration: "built with no data").
 */

export type Bi = { en: string; is: string };

// ─────────────────────────────── MACRO ───────────────────────────────
export type Fixture = { date: string; competition?: string | null; isHome?: boolean | null };
export type SeasonPhase = {
  key: "preseason" | "competitive" | "offseason";
  label: Bi; start: string; end: string; weeks: number; matches: number; rationale: Bi;
};

const daydiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86_400_000).toISOString().slice(0, 10);

/**
 * Macro phases from the real fixtures. Pre-season = (coach's start OR data start) → first fixture;
 * competitive = first → (coach's season end OR last fixture). The COACH can set the window — some
 * start pre-season in December and the season ends late October — via `opts`; auto-detect is only
 * the default when he hasn't set it.
 */
export function detectSeasonPhases(fixtures: Fixture[], dataStart: string | null, opts?: { preseasonStart?: string | null; seasonEnd?: string | null }): SeasonPhase[] {
  const dates = fixtures.map((f) => f.date).filter(Boolean).sort();
  if (dates.length === 0) return [];
  const first = dates[0], last = dates[dates.length - 1];
  const out: SeasonPhase[] = [];
  const coachPre = opts?.preseasonStart && opts.preseasonStart < first ? opts.preseasonStart : null;
  const preStart = coachPre ?? (dataStart && dataStart < first ? dataStart : addDays(first, -42));
  const preWeeks = Math.max(1, Math.round(daydiff(preStart, first) / 7));
  out.push({
    key: "preseason", label: { en: "Pre-season", is: "Undirbúningstímabil" }, start: preStart, end: first, weeks: preWeeks, matches: 0,
    rationale: { en: `${preWeeks}-week build-up before the first fixture — accumulation + capacity.${coachPre ? " (coach-set start)" : ""}`, is: `${preWeeks} vikna uppbygging fyrir fyrsta leik — grunnþjálfun + þol.${coachPre ? " (þjálfari stillti upphaf)" : ""}` },
  });
  const compEnd = opts?.seasonEnd && opts.seasonEnd > last ? opts.seasonEnd : last;
  const compWeeks = Math.max(1, Math.round(daydiff(first, compEnd) / 7));
  const perWeek = dates.length / Math.max(1, compWeeks);
  out.push({
    key: "competitive", label: { en: "Competitive season", is: "Keppnistímabil" }, start: first, end: compEnd, weeks: compWeeks, matches: dates.length,
    rationale: { en: `${compWeeks}-week season, ${dates.length} matches (~${perWeek.toFixed(1)}/week) — maintenance + freshness around fixtures.${opts?.seasonEnd ? " (coach-set end)" : ""}`, is: `${compWeeks} vikna tímabil, ${dates.length} leikir (~${perWeek.toFixed(1)}/viku) — viðhald + ferskleiki kringum leiki.${opts?.seasonEnd ? " (þjálfari stillti lok)" : ""}` },
  });
  return out;
}

// ───────────────────── TEAM AVERAGES (the squad baseline / default) ─────────────────────
export type TeamAverages = {
  sessions: number; players: number;
  distanceM: number | null; hsrM: number | null; sprintM: number | null; maxKmh: number | null;
  playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null;
  direction: { forward: number; backward: number; lateral: number } | null;
  matchSessions: number; matchDistanceM: number | null; matchHsrM: number | null; matchPlayerLoad: number | null;
  matchSprintM: number | null; matchAccel: number | null; matchDecel: number | null;
};

/** One player-session's GPS/IMA values (the loader maps player_external_load_daily rows). */
export type SessionRow = {
  isMatch: boolean; distanceM: number | null; hsrM: number | null; sprintM: number | null;
  maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null;
};

/** Coarse position group — the squad baseline is read per position (Ju: peak demands are position-
 *  specific), so a player without his own test falls back to HIS position's average, not the whole team. */
export function positionGroup(pos: string | null | undefined): { key: number; label: Bi } {
  const p = (pos ?? "").toUpperCase();
  if (/GK|MARK|KEEP/.test(p)) return { key: 0, label: { en: "Goalkeepers", is: "Markmenn" } };
  if (/CB|LB|RB|WB|SW|DEF|BAK|VÖR|VOR/.test(p)) return { key: 1, label: { en: "Defenders", is: "Varnarmenn" } };
  if (/DM|CM|AM|RM|LM|MID|MIÐ/.test(p)) return { key: 2, label: { en: "Midfielders", is: "Miðjumenn" } };
  if (/LW|RW|CF|ST|SS|FW|WING|FRAM|SÓKN|SOKN/.test(p)) return { key: 3, label: { en: "Forwards", is: "Sóknarmenn" } };
  return { key: 4, label: { en: "Other", is: "Annað" } };
}
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
/** Squad baseline = the team's own average per session, from the data that exists. `direction` is
 *  passed in pre-computed (forward/backward/lateral shares from the summed IMA clock). Pure. */
export function teamAverages(rows: SessionRow[], direction: TeamAverages["direction"]): TeamAverages {
  const col = (sel: (r: SessionRow) => number | null, src = rows) => src.map(sel).filter((x): x is number => x != null && Number.isFinite(x));
  const matches = rows.filter((r) => r.isMatch);
  return {
    sessions: rows.length, players: 0, // players set by loader
    distanceM: avg(col((r) => r.distanceM)), hsrM: avg(col((r) => r.hsrM)), sprintM: avg(col((r) => r.sprintM)),
    maxKmh: avg(col((r) => r.maxKmh)), playerLoad: avg(col((r) => r.playerLoad)), plPerMin: avg(col((r) => r.plPerMin)),
    accel: avg(col((r) => r.accel)), decel: avg(col((r) => r.decel)), direction,
    matchSessions: matches.length, matchDistanceM: avg(col((r) => r.distanceM, matches)),
    matchHsrM: avg(col((r) => r.hsrM, matches)), matchPlayerLoad: avg(col((r) => r.playerLoad, matches)),
    matchSprintM: avg(col((r) => r.sprintM, matches)), matchAccel: avg(col((r) => r.accel, matches)), matchDecel: avg(col((r) => r.decel, matches)),
  };
}

// ───────────────────── THREE AXES vs the MATCH (Figueiredo dimension-specific) ─────────────────────
// Relative to match, a NORMAL microcycle over-shoots the mechanical axis (accel 131–166%, decel
// 108–134%) and UNDER-shoots running (HSR 36–61%, sprint 57–71%) — so there is no single "% of match".
// Each axis carries its own match-relative band; HSR is the one to protect + top up (Figueiredo et al.).
export type AxisTarget = {
  axis: "running" | "mechanical" | "internal";
  label: Bi; matchNote: Bi; metrics: Array<{ metric: Bi; matchValue: string; trainingCeiling: string; band: string }>;
  flag: Bi | null;
};
export type MatchAxes = { running: AxisTarget; mechanical: AxisTarget; internal: AxisTarget; hsrDeficit: Bi | null };

const kmv = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
/** The three-axis, match-relative read for a position. `mHsr` etc. are the position's MATCH-day values;
 *  the training ceiling per dimension uses the Figueiredo band (running under, mechanical over match). */
export function matchAxisTargets(b: TeamAverages): MatchAxes {
  const mHsr = b.matchHsrM ?? null, mSprint = b.matchSprintM ?? null, mDist = b.matchDistanceM ?? null;
  const mAcc = b.matchAccel ?? null, mDec = b.matchDecel ?? null;
  const pct = (m: number | null, f: number) => (m == null ? null : Math.round(m * f));
  // Running — training reaches only the TOP of the under-match band on the Locomotive day.
  const running: AxisTarget = {
    axis: "running", label: { en: "Running (Locomotive)", is: "Hlaup (Locomotive)" },
    matchNote: { en: "Training UNDER-reaches the match here — protect + top up (friendlies, MD-4).", is: "Æfingar ná EKKI leikkröfu hér — verndaðu + fylltu upp (æfingaleikir, MD-4)." },
    metrics: [
      { metric: { en: "HSR >19.8", is: "Háhraði" }, matchValue: kmv(mHsr), trainingCeiling: kmv(pct(mHsr, 0.6)), band: "≈36–61%" },
      { metric: { en: "Sprint", is: "Sprettur" }, matchValue: kmv(mSprint), trainingCeiling: kmv(pct(mSprint, 0.65)), band: "≈57–71%" },
      { metric: { en: "Distance", is: "Vegalengd" }, matchValue: kmv(mDist), trainingCeiling: kmv(pct(mDist, 0.9)), band: "≈90%" },
    ], flag: mHsr != null ? { en: "HSR is the deficit axis — a session rarely reaches match HSR; top it up.", is: "Háhraði er halla-ásinn — æfing nær sjaldan leik-háhraða; fylltu upp." } : null,
  };
  // Mechanical — training OVER-shoots the match (that's normal, and it's where hamstring risk lives).
  const mechanical: AxisTarget = {
    axis: "mechanical", label: { en: "Mechanical / IMA", is: "Vélrænt / IMA" },
    matchNote: { en: "Training OVER-shoots the match here — plan it, don't stack it on an HSR day.", is: "Æfingar fara YFIR leikkröfu hér — skipuleggðu, ekki stafla á háhraða-dag." },
    metrics: [
      { metric: { en: "Accel", is: "Hröðun" }, matchValue: mAcc?.toString() ?? "–", trainingCeiling: pct(mAcc, 1.5)?.toString() ?? "–", band: "131–166%" },
      { metric: { en: "Decel", is: "Hraðaminnkun" }, matchValue: mDec?.toString() ?? "–", trainingCeiling: pct(mDec, 1.2)?.toString() ?? "–", band: "108–134%" },
    ], flag: null,
  };
  const internal: AxisTarget = {
    axis: "internal", label: { en: "Internal (sRPE / readiness)", is: "Innra (sRPE / viðbragð)" },
    matchNote: { en: "Caps the external axes by how the player is coping — readiness gates the day.", is: "Setur þak á ytri ásana eftir því hvernig leikmaðurinn ræður við — viðbragð stýrir deginum." },
    metrics: [], flag: null,
  };
  const hsrDeficit = mHsr != null && b.hsrM != null && b.hsrM < mHsr * 0.5
    ? { en: `Running loads well under match (session HSR ~${Math.round((b.hsrM / mHsr) * 100)}% of match) — don't chase distance while the HSR + mechanical axes go unaddressed.`, is: `Hlaupaálag langt undir leik (session HSR ~${Math.round((b.hsrM / mHsr) * 100)}% af leik) — ekki elta vegalengd meðan háhraði + vélræni ásinn eru vanræktir.` }
    : null;
  return { running, mechanical, internal, hsrDeficit };
}

// ───────────────────── MD-ANCHORED DAY TARGETS ─────────────────────
// The load week is anchored to matchday (MD). Each training day has a load TYPE and the numbers it
// should hit come from the POSITION baseline × that day's %-of-match-demand (Martín-García 2018;
// Owen 2017 positional mesocycle; mechanical vs locomotor load, Buchheit). Pre-season needs the coach
// to enter friendlies so MD-N exists before the competitive season.
// Day-type taxonomy reuses src/lib/drill-stimulus.ts (Mechanical/Locomotive/Mixed/Technical) + the
// MD+ recovery types (Restart/Top-up) + Match. MD mapping per Owen 2017 (positional mesocycle, MD-1
// significantly lower, structured taper) and the drill-stimulus MD notes.
export type MdDayType = "mechanical" | "locomotive" | "mixed" | "technical" | "restart" | "topup" | "match";
export type MdTargetMetric = { metric: Bi; value: string };
export type MdDayTarget = { mdTag: string; type: MdDayType; label: Bi; quality: Bi; targets: MdTargetMetric[]; note: Bi | null };

const MD_TYPE_LABEL: Record<MdDayType, Bi> = {
  mechanical: { en: "Mechanical", is: "Mechanical (vélrænt)" },
  locomotive: { en: "Locomotive", is: "Locomotive (hlaup)" },
  mixed: { en: "Mixed", is: "Mixed (blandað)" },
  technical: { en: "Technical", is: "Technical (tæknilegt)" },
  restart: { en: "Restart", is: "Restart (endurræsing)" },
  topup: { en: "Top-up", is: "Áfylling" },
  match: { en: "Match", is: "Leikur" },
};
const MD_TYPE_QUALITY: Record<MdDayType, Bi> = {
  mechanical: { en: "tight-space, high accel/decel — ASD prep", is: "þröngt rými, mikil accel/decel — ASD undirb." },
  locomotive: { en: "open-space, high HSR — running capacity", is: "opið rými, hátt háhraðahlaup — hlaupageta" },
  mixed: { en: "match-like stimulus, peak overall load", is: "leiklíkt áreiti, hámarks heildarálag" },
  technical: { en: "low physiological load, both dimensions (taper)", is: "lágt lífeðlislegt álag, báðar víddir (niðurtröppun)" },
  restart: { en: "recovery + re-activation (regen for starters)", is: "endurheimt + endurvirkjun (regen fyrir byrjunarlið)" },
  topup: { en: "bring <30-min players to the weekly target", is: "koma <30-mín leikmönnum í vikumarkið" },
  match: { en: "the match demand itself", is: "leikkrafan sjálf" },
};
// Default %-of-match-demand per MD day (Martín-García 2018) — used only when the team's OWN per-MD
// shape isn't available. The real shape (mdShape) overrides these when computed from the data.
const MD_DEFAULT_MULT: Record<string, number> = { "MD-5": 1.0, "MD-4": 1.1, "MD-3": 1.15, "MD-2": 0.6, "MD-1": 0.35, "MD+1": 0.3, "Top-up": 1.0 };

const r0 = (n: number | null, mult: number) => (n == null ? null : Math.round(n * mult));
const km = (m: number | null) => (m == null ? "–" : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** One-match-week MD template (MD-5…MD-1, MD, MD+1, Top-up), each day a drill-stimulus type with the
 *  numbers from the POSITION baseline × that day's shape. `mdShape` is the team's OWN average load at
 *  each MD-relative day (as a multiple of a normal session) when known — else the Martín-García default.
 *  Mechanical → accel/decel+PL; Locomotive → HSR/distance/sprint; Mixed → both; Match/Top-up → match demand. */
export type MatchWeekType = "normal" | "two_game" | "three_game";
export const MATCH_WEEK_LABEL: Record<MatchWeekType, Bi> = {
  normal: { en: "Normal week (1 game)", is: "Venjuleg vika (1 leikur)" },
  two_game: { en: "2-game week (congested)", is: "2-leikja vika (þétt)" },
  three_game: { en: "3-game week (very congested)", is: "3-leikja vika (mjög þétt)" },
};
/** Classify the microcycle from the gap (days) to the NEXT match — Oliveira 2019: a short gap
 *  collapses the build; the between-match days become recovery + short match-prep, not MD-5→MD-1. */
export function classifyMatchWeek(gapToNextMatchDays: number | null): MatchWeekType {
  if (gapToNextMatchDays == null) return "normal";
  if (gapToNextMatchDays <= 3) return "three_game";
  if (gapToNextMatchDays <= 5) return "two_game";
  return "normal";
}

export function mdWeekTargets(b: TeamAverages, opts?: { mdShape?: Record<string, number>; weekType?: MatchWeekType }): MdDayTarget[] {
  const mdShape = opts?.mdShape; const weekType = opts?.weekType ?? "normal";
  const mult = (tag: string) => mdShape?.[tag] ?? MD_DEFAULT_MULT[tag] ?? 1.0;
  const mech = (m: number): MdTargetMetric[] => [
    { metric: { en: "Player Load", is: "Player Load" }, value: r0(b.playerLoad, m)?.toString() ?? "–" },
    { metric: { en: "Accel", is: "Hröðun" }, value: r0(b.accel, m)?.toString() ?? "–" },
    { metric: { en: "Decel", is: "Hraðam." }, value: r0(b.decel, m)?.toString() ?? "–" },
  ];
  const loco = (m: number): MdTargetMetric[] => [
    { metric: { en: "HSR >19.8", is: "Háhraði" }, value: km(r0(b.hsrM, m)) },
    { metric: { en: "Distance", is: "Vegalengd" }, value: km(r0(b.distanceM, m)) },
    { metric: { en: "Sprint", is: "Sprettur" }, value: km(r0(b.sprintM, m)) },
  ];
  const DAY: Record<string, { mdTag: string; type: MdDayType; targets: MdTargetMetric[]; note?: Bi }> = {
    restart: { mdTag: "MD+1", type: "restart", targets: mech(mult("MD+1")), note: { en: "Players who played <30 min get a Top-up instead (below).", is: "Leikmenn sem spiluðu <30 mín fá Áfyllingu í staðinn (neðar)." } },
    mech: { mdTag: "MD-5", type: "mechanical", targets: mech(mult("MD-5")) },
    loco: { mdTag: "MD-4", type: "locomotive", targets: loco(mult("MD-4")) },
    mixed: { mdTag: "MD-3", type: "mixed", targets: [...mech(mult("MD-3")).slice(0, 1), ...loco(mult("MD-3")).slice(0, 2)] },
    tech2: { mdTag: "MD-2", type: "technical", targets: [...mech(mult("MD-2")).slice(0, 1), ...loco(mult("MD-2")).slice(0, 1)] },
    tech1: { mdTag: "MD-1", type: "technical", targets: [...mech(mult("MD-1")).slice(0, 1), ...loco(mult("MD-1")).slice(0, 1)] },
    match: { mdTag: "MD", type: "match", targets: [
      { metric: { en: "HSR (match)", is: "Háhraði (leik)" }, value: km(b.matchHsrM ?? b.hsrM) },
      { metric: { en: "Distance (match)", is: "Vegalengd (leik)" }, value: km(b.matchDistanceM ?? b.distanceM) },
      { metric: { en: "Player Load (match)", is: "Player Load (leik)" }, value: (b.matchPlayerLoad ?? b.playerLoad)?.toString() ?? "–" },
    ] },
    topup: { mdTag: "Top-up", type: "topup", targets: loco(mult("Top-up")), note: { en: "For <30-min players — add toward the match-day locomotor demand.", is: "Fyrir <30-mín leikmenn — bæta upp að leikdags-hlaupakröfu." } },
  };
  // A congested week COLLAPSES the build (Oliveira 2019) — no MD-5/-4/-3; the between-match days are
  // recovery + short match-prep only.
  const order = weekType === "three_game" ? ["restart", "tech1", "match", "topup"]
    : weekType === "two_game" ? ["restart", "tech2", "tech1", "match", "topup"]
      : ["restart", "mech", "loco", "mixed", "tech2", "tech1", "match", "topup"];
  return order.map((k) => DAY[k]).map((d) => ({ mdTag: d.mdTag, type: d.type, label: MD_TYPE_LABEL[d.type], quality: MD_TYPE_QUALITY[d.type], targets: d.targets, note: d.note ?? null }));
}

/** Weeks with 2+ matches inside a calendar week (congested). Each such week's Monday + match count. */
export function congestedWeeks(fixtureDates: string[]): Array<{ weekStart: string; matches: number }> {
  const byWeek = new Map<string, number>();
  const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };
  for (const d of fixtureDates) if (d) byWeek.set(monday(d), (byWeek.get(monday(d)) ?? 0) + 1);
  return [...byWeek.entries()].filter(([, n]) => n >= 2).sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, matches]) => ({ weekStart, matches }));
}

// ───────────────────── DATA TIER (works for every club) ─────────────────────
export type DataTier = "pro" | "core" | "rpe" | "none";
export type TierRead = { tier: DataTier; loadSource: "gps" | "srpe" | "none"; label: Bi; confidence: "high" | "medium" | "low"; unlock: Bi | null };
/** The framework needs no expensive hardware: fixtures + any load signal + readiness. More hardware
 *  only enriches individualisation and raises confidence — it never gates building the plan. */
export function dataTier(has: { ima: boolean; gps: boolean; rpe: boolean }): TierRead {
  if (has.ima) return { tier: "pro", loadSource: "gps", confidence: "high", label: { en: "Vector Pro (GPS + IMA)", is: "Vector Pro (GPS + IMA)" }, unlock: null };
  if (has.gps) return { tier: "core", loadSource: "gps", confidence: "medium", label: { en: "Vector Core (GPS)", is: "Vector Core (GPS)" }, unlock: { en: "IMU (Pro) would add movement-signature individualisation.", is: "IMU (Pro) bætir við hreyfi-fingrafars einstaklingsmiðun." } };
  if (has.rpe) return { tier: "rpe", loadSource: "srpe", confidence: "low", label: { en: "RPE-only (sRPE load)", is: "Aðeins RPE (sRPE álag)" }, unlock: { en: "GPS would base the load curve on external load + HSR targets.", is: "GPS byggir álagsferilinn á ytra álagi + HSR-mörkum." } };
  return { tier: "none", loadSource: "none", confidence: "low", label: { en: "No load data yet", is: "Engin álagsgögn enn" }, unlock: { en: "Log sessions (RPE is enough) to build the load curve.", is: "Skráðu æfingar (RPE dugar) til að byggja álagsferilinn." } };
}

// ───────────────────── STRENGTH DEFAULTS (no-VBT teams) ─────────────────────
export type StrengthDefault = { quality: Bi; pct1rm: Bi; velocity: Bi; intent: Bi; cite: string };
/** When a team has NO VBT, prescribe strength from the evidence base by %1RM + the mean-velocity a
 *  set should live at + the training intent — per the block goal. Cited from the research library
 *  (VBT, weightlifting-derivative, RFD & PAP folders). Replaces a faked VBT number with an honest default. */
export const STRENGTH_DEFAULTS: Record<"max_strength" | "strength_power" | "power_speed", StrengthDefault> = {
  max_strength: { quality: { en: "Max strength", is: "Hámarksstyrkur" }, pct1rm: { en: "85–95% 1RM", is: "85–95% 1RM" }, velocity: { en: "~0.30–0.50 m/s", is: "~0,30–0,50 m/s" }, intent: { en: "3–5 reps, maximal intent, long rest", is: "3–5 endurt., hámarks-áform, löng hvíld" }, cite: "González-Badillo & Sánchez-Medina 2010; Weakley 2021" },
  strength_power: { quality: { en: "Strength–power", is: "Styrkur–kraftur" }, pct1rm: { en: "70–85% 1RM", is: "70–85% 1RM" }, velocity: { en: "~0.50–0.75 m/s", is: "~0,50–0,75 m/s" }, intent: { en: "explosive concentric, ~10–20% velocity loss cap", is: "sprengikraftur, ~10–20% hraðatap-þak" }, cite: "Cormie, McGuigan & Newton 2011; Pareja-Blanco 2017" },
  power_speed: { quality: { en: "Power / speed-strength", is: "Kraftur / hraði-styrkur" }, pct1rm: { en: "30–60% 1RM (ballistic / WL derivatives)", is: "30–60% 1RM (kast / lyftinga-afleiður)" }, velocity: { en: ">0.75 m/s", is: ">0,75 m/s" }, intent: { en: "jump/throw or clean/pull derivatives; RFD + PAP potentiation", is: "stökk/kast eða clean/pull afleiður; RFD + PAP" }, cite: "Suchomel 2017 (WL derivatives); Haff & Nimphius 2012 (RFD); Seitz & Haff 2016 (PAP)" },
};
/** Map a meso block's phase/goal to the strength quality default. */
export function strengthDefaultForBlock(phaseEn: string, isDeload: boolean): StrengthDefault {
  if (isDeload) return STRENGTH_DEFAULTS.strength_power; // keep intensity touches, low volume
  if (/accumulation/i.test(phaseEn)) return STRENGTH_DEFAULTS.max_strength;
  if (/realization/i.test(phaseEn)) return STRENGTH_DEFAULTS.power_speed;
  return STRENGTH_DEFAULTS.strength_power; // transmutation
}

// ───────────────────── VALD readiness-to-load (volume cap) ─────────────────────
export type ValdCap = { status: "green" | "yellow" | "red" | null; capPct: number | null; note: Bi };
/** Turn the player's VALD daily snapshot status into a volume cap (readiness to LOAD, not the daily
 *  readiness colour). Green = full, yellow = trim, red = reduce; hamstring/groin flag surfaced. */
export function valdVolumeCap(status: string | null, hamstringFlag: string | null): ValdCap {
  const s = (status ?? "").toLowerCase();
  const cap = s === "green" ? 100 : s === "yellow" ? 85 : s === "red" ? 70 : null;
  const hamAmber = (hamstringFlag ?? "").toLowerCase() === "yellow" || (hamstringFlag ?? "").toLowerCase() === "red";
  const note: Bi = cap == null ? { en: "No VALD force data — volume cap uses the squad default.", is: "Engin VALD kraftgögn — magn-þak notar sjálfgefið liðsgildi." }
    : s === "green" ? { en: `Force ready — full volume${hamAmber ? " (watch hamstring)" : ""}.`, is: `Kraftur tilbúinn — fullt magn${hamAmber ? " (fylgstu með aftanláeri)" : ""}.` }
      : s === "yellow" ? { en: `Trim volume to ~85% — force readiness amber${hamAmber ? " + hamstring flag" : ""}.`, is: `Minnka magn í ~85% — kraft-viðbragð gult${hamAmber ? " + aftanláeris-merki" : ""}.` }
        : { en: `Reduce to ~70% — force readiness red${hamAmber ? " + hamstring flag" : ""}.`, is: `Minnka í ~70% — kraft-viðbragð rautt${hamAmber ? " + aftanláeris-merki" : ""}.` };
  return { status: (s === "green" || s === "yellow" || s === "red") ? s : null, capPct: cap, note };
}

// ─────────────────────────────── MESO ───────────────────────────────
export type WeekLoad = { weekStart: string; load: number | null; readiness: number | null };
export type MesoBlock = {
  index: number; phase: Bi; goal: Bi; start: string; end: string; weeks: number;
  isDeload: boolean; volumeTargetPct: number | null; flag: Bi | null;
  /** LEADING meso metric — the week expressed in MATCH units (weekly training load ÷ one match's load).
   *  The match is the natural unit of demand; we ramp TMr sensibly, we don't chase an ACWR band. */
  tmr: number | null;
  /** week-over-week direction of the acute load (the trend that actually drives the deload call). */
  loadTrend: "rising" | "steady" | "falling" | null;
  /** ACWR is kept only as a LABELLED contested view (Impellizzeri 2020: not an injury predictor / not a
   *  target). Never the goal — `acwrNote` carries the caveat so the UI can't present it as the verdict. */
  acwr: number | null; acwrNote: Bi;
};

const BLOCK_GOALS: Array<{ phase: Bi; goal: Bi }> = [
  { phase: { en: "Accumulation", is: "Uppsöfnun" }, goal: { en: "Work capacity + max strength base", is: "Þol + hámarksstyrks grunnur" } },
  { phase: { en: "Transmutation", is: "Umbreyting" }, goal: { en: "Strength–power + speed", is: "Styrkur–kraftur + hraði" } },
  { phase: { en: "Realization", is: "Framkvæmd" }, goal: { en: "Freshness + peak power, taper to fixtures", is: "Ferskleiki + hámarkskraftur, niðurtröppun að leikjum" } },
];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const ACWR_CONTESTED: Bi = {
  en: "Contested view — ACWR is not an injury predictor and not the target (Impellizzeri 2020). Shown for orientation only; the plan ramps TMr + acute-load trend + readiness.",
  is: "Umdeilt — ACWR spáir ekki fyrir um meiðsli og er ekki markmiðið (Impellizzeri 2020). Aðeins til viðmiðunar; áætlunin trappar TMr + bráðaálags-þróun + viðbragð.",
};
/**
 * Break the competitive phase into ~`blockWeeks`-week meso blocks. The LEADING metric is **TMr**
 * (training:match ratio) — the week expressed in match units (block mean weekly load ÷ one match's
 * load) — because the match is the natural unit of demand. The deload call is driven by the
 * **acute-load trend** (block mean vs the trailing ~4-week mean) and **readiness**, NOT by an ACWR
 * band: ACWR is computed and carried only as a labelled *contested* view (Impellizzeri 2020 — not an
 * injury predictor, not a target). Goals rotate Accumulation → Transmutation → Realization.
 * `matchLoad` is the team's typical single-match load in the same currency (Player Load or sRPE-AU).
 */
export function buildMesoBlocks(phaseStart: string, phaseEnd: string, weeks: WeekLoad[], blockWeeks = 4, matchLoad: number | null = null): MesoBlock[] {
  const totalWeeks = Math.max(1, Math.round(daydiff(phaseStart, phaseEnd) / 7));
  const n = Math.max(1, Math.ceil(totalWeeks / blockWeeks));
  const byWeek = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const loadAt = (start: string, end: string) => byWeek.filter((w) => w.weekStart >= start && w.weekStart < end);
  const out: MesoBlock[] = [];
  for (let i = 0; i < n; i++) {
    const start = addDays(phaseStart, i * blockWeeks * 7);
    const end = i === n - 1 ? phaseEnd : addDays(phaseStart, (i + 1) * blockWeeks * 7);
    const inBlock = loadAt(start, end);
    const blockLoads = inBlock.map((w) => w.load).filter((x): x is number => x != null && x > 0);
    const priorLoads = byWeek.filter((w) => w.weekStart < start).slice(-4).map((w) => w.load).filter((x): x is number => x != null && x > 0);
    const acute = blockLoads.length ? mean(blockLoads) : null;
    const chronic = priorLoads.length ? mean(priorLoads) : acute;
    // TMr — the leading metric: how many matches' worth of load the week carries.
    const tmr = acute != null && matchLoad && matchLoad > 0 ? Math.round((acute / matchLoad) * 100) / 100 : null;
    // Acute-load trend (this is what actually drives the deload call, with readiness).
    const ratio = acute != null && chronic && chronic > 0 ? acute / chronic : null;
    const loadTrend: MesoBlock["loadTrend"] = ratio == null ? null : ratio > 1.15 ? "rising" : ratio < 0.9 ? "falling" : "steady";
    const sharpRise = ratio != null && ratio > 1.3; // a sharp week-over-week jump, not an ACWR verdict
    // ACWR — contested view only.
    const acwr = ratio != null ? Math.round(ratio * 100) / 100 : null;
    const rd = inBlock.map((w) => w.readiness).filter((x): x is number => x != null);
    const priorRd = byWeek.filter((w) => w.weekStart < start).slice(-2).map((w) => w.readiness).filter((x): x is number => x != null);
    const readinessDown = rd.length && priorRd.length ? mean(rd) < mean(priorRd) - 3 : false;
    const isDeload = sharpRise || readinessDown || (i > 0 && (i + 1) % 3 === 0); // sharp load jump / fatigue / planned every 3rd block
    const g = BLOCK_GOALS[Math.min(i, BLOCK_GOALS.length - 1)];
    const volumeTargetPct = isDeload ? 60 : acute != null ? Math.round(Math.min(1.1, Math.max(0.9, chronic && acute ? 1.08 : 1.0)) * 100) : 100;
    const flag: Bi | null = sharpRise ? { en: `Acute load rising sharply (${Math.round((ratio! - 1) * 100)}% over the prior 4 weeks) — deload recommended`, is: `Bráðaálag hækkar hratt (${Math.round((ratio! - 1) * 100)}% yfir síðustu 4 vikur) — mælt með niðurtröppun` }
      : readinessDown ? { en: "Readiness trending down — deload recommended", is: "Viðbragð lækkandi — mælt með niðurtröppun" }
        : isDeload ? { en: "Planned recovery block", is: "Áætluð endurheimtar-lota" } : null;
    out.push({
      index: i, phase: isDeload ? { en: "Deload", is: "Niðurtröppun" } : g.phase,
      goal: isDeload ? { en: "Recover — cut volume ~40%, keep intensity touches", is: "Endurheimt — minnka magn ~40%, halda ákefðar-snertingum" } : g.goal,
      start, end, weeks: Math.max(1, Math.round(daydiff(start, end) / 7)), isDeload, volumeTargetPct, flag,
      tmr, loadTrend, acwr, acwrNote: ACWR_CONTESTED,
    });
  }
  return out;
}

// ───────────────────────── INDIVIDUALISATION ─────────────────────────
export type IntervalZone = { type: number; label: Bi; pctMas: number; kmh: number | null };
/** Type 1–5 endurance interval speeds from the player's MAS (the coach's spreadsheet model, per
 *  player). MAS from a 4-min max / VIFT / Critical-Speed test. Buchheit & Laursen 2013 zones. */
export function intervalSpeedsFromMas(masKmh: number | null): IntervalZone[] {
  const BANDS: Array<{ type: number; pct: number; label: Bi }> = [
    { type: 1, pct: 70, label: { en: "Aerobic / recovery", is: "Loftháð / endurheimt" } },
    { type: 2, pct: 85, label: { en: "Extensive endurance", is: "Almennt þol" } },
    { type: 3, pct: 95, label: { en: "Threshold", is: "Þröskuldur" } },
    { type: 4, pct: 105, label: { en: "VO₂max (at MAS)", is: "VO₂max (við MAS)" } },
    { type: 5, pct: 120, label: { en: "Speed / anaerobic", is: "Hraði / loftfirrt" } },
  ];
  return BANDS.map((b) => ({ type: b.type, label: b.label, pctMas: b.pct, kmh: masKmh != null ? Math.round(masKmh * (b.pct / 100) * 10) / 10 : null }));
}

export type VbtRead = { exercise: string; latestLoadKg: number | null; latestMeanV: number | null; zone: Bi; note: Bi } | null;
/** A simple, honest strength read from the player's VBT: the velocity ZONE of his recent heavy work
 *  (Mann/Weakley bands) — max-strength <0.5, strength-speed 0.5–0.75, speed-strength >0.75 m/s. */
export function strengthFromVbt(exercise: string | null, latestLoadKg: number | null, latestMeanV: number | null): VbtRead {
  if (!exercise || latestMeanV == null) return null;
  const zone: Bi = latestMeanV < 0.5 ? { en: "max strength", is: "hámarksstyrkur" }
    : latestMeanV < 0.75 ? { en: "strength–speed", is: "styrkur–hraði" } : { en: "speed–strength", is: "hraði–styrkur" };
  return {
    exercise, latestLoadKg, latestMeanV, zone,
    note: { en: `Latest heavy set ${latestLoadKg ?? "–"} kg at ${latestMeanV.toFixed(2)} m/s → ${zone.en}. Set the block's target velocity and let load follow.`, is: `Nýjasta þunga sett ${latestLoadKg ?? "–"} kg á ${latestMeanV.toFixed(2)} m/s → ${zone.is}. Stilltu markhraða lotunnar og láttu álagið fylgja.` },
  };
}

// ───────────────────────── DATA READINESS ─────────────────────────
export type DataGap = { key: string; severity: "missing" | "stale" | "ok"; message: Bi };
/** Name the gap rather than fake a number — the manifesto's confidence idea applied to planning. */
export function dataReadiness(input: {
  hasCsTest: boolean; masAgeDays: number | null;   // endurance
  vbtAgeDays: number | null;                        // strength
  hasValdThisBlock: boolean;                        // volume caps
}): DataGap[] {
  const gaps: DataGap[] = [];
  if (!input.hasCsTest) gaps.push({
    key: "cs", severity: input.masAgeDays != null ? "ok" : "missing",
    message: input.masAgeDays != null
      ? { en: `No Critical Speed test — using the running-test MAS (${input.masAgeDays}d old) for interval speeds.`, is: `Enginn Critical Speed prófun — nota MAS úr hlaupaprófi (${input.masAgeDays}d) fyrir interval-hraða.` }
      : { en: "No Critical Speed or running test — endurance intervals fall back to the squad default.", is: "Ekkert Critical Speed eða hlaupapróf — interval fellur á sjálfgefið liðsgildi." },
  });
  if (input.masAgeDays != null && input.masAgeDays > 90) gaps.push({
    key: "mas", severity: "stale", message: { en: `Endurance test is ${input.masAgeDays} days old — refresh for accurate interval speeds.`, is: `Þolpróf er ${input.masAgeDays} daga gamalt — endurnýja fyrir nákvæma interval-hraða.` },
  });
  if (input.vbtAgeDays == null) gaps.push({
    key: "vbt", severity: "missing", message: { en: "No VBT profile — strength loads fall back to %1RM estimates.", is: "Enginn VBT prófíll — styrktarálag fellur á %1RM ágiskun." },
  });
  else if (input.vbtAgeDays > 60) gaps.push({
    key: "vbt", severity: "stale", message: { en: `VBT profile is ${input.vbtAgeDays} days old — refresh for accurate strength loads.`, is: `VBT prófíll er ${input.vbtAgeDays} daga gamall — endurnýja fyrir nákvæmt styrktarálag.` },
  });
  if (!input.hasValdThisBlock) gaps.push({
    key: "vald", severity: "missing", message: { en: "No VALD (force) data this block — volume caps use the squad default.", is: "Engin VALD (kraft) gögn þessa lotu — magn-þök nota sjálfgefið liðsgildi." },
  });
  return gaps;
}
