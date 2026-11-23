/**
 * Session STRUCTURES (training methods) the coach can tie to each MD day.
 *
 * Today the method per MD day is hard-coded in the engine (MD-3 = French
 * Contrast, MD-4 = cluster …). This lets a coach pick the method per MD day
 * instead; the engine then lays out the team PALETTE exercises in that method's
 * block shape at the correct MD dose. When a team has NOT chosen a structure for
 * a day, the engine falls back to the built-in template unchanged (zero drift).
 *
 * Two orientations, matched to the match countdown:
 *   - STRENGTH / POWER methods (heavier, potentiating) on MD-4 / MD-3 — cluster,
 *     straight sets, contrast, French contrast.
 *   - VELOCITY / EXPLOSIVE methods (light, fast, PAP) on MD-3 / MD-2 / MD-1 —
 *     a power/velocity contrast and an explosive potentiation cluster. Near the
 *     match the intent is speed, not load, so these deliberately override the dose
 *     to stay light + fast regardless of the day.
 * MD+1 (recovery) keeps its fixed template. Each method reuses the existing
 * structure library's how-to + citations via `howToKey`. Pure — no DB.
 */
import type { MdContext } from "./types";
import type { IsoMode } from "@/lib/micropulse/isometrics/protocols";

export type StructureKey =
  | "cluster"                // CLUSTER · mechanical-stress mini-cluster (Tufano CS2, 80%, 15s mid-set pause)
  | "cluster_max_strength"   // CLUSTER · heavy max-strength singles (Hansen: 4×6×1, ~12s inter-rep, ≥85%)
  | "cluster_hypertrophy"    // CLUSTER · hypertrophy + power (Tufano CS4, 75%, breaks after rep 4 & 8)
  | "cluster_metabolic"      // CLUSTER · metabolic conditioning (Oliver: 4×[5+5], 30s mid-set)
  | "straight_sets"          // one main lift, traditional straight sets
  | "contrast"               // heavy strength paired with a matched plyometric
  | "french_contrast"        // 4-part complex: heavy → plyo → loaded jump → med-ball (Liu 2023)
  | "power_contrast"         // velocity/power contrast: loaded fast lift + plyo (taper days)
  | "potentiation_cluster"   // explosive cluster: fast lift, velocity-based, PAP (taper days)
  | "overcoming_isometric"   // max-strength/RFD: overcoming iso, long length, high intent (Oranchuk 2023)
  | "iso_pap_primer"         // isometric conditioning → explosive: PAP primer (Krzysztofik 2023, Jarosz 2025)
  | "yielding_isometric"     // tissue/hypertrophy: yielding (HIMA) long-length holds (Lum 2026, Oranchuk 2019)
  | "supersets"              // time-efficient accumulation: lower+upper pair back-to-back (Robbins 2010)
  | "trisets";               // time-efficient accumulation: three exercises back-to-back (Weakley 2017)

export const STRUCTURE_KEYS: StructureKey[] = ["cluster", "cluster_max_strength", "cluster_hypertrophy", "cluster_metabolic", "straight_sets", "contrast", "french_contrast", "power_contrast", "potentiation_cluster", "overcoming_isometric", "iso_pap_primer", "yielding_isometric", "supersets", "trisets"];

export const STRUCTURE_LABEL: Record<StructureKey, { en: string; is: string }> = {
  cluster: { en: "Cluster · Mechanical stress (CS2)", is: "Cluster · Vélrænt álag (CS2)" },
  cluster_max_strength: { en: "Cluster · Max-strength singles", is: "Cluster · Hámarksstyrkur (einstök)" },
  cluster_hypertrophy: { en: "Cluster · Hypertrophy (CS4)", is: "Cluster · Vöðvastækkun (CS4)" },
  cluster_metabolic: { en: "Cluster · Metabolic (Oliver)", is: "Cluster · Efnaskipti (Oliver)" },
  straight_sets: { en: "Straight sets", is: "Bein sett" },
  contrast: { en: "Contrast (strength + plyo)", is: "Contrast (styrkur + plyo)" },
  french_contrast: { en: "French contrast (complex)", is: "French contrast (komplex)" },
  power_contrast: { en: "Contrast (power/velocity)", is: "Contrast (afl/hraði)" },
  potentiation_cluster: { en: "Potentiation cluster (explosive)", is: "Potentiation cluster (sprengikraftur)" },
  overcoming_isometric: { en: "Overcoming isometric (max strength)", is: "Overcoming ísómetría (hámarksstyrkur)" },
  iso_pap_primer: { en: "Isometric PAP primer (explosive)", is: "Ísómetrísk PAP-örvun (sprengikraftur)" },
  yielding_isometric: { en: "Yielding isometric (long-length holds)", is: "Yielding ísómetría (löng hald)" },
  supersets: { en: "Supersets (lower/upper pair)", is: "Samsett sett (neðri/efri par)" },
  trisets: { en: "Trisets (three back-to-back)", is: "Þrísett (þrjár í röð)" },
};

/** A concise sets×reps / intensity scheme shown in the coach picker, so a coach
 *  who doesn't know a protocol by name still sees exactly what it prescribes.
 *  Representative — the exact per-MD dose + full how-to live on the session card. */
export const STRUCTURE_SCHEME: Record<StructureKey, { en: string; is: string }> = {
  cluster: { en: "3×12 @80%, 15s mid-set pause", is: "3×12 @80%, 15s pása í miðju" },
  cluster_max_strength: { en: "4×(6×1) @85–90%, 12s between reps", is: "4×(6×1) @85–90%, 12s milli enda" },
  cluster_hypertrophy: { en: "3×12 @75%, break after rep 4 & 8", is: "3×12 @75%, pása eftir end 4 & 8" },
  cluster_metabolic: { en: "4×(5+5) @~75%, 30s mid-set", is: "4×(5+5) @~75%, 30s í miðju" },
  straight_sets: { en: "3×3–5, full rest", is: "3×3–5, full hvíld" },
  contrast: { en: "heavy 3 + plyo 3–5, 3 rounds", is: "þung 3 + plyo 3–5, 3 hringir" },
  french_contrast: { en: "4-exercise complex, 2–3 rounds", is: "4-æfinga komplex, 2–3 hringir" },
  power_contrast: { en: "fast lift 3 + plyo 3–5, light/fast", is: "hröð lyfta 3 + plyo 3–5, létt/hratt" },
  potentiation_cluster: { en: "3 fast reps ×3, 10% velocity cap", is: "3 hraðar ×3, 10% hraðaþak" },
  overcoming_isometric: { en: "4×5s max push, ≥70% MVC", is: "4×5s hámarks ýting, ≥70% MVC" },
  iso_pap_primer: { en: "3×(3×3s) iso → explosive set", is: "3×(3×3s) iso → sprengisett" },
  yielding_isometric: { en: "3×30–45s holds, sub-max", is: "3×30–45s hald, undir hámarki" },
  supersets: { en: "lower+upper pair, 3×8–10", is: "neðri+efri par, 3×8–10" },
  trisets: { en: "3 back-to-back, 3×8–10", is: "3 í röð, 3×8–10" },
};

/** Structure library id whose how-to + citations best matches this method
 *  (reused by the player card + coach card "how to perform"). */
export const STRUCTURE_HOWTO_KEY: Record<StructureKey, string> = {
  cluster: "tufano-cs2",
  cluster_max_strength: "hansen",
  cluster_hypertrophy: "tufano-cs4",
  cluster_metabolic: "oliver",
  straight_sets: "tufano-standard",
  contrast: "supersets-lower-upper",
  french_contrast: "french-contrast",
  power_contrast: "pc-french-contrast-style",
  potentiation_cluster: "tufano-cs2",
  overcoming_isometric: "overcoming-isometric",
  iso_pap_primer: "iso-pap-primer",
  yielding_isometric: "yielding-isometric",
  supersets: "supersets-lower-upper",
  trisets: "trisets",
};

/** Which methods are sensible (and correctly dosable) on each MD day. Strength/
 *  power methods on MD-4 / MD-3; velocity/explosive + isometric-PAP methods on the
 *  taper days. Overcoming isometrics (max strength/RFD) live on the strength days;
 *  the isometric PAP primer potentiates explosive work near the match.
 *
 *  Build-side (away from the next match): MD-5 is the earliest/heaviest development
 *  day (same strength set as MD-4); MD-4 strength, MD-3 power, then the taper days.
 *
 *  Recovery-side rebuild by days-since-match: MD+1 is minutes-aware — for a player
 *  who PLAYED it stays a FIXED recovery template, but for the LOW tier (DNP / <30 min)
 *  it is a real strength stimulus, so a chosen method is honoured ONLY for that tier
 *  (the engine guards this; a method set here never overrides a true recovery day).
 *  MD+2 moderate rebuild, MD+3 fuller strength day, MD+4 a full development day the
 *  furthest from the match. MD+1 (non-low) / MD+2 / MD+3 / MD+4 / MD-5 have no built-in
 *  session, so Default = rest — the coach OPTS IN by picking a method. */
export const STRUCTURES_ALLOWED_BY_MD: Partial<Record<MdContext, StructureKey[]>> = {
  // Build side — ordered by the match countdown (furthest first) for the UI.
  // Supersets / trisets are time-efficient ACCUMULATION methods (moderate load,
  // hypertrophy-leaning) — offered on the development days and the recovery-side
  // rebuild, NOT on the power day (MD-3) or the sharp taper days (MD-2 / MD-1),
  // where the intent is speed/potentiation, not volume.
  "MD-5": ["cluster", "straight_sets", "contrast", "french_contrast", "overcoming_isometric", "yielding_isometric", "supersets", "trisets", "cluster_max_strength"],
  "MD-4": ["cluster", "straight_sets", "contrast", "french_contrast", "overcoming_isometric", "yielding_isometric", "supersets", "trisets", "cluster_max_strength", "cluster_hypertrophy", "cluster_metabolic"],
  // No "cluster" on MD-3 (2026-11-23): the CS2 cluster is 3 × 12 at 80%, far over the day's 9 loaded reps, so the day
  // rule took the whole lift out and the player had no strength lift.
  "MD-3": ["french_contrast", "contrast", "straight_sets", "power_contrast", "potentiation_cluster", "overcoming_isometric", "iso_pap_primer"],
  "MD-2": ["power_contrast", "potentiation_cluster", "iso_pap_primer"],
  "MD-1": ["power_contrast", "potentiation_cluster", "iso_pap_primer"],
  // MD+1 LOW tier only (DNP / <30 min) — a real strength stimulus for the missed
  // match load; mirrors the MD-4 strength set. The engine ignores it for players who
  // played ≥30 min (recovery stands), so it never collides with mandatory recovery.
  "MD+1": ["cluster", "straight_sets", "contrast", "french_contrast", "overcoming_isometric", "yielding_isometric", "supersets", "trisets", "cluster_max_strength"],
  // Recovery-side rebuild (opt-in; moderate → fuller as you move away from the match).
  // The yielding-iso hold is the low-fatigue tissue/hypertrophy option on the rebuild days.
  "MD+2": ["straight_sets", "cluster", "power_contrast", "iso_pap_primer", "yielding_isometric", "supersets", "trisets", "cluster_hypertrophy", "cluster_metabolic"],
  "MD+3": ["cluster", "straight_sets", "contrast", "overcoming_isometric", "yielding_isometric", "supersets", "trisets", "cluster_hypertrophy", "cluster_metabolic"],
  "MD+4": ["cluster", "straight_sets", "contrast", "french_contrast", "overcoming_isometric", "yielding_isometric", "supersets", "trisets", "cluster_max_strength", "cluster_hypertrophy", "cluster_metabolic"],
};

/** What each configurable MD day does today (the engine default when the coach
 *  hasn't chosen — the fast-path stays on the built-in template). */
export const DEFAULT_STRUCTURE_BY_MD: Partial<Record<MdContext, StructureKey>> = {
  "MD-4": "cluster",
  "MD-3": "french_contrast",
};

/** Relative demand (fatigue / neural + coordination load) of each method, used for
 *  the readiness downgrade: a yellow player steps DOWN one rung. French contrast is
 *  the most demanding (4-part complex); straight sets + iso PAP primer are the
 *  lightest in their family. */
export const STRUCTURE_DEMAND: Record<StructureKey, number> = {
  french_contrast: 6,
  // Heavy max-strength singles are high CNS load — sit at the contrast tier so a
  // yellow player steps DOWN from them (to the CS2 cluster) and they are never a
  // lighter downgrade TARGET (contrast precedes them in every allow-list, so the
  // existing french→contrast step is unchanged).
  cluster_max_strength: 5,
  contrast: 5,
  cluster: 4,
  // Hypertrophy (CS4) + metabolic (Oliver) clusters are lighter accumulation than
  // the CS2 cluster — a yellow player on CS2 can step down to one of these.
  cluster_hypertrophy: 3,
  cluster_metabolic: 3,
  overcoming_isometric: 3,
  power_contrast: 3,
  potentiation_cluster: 3,
  straight_sets: 2,
  iso_pap_primer: 2,
  // Yielding long-length holds are low-fatigue (sub-max, no eccentric/ballistic
  // cost). Tie with the other light methods so it is never a downgrade TARGET — a
  // coach opts into it; a yellow player on it just trims sets (no lighter rung).
  yielding_isometric: 2,
  // Supersets / trisets are moderate accumulation. Kept at the light tier (= straight
  // sets) so they are never auto-selected as a downgrade target for the heavier
  // methods; a yellow player ON them just trims sets (no lighter in-family rung).
  supersets: 2,
  trisets: 2,
};

/** Push (PIMA) vs hold (HIMA) classification for the isometric-based structures
 *  (Lum, Oranchuk, Chen, Kong 2026). Both current iso methods are OVERCOMING —
 *  you press into an immovable resistance — i.e. PIMA/push, the strength + RFD
 *  variant, which is exactly what these MD-taper methods are for. The yielding/hold
 *  (HIMA) counterpart — better for muscle thickness / tissue — lives in the
 *  isometric-protocols library and the recovery-side long-iso holds (e.g. the MD+1
 *  iso lower-body block), not in this strength/power/velocity structure set.
 *  Absent for the non-isometric structures (they are not a push/hold choice). */
export const STRUCTURE_ISO_MODE: Partial<Record<StructureKey, IsoMode>> = {
  overcoming_isometric: "push",
  iso_pap_primer: "push",
  yielding_isometric: "hold",
};

/** The push/hold mode for a structure, or null when it is not an isometric method. */
export function structureIsoMode(key: StructureKey): IsoMode | null {
  return STRUCTURE_ISO_MODE[key] ?? null;
}

/** Training family — the downgrade stays WITHIN a family so a yellow player keeps
 *  the day's quality (a strength day steps to a lighter strength/iso method, a
 *  velocity day to a lighter velocity method), never crossing strength ↔ velocity. */
export const STRUCTURE_FAMILY: Record<StructureKey, "strength" | "velocity"> = {
  french_contrast: "strength",
  contrast: "strength",
  cluster: "strength",
  cluster_max_strength: "strength",
  cluster_hypertrophy: "strength",
  cluster_metabolic: "strength",
  overcoming_isometric: "strength",
  yielding_isometric: "strength",
  straight_sets: "strength",
  supersets: "strength",
  trisets: "strength",
  power_contrast: "velocity",
  potentiation_cluster: "velocity",
  iso_pap_primer: "velocity",
};

/** Readiness downgrade: the highest-demand method BELOW `chosen`, IN THE SAME
 *  family, still allowed on this MD day (French contrast → Contrast; Power contrast
 *  → Iso PAP primer). Returns null when nothing lighter in-family is available (the
 *  session then keeps the method and the normal set-reduction still applies). */
export function readinessDowngrade(chosen: StructureKey, md: MdContext): StructureKey | null {
  const allowed = STRUCTURES_ALLOWED_BY_MD[md] ?? [];
  const ceiling = STRUCTURE_DEMAND[chosen];
  const family = STRUCTURE_FAMILY[chosen];
  let best: StructureKey | null = null;
  for (const k of allowed) {
    if (STRUCTURE_FAMILY[k] !== family) continue;
    const d = STRUCTURE_DEMAND[k];
    if (d < ceiling && (best === null || d > STRUCTURE_DEMAND[best])) best = k;
  }
  return best;
}

/** Explicit "this MD day is OFF — no strength session" marker. Used by the traditional
 *  traditional approach (concentrate on 1–4 lift days, the rest Off) but valid on any day:
 *  a day marked "rest" delivers no team strength session, in any mode. */
export const REST_DAY = "rest" as const;
export type RestDay = typeof REST_DAY;
export const isRestDay = (v: unknown): v is RestDay => v === REST_DAY;

/** Methods with no main two-leg lift (no heavy lift to take a goal's heavy lift's place). Guarded by a test that
 *  builds every method. */
export const STRUCTURES_WITHOUT_MAIN_LIFT: ReadonlySet<StructureKey> = new Set<StructureKey>(["power_contrast", "potentiation_cluster", "overcoming_isometric", "iso_pap_primer", "yielding_isometric"]);

/** The team lifts heavy on this MD day: MD-4 or MD-3, not marked rest, and the day's method (or the built-in session)
 *  has a main lift. Read by the goal placement (goalPlan/today.ts) so a goal gym session goes inside that session. */
export function teamLiftsHeavyOn(md: string | null, structures: Partial<Record<string, StructureKey | RestDay>> | null | undefined): boolean {
  if (md !== "MD-4" && md !== "MD-3") return false;
  const pick = structures?.[md];
  if (isRestDay(pick)) return false;
  return !(pick && STRUCTURES_WITHOUT_MAIN_LIFT.has(pick));
}

/** Persisted shape (team_strength_palette.md_structures jsonb): MD day → method, or "rest" (OFF). */
export type MdStructures = Partial<Record<MdContext, StructureKey | RestDay>>;

export const isStructureKey = (s: string): s is StructureKey => (STRUCTURE_KEYS as string[]).includes(s);

/** Keep only valid MD→method entries whose method is allowed for that MD day. A "rest" (OFF)
 *  marker is valid on ANY day the coach can configure (it just suppresses that day's session). */
export function sanitizeMdStructures(raw: unknown): MdStructures {
  const out: MdStructures = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [md, allowed] of Object.entries(STRUCTURES_ALLOWED_BY_MD)) {
    const val = (raw as Record<string, unknown>)[md];
    if (isRestDay(val)) { out[md as MdContext] = REST_DAY; continue; }
    if (typeof val === "string" && isStructureKey(val) && allowed?.includes(val)) {
      out[md as MdContext] = val;
    }
  }
  return out;
}

/* ── Weeks without a match (2026-11-17) ─────────────────────────────────────────────────────────────────────────
 * With no match from 4 days back to 5 ahead there is no MD countdown, so every strength day used to read as MD-3.
 * The coach now says, per weekday, what kind of day it is in such a week. The METHOD still comes from the MD rows
 * above (one place to pick a method): a strength day builds as MD-4, a power day as MD-3, a light day as MD-2.
 * Persisted in team_strength_palette.no_match_week (jsonb). Applies to the individualised modes only; a week with a
 * match, or a day the coach set by hand, is unchanged. */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const NO_MATCH_DAY_KINDS = ["strength", "power", "light", "rest"] as const;
export type NoMatchDayKind = (typeof NO_MATCH_DAY_KINDS)[number];

/** One week's moves (2026-11-18, E): weekday → kind for that week only, e.g. the strength day moved to Tue because Mon
 *  is a day off that week. Keyed by the week's Monday (YYYY-MM-DD). Wins over the weekday plan for that week. */
export type NoMatchWeekMoves = Record<string, Partial<Record<Weekday, NoMatchDayKind>>>;

export type NoMatchWeek = Partial<Record<Weekday, NoMatchDayKind>> & { weeks?: NoMatchWeekMoves };

/** The MD row whose method a no-match day uses. */
export const NO_MATCH_DAY_MD: Record<Exclude<NoMatchDayKind, "rest">, MdContext> = {
  strength: "MD-4",
  power: "MD-3",
  light: "MD-2",
};

export const NO_MATCH_DAY_LABEL: Record<NoMatchDayKind, { en: string; is: string }> = {
  strength: { en: "Strength day", is: "Styrktardagur" },
  power: { en: "Power day", is: "Sprengikraftsdagur" },
  light: { en: "Light day", is: "Léttur dagur" },
  rest: { en: "Rest", is: "Hvíld" },
};

export const WEEKDAY_LABEL: Record<Weekday, { en: string; is: string; enShort: string; isShort: string }> = {
  mon: { en: "Monday", is: "mánudagur", enShort: "Mon", isShort: "Mán" },
  tue: { en: "Tuesday", is: "þriðjudagur", enShort: "Tue", isShort: "Þri" },
  wed: { en: "Wednesday", is: "miðvikudagur", enShort: "Wed", isShort: "Mið" },
  thu: { en: "Thursday", is: "fimmtudagur", enShort: "Thu", isShort: "Fim" },
  fri: { en: "Friday", is: "föstudagur", enShort: "Fri", isShort: "Fös" },
  sat: { en: "Saturday", is: "laugardagur", enShort: "Sat", isShort: "Lau" },
  sun: { en: "Sunday", is: "sunnudagur", enShort: "Sun", isShort: "Sun" },
};

const isNoMatchDayKind = (v: unknown): v is NoMatchDayKind =>
  typeof v === "string" && (NO_MATCH_DAY_KINDS as readonly string[]).includes(v);

/** Keep only weekday → kind entries (+ valid one-week moves); anything else is dropped (unset = as before). */
export function sanitizeNoMatchWeek(raw: unknown): NoMatchWeek {
  const out: NoMatchWeek = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const d of WEEKDAYS) {
    const v = (raw as Record<string, unknown>)[d];
    if (isNoMatchDayKind(v)) out[d] = v;
  }
  const weeks = sanitizeWeekMoves((raw as Record<string, unknown>).weeks);
  if (Object.keys(weeks).length) out.weeks = weeks;
  return out;
}

/** One-week moves: Monday date → weekday → kind. Bad keys / values dropped. */
export function sanitizeWeekMoves(raw: unknown): NoMatchWeekMoves {
  const out: NoMatchWeekMoves = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (weekdayOf(k) !== "mon" || !v || typeof v !== "object" || Array.isArray(v)) continue;
    const days: Partial<Record<Weekday, NoMatchDayKind>> = {};
    for (const d of WEEKDAYS) {
      const x = (v as Record<string, unknown>)[d];
      if (isNoMatchDayKind(x)) days[d] = x;
    }
    if (Object.keys(days).length) out[k] = days;
  }
  return out;
}

/** Drop moves for weeks that ended more than a week before `todayIso` (keeps the jsonb small). */
export function pruneWeekMoves(moves: NoMatchWeekMoves, todayIso: string): NoMatchWeekMoves {
  const cut = mondayOfIso(todayIso);
  const d = new Date(`${cut}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  const keepFrom = d.toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries(moves).filter(([k]) => k >= keepFrom));
}

/** The date the weekday plan was last changed (stored as `since` in the same jsonb), or null. The 8-week goal plans
 *  place session B by the plan only from the week AFTER this date, so a week already under way keeps its days. */
export function noMatchWeekSince(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = (raw as Record<string, unknown>).since;
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** The jsonb to store: the days, plus `since` = today when the days changed (else the stored `since` stays).
 *  One-week moves are always the STORED ones (they are saved on their own; a page holding an older copy must not
 *  undo them). */
export function noMatchWeekToStore(nextRaw: unknown, storedRaw: unknown, todayIso: string): NoMatchWeek & { since?: string } {
  const { weeks: _ignored, ...next } = sanitizeNoMatchWeek(nextRaw);
  void _ignored;
  const stored = sanitizeNoMatchWeek(storedRaw);
  const same = WEEKDAYS.every((d) => next[d] === stored[d]);
  const since = same ? noMatchWeekSince(storedRaw) : todayIso;
  const weeks = pruneWeekMoves(stored.weeks ?? {}, todayIso);
  return { ...next, ...(Object.keys(weeks).length ? { weeks } : {}), ...(since ? { since } : {}) };
}

/** The weekday of a YYYY-MM-DD date (calendar date, no time zone shift). Null for a bad date. */
export function weekdayOf(iso: string): Weekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return WEEKDAYS[(d.getUTCDay() + 6) % 7];
}

/** Monday (YYYY-MM-DD) of the week a date falls in; the date itself when it isn't a valid date. */
export function mondayOfIso(iso: string): string {
  const wd = weekdayOf(iso);
  if (!wd) return iso;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - WEEKDAYS.indexOf(wd));
  return d.toISOString().slice(0, 10);
}

/** A one-week move for this date (the coach moved a day for that week only), or null. */
export function noMatchMoveFor(iso: string, week: NoMatchWeek | null | undefined): NoMatchDayKind | null {
  const wd = weekdayOf(iso);
  return wd ? (week?.weeks?.[mondayOfIso(iso)]?.[wd] ?? null) : null;
}

/**
 * The weekday plan a team gets when the coach has set none (coach's call 2026-11-23, contradiction 14): Monday a
 * strength day, Thursday a power day, every other day light. Before, every training day in a week without a match was
 * a full MD-3 session, with no week rule and no Nordic / Copenhagen. Two heavy days three days apart, so the week rule
 * and the prevention rule run as in a planned week. Which days is MicroPulse's rule.
 */
export const DEFAULT_NO_MATCH_WEEK: Readonly<Record<Weekday, NoMatchDayKind>> = {
  mon: "strength", tue: "light", wed: "light", thu: "power", fri: "light", sat: "light", sun: "light",
};

/** True when the coach has set at least one weekday (one-week moves alone are not a plan). */
export function hasWeekdayPlan(week: NoMatchWeek | null | undefined): boolean {
  return !!week && WEEKDAYS.some((d) => week[d] != null);
}

/** The plan the engine builds by: the coach's, else the default with the coach's one-week moves kept. */
export function effectiveNoMatchWeek(week: NoMatchWeek | null | undefined): { week: NoMatchWeek; isDefault: boolean } {
  if (hasWeekdayPlan(week)) return { week: week!, isDefault: false };
  return { week: { ...DEFAULT_NO_MATCH_WEEK, ...(week?.weeks ? { weeks: week.weeks } : {}) }, isDefault: true };
}

/** What the coach set for this date in a week without a match: that week's move, else the weekday plan; null = unset. */
export function noMatchDayFor(iso: string, week: NoMatchWeek | null | undefined): NoMatchDayKind | null {
  if (!week) return null;
  const wd = weekdayOf(iso);
  if (!wd) return null;
  return noMatchMoveFor(iso, week) ?? week[wd] ?? null;
}
