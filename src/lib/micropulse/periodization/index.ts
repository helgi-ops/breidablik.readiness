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
  // Richer mechanical/IMA axis (Figueiredo, Buchheit directional gap) — nullable, shown only when the
  // club's feed carries them. accel/decel Band 2–3 = high-INTENSITY effort counts; strideHi = top-band
  // free-running stride count; rhie/symmetry/metabolic are presence-gated (absent even on some Pro feeds).
  accelHiEff: number | null; decelHiEff: number | null; strideHi: number | null;
  matchAccelHiEff: number | null; matchDecelHiEff: number | null; matchStrideHi: number | null;
  rhieBouts: number | null; runSymmetry: number | null; metabolicPower: number | null;
};

/** One player-session's GPS/IMA values (the loader maps player_external_load_daily rows). */
export type SessionRow = {
  isMatch: boolean; distanceM: number | null; hsrM: number | null; sprintM: number | null;
  maxKmh: number | null; playerLoad: number | null; plPerMin: number | null; accel: number | null; decel: number | null;
  accelHiEff?: number | null; decelHiEff?: number | null; strideHi?: number | null;
  rhieBouts?: number | null; runSymmetry?: number | null; metabolicPower?: number | null;
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
    accelHiEff: avg(col((r) => r.accelHiEff ?? null)), decelHiEff: avg(col((r) => r.decelHiEff ?? null)), strideHi: avg(col((r) => r.strideHi ?? null)),
    matchAccelHiEff: avg(col((r) => r.accelHiEff ?? null, matches)), matchDecelHiEff: avg(col((r) => r.decelHiEff ?? null, matches)), matchStrideHi: avg(col((r) => r.strideHi ?? null, matches)),
    rhieBouts: avg(col((r) => r.rhieBouts ?? null)), runSymmetry: avg(col((r) => r.runSymmetry ?? null)), metabolicPower: avg(col((r) => r.metabolicPower ?? null)),
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
export type MatchAxes = { running: AxisTarget; mechanical: AxisTarget; internal: AxisTarget; hsrDeficit: Bi | null; mechNeglect: Bi | null; capabilities: Bi[] };

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
  // The richer effort-count + striding metrics render only when the club's feed carries them.
  const mAccHi = b.matchAccelHiEff ?? null, mDecHi = b.matchDecelHiEff ?? null, mStride = b.matchStrideHi ?? null;
  const mechMetrics: AxisTarget["metrics"] = [
    { metric: { en: "Accel", is: "Hröðun" }, matchValue: mAcc?.toString() ?? "–", trainingCeiling: pct(mAcc, 1.5)?.toString() ?? "–", band: "131–166%" },
    { metric: { en: "Decel", is: "Hraðaminnkun" }, matchValue: mDec?.toString() ?? "–", trainingCeiling: pct(mDec, 1.2)?.toString() ?? "–", band: "108–134%" },
  ];
  if (mAccHi != null) mechMetrics.push({ metric: { en: "High-int accel eff (B2–3)", is: "Ákafar hröðunar-átök (B2–3)" }, matchValue: mAccHi.toString(), trainingCeiling: pct(mAccHi, 1.5)?.toString() ?? "–", band: "131–166%" });
  if (mDecHi != null) mechMetrics.push({ metric: { en: "High-int decel eff (B2–3)", is: "Ákafar hraðam.-átök (B2–3)" }, matchValue: mDecHi.toString(), trainingCeiling: pct(mDecHi, 1.2)?.toString() ?? "–", band: "108–134%" });
  if (mStride != null) mechMetrics.push({ metric: { en: "Top-band strides", is: "Efstu-banda skref" }, matchValue: mStride.toString(), trainingCeiling: pct(mStride, 1.0)?.toString() ?? "–", band: "≈100%" });
  const mechanical: AxisTarget = {
    axis: "mechanical", label: { en: "Mechanical / IMA", is: "Vélrænt / IMA" },
    matchNote: { en: "Training OVER-shoots the match here — plan it, don't stack it on an HSR day.", is: "Æfingar fara YFIR leikkröfu hér — skipuleggðu, ekki stafla á háhraða-dag." },
    metrics: mechMetrics, flag: null,
  };
  const internal: AxisTarget = {
    axis: "internal", label: { en: "Internal (sRPE / readiness)", is: "Innra (sRPE / viðbragð)" },
    matchNote: { en: "Caps the external axes by how the player is coping — readiness gates the day.", is: "Setur þak á ytri ásana eftir því hvernig leikmaðurinn ræður við — viðbragð stýrir deginum." },
    metrics: [], flag: null,
  };
  const hsrDeficit = mHsr != null && b.hsrM != null && b.hsrM < mHsr * 0.5
    ? { en: `Running loads well under match (session HSR ~${Math.round((b.hsrM / mHsr) * 100)}% of match) — don't chase distance while the HSR + mechanical axes go unaddressed.`, is: `Hlaupaálag langt undir leik (session HSR ~${Math.round((b.hsrM / mHsr) * 100)}% af leik) — ekki elta vegalengd meðan háhraði + vélræni ásinn eru vanræktir.` }
    : null;
  // Mechanical-neglect flag — the common failure mode: running is being loaded but the mechanical axis
  // is proportionally under-done. Figueiredo: mechanical should run AHEAD of match while running falls
  // short, so mechanical attainment (vs its match) below running's is the signal.
  const runAttain = mHsr != null && b.hsrM != null && mHsr > 0 ? b.hsrM / mHsr : null;
  const sessMech = (b.accel ?? 0) + (b.decel ?? 0), matchMech = (mAcc ?? 0) + (mDec ?? 0);
  const mechAttain = matchMech > 0 ? sessMech / matchMech : null;
  const mechNeglect = runAttain != null && mechAttain != null && runAttain > 0.2 && mechAttain < runAttain
    ? { en: `Running is being loaded but the mechanical axis lags (mechanical ~${Math.round(mechAttain * 100)}% vs running ~${Math.round(runAttain * 100)}% of match) — add accel/decel + change-of-direction work, don't only chase running.`, is: `Hlaupaálag er til staðar en vélræni ásinn dregst aftur úr (vélrænt ~${Math.round(mechAttain * 100)}% á móti hlaupi ~${Math.round(runAttain * 100)}% af leik) — bættu við accel/decel + stefnubreytingum, ekki bara elta hlaup.` }
    : null;
  const capabilities: Bi[] = [];
  if (b.rhieBouts != null) capabilities.push({ en: "RHIE (repeated high-intensity efforts) available — plan the repeated-sprint block.", is: "RHIE (endurteknar háákefðar-lotur) til staðar — skipuleggðu endurtekna-spretta lotu." });
  if (b.runSymmetry != null) capabilities.push({ en: "Running symmetry available — watch left/right imbalance as a fatigue/injury flag.", is: "Hlaupasamhverfa til staðar — fylgstu með vinstri/hægri ójafnvægi sem þreytu-/meiðslamerki." });
  if (b.metabolicPower != null) capabilities.push({ en: "Metabolic power available — the running↔mechanical energy bridge (di Prampero).", is: "Efnaskiptaafl til staðar — orkubrú milli hlaups og vélræns (di Prampero)." });
  return { running, mechanical, internal, hsrDeficit, mechNeglect, capabilities };
}

// ───────────────────── THE MATCH UNIT (per player) ─────────────────────
// The match is the reference unit. Define it from the player's OWN near-full matches (≥ ~80 min) in a
// rolling window: TYPICAL = median (the reference for weekly targets), PEAK = ~p90 (the worst case he
// must be prepared for). Per axis, because dimensions don't scale together (Figueiredo). Small sample →
// widen the window / fall back, and flag lower confidence. Works on GPS (Core) and sRPE (RPE-only).
export type MatchUnitMetric = { typical: number | null; peak: number | null };
export type PlayerMatchRow = {
  date: string; minutes: number | null;
  load: number | null; hsr: number | null; sprint: number | null; distance: number | null; accel: number | null; decel: number | null;
  // Mechanical / IMA (nullable — present only where the player's feed carries it).
  accHiEff?: number | null; decHiEff?: number | null; stride?: number | null;
  rhie?: number | null; symmetry?: number | null; metPower?: number | null;
};
export type MatchUnit = {
  nNearFull: number; nInWindow: number; fellBack: boolean; confidence: "high" | "medium" | "low";
  windowNote: Bi; minutesTypical: number | null;
  load: MatchUnitMetric; hsr: MatchUnitMetric; sprint: MatchUnitMetric; distance: MatchUnitMetric; accel: MatchUnitMetric; decel: MatchUnitMetric;
  accHiEff: MatchUnitMetric; decHiEff: MatchUnitMetric; stride: MatchUnitMetric; rhie: MatchUnitMetric; symmetry: MatchUnitMetric; metPower: MatchUnitMetric;
};
const median = (xs: number[]): number | null => {
  if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
};
const p90 = (xs: number[]): number | null => {
  if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.9 * s.length) - 1)] ?? s[s.length - 1];
};
/** The player's match unit from his near-full matches (median = typical, p90 = peak), per axis. */
export function computeMatchUnit(rows: PlayerMatchRow[], opts?: { minMinutes?: number; windowDays?: number; asOfMs?: number; minSample?: number }): MatchUnit {
  const minMinutes = opts?.minMinutes ?? 80, windowDays = opts?.windowDays ?? 77, minSample = opts?.minSample ?? 4;
  const nearFull = rows.filter((r) => r.minutes != null && r.minutes >= minMinutes);
  const asOf = opts?.asOfMs ?? (nearFull.length ? Math.max(...nearFull.map((r) => Date.parse(r.date))) : Date.now());
  const inWindow = nearFull.filter((r) => asOf - Date.parse(r.date) <= windowDays * 86_400_000);
  const fellBack = inWindow.length < minSample;
  const use = fellBack ? nearFull : inWindow; // widen to the full season's near-full matches on a thin window
  const metric = (sel: (r: PlayerMatchRow) => number | null): MatchUnitMetric => {
    const xs = use.map(sel).filter((x): x is number => x != null && Number.isFinite(x));
    return { typical: median(xs), peak: p90(xs) };
  };
  const confidence: MatchUnit["confidence"] = use.length >= 6 ? "high" : use.length >= minSample ? "medium" : "low";
  const windowNote: Bi = use.length === 0
    ? { en: "No near-full matches yet — using the position baseline instead.", is: "Engir næstum-heilir leikir enn — nota stöðu-grunnlínu í staðinn." }
    : fellBack
      ? { en: `Thin recent sample — widened to all ${use.length} near-full matches (≥${minMinutes} min) this season.`, is: `Lítið nýlegt úrtak — víkkað í alla ${use.length} næstum-heila leiki (≥${minMinutes} mín) tímabilsins.` }
      : { en: `${use.length} near-full matches (≥${minMinutes} min) in the last ~${Math.round(windowDays / 7)} weeks.`, is: `${use.length} næstum-heilir leikir (≥${minMinutes} mín) síðustu ~${Math.round(windowDays / 7)} vikur.` };
  return {
    nNearFull: nearFull.length, nInWindow: inWindow.length, fellBack, confidence, windowNote,
    minutesTypical: median(use.map((r) => r.minutes).filter((x): x is number => x != null)),
    load: metric((r) => r.load), hsr: metric((r) => r.hsr), sprint: metric((r) => r.sprint),
    distance: metric((r) => r.distance), accel: metric((r) => r.accel), decel: metric((r) => r.decel),
    accHiEff: metric((r) => r.accHiEff ?? null), decHiEff: metric((r) => r.decHiEff ?? null), stride: metric((r) => r.stride ?? null),
    rhie: metric((r) => r.rhie ?? null), symmetry: metric((r) => r.symmetry ?? null), metPower: metric((r) => r.metPower ?? null),
  };
}

// ───────────────────── WEEKLY TARGET FROM THE MATCH UNIT ─────────────────────
// Pre-season BUILDS ABOVE the match (no match spends load, more sessions) → a higher multiple of one
// match, split across the sessions. In-season you CANNOT freely multiply: the match already contributes
// ~20% and is the hardest single day, so a starter's week ≈ match + a modest, readiness-gated increment;
// a low-minute player is TOPPED UP toward the same team target (Teixeira 2021 ~80/20; the coach's model).
export type WeekTargetPlan = {
  phase: "preseason" | "inseason"; sessionCount: number;
  weeklyLoadTarget: number | null; perSessionLoad: number | null; matchMultiple: number | null;
  topUp: number | null; note: Bi; cite: string;
};
export function weeklyTargetFromMatch(matchTypicalLoad: number | null, opts: { phase: "preseason" | "inseason"; sessionCount: number; readinessCapPct?: number; minutesTypical?: number | null; matchMinutes?: number }): WeekTargetPlan {
  const sc = Math.max(1, Math.round(opts.sessionCount));
  const cap = Math.max(0, Math.min(1, (opts.readinessCapPct ?? 100) / 100));
  const cite = "Teixeira 2021 (~80/20 training/match) · Figueiredo (match as unit) · Little & Buchheit (not a norm)";
  if (matchTypicalLoad == null) {
    return { phase: opts.phase, sessionCount: sc, weeklyLoadTarget: null, perSessionLoad: null, matchMultiple: null, topUp: null, cite,
      note: { en: "No match unit yet — enter near-full matches (or friendlies in pre-season) to anchor the target.", is: "Ekkert leikvið enn — skráðu næstum-heila leiki (eða æfingaleiki í undirbúningi) til að festa markið." } };
  }
  if (opts.phase === "preseason") {
    // Supra-match capacity: the weekly multiple grows with session count (more sessions ⇒ more matches'
    // worth of load), then splits across the sessions. Base ~2.2× at 3 sessions, +~0.35× per extra session.
    const mult = Math.round(Math.min(4.2, Math.max(2.0, 2.2 + 0.35 * (sc - 3))) * 100) / 100;
    const weekly = Math.round(matchTypicalLoad * mult);
    return { phase: "preseason", sessionCount: sc, weeklyLoadTarget: weekly, perSessionLoad: Math.round(weekly / sc), matchMultiple: mult, topUp: null, cite,
      note: { en: `Pre-season: build ABOVE the match — ~${mult}× a match across ${sc} sessions (${Math.round(weekly / sc)}/session). More sessions raise the weekly multiple; each session's dose drops.`, is: `Undirbúningur: byggðu YFIR leikinn — ~${mult}× leik yfir ${sc} æfingar (${Math.round(weekly / sc)}/æfingu). Fleiri æfingar hækka vikumargfeldið; skammtur hverrar æfingar lækkar.` } };
  }
  // In-season: match (1×) + a readiness-gated training increment (~0.6× a match at full readiness).
  const increment = Math.round(matchTypicalLoad * 0.6 * cap);
  const weekly = Math.round(matchTypicalLoad + increment);
  const mm = opts.matchMinutes ?? 90;
  const playedFrac = opts.minutesTypical != null ? Math.max(0, Math.min(1, opts.minutesTypical / mm)) : 1;
  const topUp = Math.round(matchTypicalLoad * (1 - playedFrac)); // low-minute players get a larger training add-on
  return { phase: "inseason", sessionCount: sc, weeklyLoadTarget: weekly, perSessionLoad: Math.round(increment / Math.max(1, sc - 1)), matchMultiple: Math.round((weekly / matchTypicalLoad) * 100) / 100, topUp, cite,
    note: { en: `In-season: match + a readiness-gated increment (~${Math.round((weekly / matchTypicalLoad - 1) * 100)}% over one match, capped at ${Math.round(cap * 100)}% readiness). ${topUp > 0 ? `Low-minute top-up ≈ ${topUp} toward the team target.` : "Full-minute player — training add-on stays modest."}`, is: `Keppni: leikur + viðbragðs-stýrð viðbót (~${Math.round((weekly / matchTypicalLoad - 1) * 100)}% yfir einn leik, þak við ${Math.round(cap * 100)}% viðbragð). ${topUp > 0 ? `Áfylling fyrir fáar mínútur ≈ ${topUp} að liðsmarkinu.` : "Fullar mínútur — æfingaviðbót er hófleg."}` } };
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

// ───────────────────── MESO PLAN (plan-ahead editor + PDF block) ─────────────────────
// A 4–6-week block the coach schedules ahead: session count, block goal, and a progressive-overload
// ramp (deload every ~4th week). Each week is filled with the MD-anchored day-types (reusing
// mdWeekTargets), the week's numbers scaled by that week's overload %, the week type detected from the
// fixtures inside it. Pure — composes the same engine the live MD-week card uses.
export type MesoPlanWeek = {
  index: number; weekStart: string; weekType: MatchWeekType; overloadPct: number; isDeload: boolean;
  phase: Bi; sessions: MdDayTarget[]; weeklyLoadTarget: number | null; tmr: number | null; matchesInWeek: number;
};
export type MesoPlan = {
  goal: Bi; startDate: string; numWeeks: number; sessionsPerWeek: number; matchUnitLoad: number | null;
  weeks: MesoPlanWeek[]; notes: Bi[];
};
/** Scale a baseline's load-bearing fields by `f` (an overload/deload factor); intensities/direction stay. */
function scaleBaseline(b: TeamAverages, f: number): TeamAverages {
  const s = (n: number | null) => (n == null ? null : Math.round(n * f));
  return { ...b,
    distanceM: s(b.distanceM), hsrM: s(b.hsrM), sprintM: s(b.sprintM), playerLoad: s(b.playerLoad),
    accel: s(b.accel), decel: s(b.decel), accelHiEff: s(b.accelHiEff), decelHiEff: s(b.decelHiEff), strideHi: s(b.strideHi),
  };
}
export function buildMesoPlan(opts: {
  startDate: string; numWeeks: number; sessionsPerWeek: number; baseline: TeamAverages;
  mdShape?: Record<string, number>; fixtures: string[]; matchUnitLoad: number | null;
  baseOverloadPct?: number; stepPct?: number; goal?: Bi;
}): MesoPlan {
  const numWeeks = Math.max(1, Math.min(8, Math.round(opts.numWeeks)));
  const sessionsPerWeek = Math.max(1, Math.round(opts.sessionsPerWeek));
  const base = opts.baseOverloadPct ?? 100, step = opts.stepPct ?? 5;
  const baseTmr = Math.round((2.2 + 0.15 * (sessionsPerWeek - 3)) * 100) / 100; // more sessions → higher weekly multiple
  const fx = opts.fixtures.filter(Boolean).map((d) => Date.parse(d)).filter((n) => Number.isFinite(n));
  const goal = opts.goal ?? { en: "Progressive overload block", is: "Stígandi álags-lota" };
  const weeks: MesoPlanWeek[] = [];
  for (let i = 0; i < numWeeks; i++) {
    const weekStart = addDays(opts.startDate, i * 7);
    const wStartMs = Date.parse(weekStart), wEndMs = wStartMs + 7 * 86_400_000;
    const matchesInWeek = fx.filter((m) => m >= wStartMs && m < wEndMs).length;
    const weekType: MatchWeekType = matchesInWeek >= 3 ? "three_game" : matchesInWeek >= 2 ? "two_game" : "normal";
    const isDeload = (i + 1) % 4 === 0; // planned recovery every 4th week
    const overloadPct = isDeload ? 60 : Math.min(130, base + step * i);
    const sessions = mdWeekTargets(scaleBaseline(opts.baseline, overloadPct / 100), { mdShape: opts.mdShape, weekType });
    const weeklyLoadTarget = opts.matchUnitLoad != null ? Math.round(opts.matchUnitLoad * baseTmr * (overloadPct / 100)) : null;
    const tmr = opts.matchUnitLoad != null && opts.matchUnitLoad > 0 && weeklyLoadTarget != null ? Math.round((weeklyLoadTarget / opts.matchUnitLoad) * 100) / 100 : null;
    weeks.push({
      index: i, weekStart, weekType, overloadPct, isDeload,
      phase: isDeload ? { en: "Deload", is: "Niðurtröppun" } : goal,
      sessions, weeklyLoadTarget, tmr, matchesInWeek,
    });
  }
  const notes: Bi[] = [
    { en: "Targets scale from each player's own match unit — a starting point, never a norm to obey (Little & Buchheit).", is: "Álagsmörk skala frá eigin leikviðmiði hvers leikmanns — upphafspunktur, aldrei viðmið til að hlýða í blindni (Little & Buchheit)." },
    { en: "No single \"% of match\": mechanical work over-shoots the match, HSR/sprint fall short — read each axis on its own (Figueiredo).", is: "Ekkert eitt „%-af-leik“: vélrænt fer yfir leikinn, háhraði/sprettur ná ekki — lestu hvern ás sér (Figueiredo)." },
    { en: "Never stack HSR and mechanical work on the same day — protect the posterior chain (Mechanical MD-5 vs Locomotive MD-4).", is: "Aldrei stafla háhraða og vélrænu á sama dag — verndaðu afturkeðjuna (Mechanical MD-5 vs Locomotive MD-4)." },
    { en: "<30-min players get a Top-up toward the match unit; readiness gates every day and never raises a light one.", is: "<30-mín leikmenn fá Áfyllingu að leikviðmiðinu; viðbragð stýrir hverjum degi og hækkar aldrei léttan dag." },
    { en: "Descriptive planning — it never sets the readiness colour. The coach decides and overrides.", is: "Lýsandi áætlun — hún setur aldrei readiness-litinn. Þjálfarinn ákveður og hnekkir." },
  ];
  return { goal, startDate: opts.startDate, numWeeks, sessionsPerWeek, matchUnitLoad: opts.matchUnitLoad, weeks, notes };
}

// ───────────────────── CALENDAR BLOCK (the demo-format PDF) ─────────────────────
// A Mon–Sun calendar the whole block long, anchored to a weekly friendly that alternates Sat / Sun.
// Each session's absolute DIST/HSR/LOAD = the player's match unit × the day-type's share of the match ×
// that week's multiplier (the match day itself is always 100%). Mechanical over-shoots the match on
// LOAD while HSR sits under it per session (Figueiredo); HSR and mechanical never share a day. Rest days
// break the streak (never >3 sessions running); the deload week adds rest. Pure.
export type CalType = "mechanical" | "locomotive" | "mixed" | "activation" | "topup" | "match" | "rest";
/** The match reference unit, absolute. `dist/hsr/load/accdec` are the running + total-mechanical spine;
 *  the IMA fields are nullable and present only where the scope's feed carries them (tier/presence-gated):
 *  accHiEff/decHiEff = Acc/Dec Band 2–3 high-intensity effort counts (GPS-derivable → Core + Pro);
 *  stride = top-band free-running stride count (Pro/IMU); dirFwd/Back/Lat = the match direction split
 *  (fractions, Pro/IMU); rhie/symmetry/metPower = presence-gated Pro capabilities (absent on some feeds). */
export type MatchUnitAbs = {
  dist: number | null; hsr: number | null; load: number | null; accdec: number | null;
  accHiEff: number | null; decHiEff: number | null; stride: number | null;
  dirFwd: number | null; dirBack: number | null; dirLat: number | null;
  rhie: number | null; symmetry: number | null; metPower: number | null;
};
export type CalDay = {
  dow: Bi; md: string; type: CalType; label: Bi; focus: Bi; dist: number | null; hsr: number | null; load: number | null;
  // Mechanical / IMA per-day targets — null on rest days or when the unit lacks the field.
  accHiEff: number | null; decHiEff: number | null; stride: number | null;
  dir: { fwd: number; back: number; lat: number } | null;
};
export type CalWeek = { index: number; weekStart: string; intent: Bi; matchDow: Bi; mult: number; isDeload: boolean; days: CalDay[]; pctRunning: number | null; pctHsr: number | null; pctMech: number | null; pctAccDec23: number | null; pctStride: number | null; restDays: number };
export type CalendarBlock = { unit: MatchUnitAbs; scopeName: string; scopePos: string | null; phase: Bi; numWeeks: number; startDate: string; weeks: CalWeek[]; legend: Array<{ md: string; label: Bi; what: Bi }>; notes: Bi[] };

const DOW: Bi[] = [
  { en: "Mon", is: "Mán" }, { en: "Tue", is: "Þri" }, { en: "Wed", is: "Mið" }, { en: "Thu", is: "Fim" }, { en: "Fri", is: "Fös" }, { en: "Sat", is: "Lau" }, { en: "Sun", is: "Sun" },
];
// Each day-type's SHARE of the match, per axis (Figueiredo dimension-specific). `accdec` = the Acc/Dec
// Band 2–3 high-intensity subset (mechanical days over-shoot the match ≥1×; running days sit well under);
// `stride` = the top-band free-running quality (highest on the Locomotive/running day). Keeping HSR and
// mechanical on separate days protects the posterior chain (Buchheit).
const CAL_SHARE: Record<CalType, { dist: number; hsr: number; load: number; accdec: number; stride: number }> = {
  mechanical: { dist: 0.45, hsr: 0.30, load: 1.10, accdec: 1.30, stride: 0.50 },
  locomotive: { dist: 0.55, hsr: 0.70, load: 0.55, accdec: 0.40, stride: 0.90 },
  mixed: { dist: 0.70, hsr: 0.55, load: 0.85, accdec: 0.85, stride: 0.75 },
  activation: { dist: 0.30, hsr: 0.22, load: 0.40, accdec: 0.35, stride: 0.30 },
  topup: { dist: 0.40, hsr: 0.35, load: 0.40, accdec: 0.40, stride: 0.35 },
  match: { dist: 1, hsr: 1, load: 1, accdec: 1, stride: 1 },
  rest: { dist: 0, hsr: 0, load: 0, accdec: 0, stride: 0 },
};
/** Tilt a match direction split (fwd/back/lat fractions) by position — the movement signature the
 *  block emphasises: wingers/forwards more forward + lateral; defenders more backward + lateral (covering);
 *  midfielders slightly forward. Unknown position → the team split unchanged (Buchheit directional gap). */
function directionTilt(base: { fwd: number; back: number; lat: number } | null, pos: string | null): { fwd: number; back: number; lat: number } | null {
  if (!base) return null;
  const g = positionGroup(pos).key;
  let { fwd, back, lat } = base;
  if (g === 3) { fwd *= 1.15; lat *= 1.15; back *= 0.7; }       // forwards / wingers
  else if (g === 1) { back *= 1.3; lat *= 1.15; fwd *= 0.8; }   // defenders (covering)
  else if (g === 2) { fwd *= 1.05; }                            // midfielders
  const s = fwd + back + lat;
  return s > 0 ? { fwd: fwd / s, back: back / s, lat: lat / s } : base;
}
const CAL_LABEL: Record<CalType, Bi> = {
  mechanical: { en: "Mechanical", is: "Mechanical" }, locomotive: { en: "Locomotive", is: "Locomotive" },
  mixed: { en: "Mixed", is: "Mixed" }, activation: { en: "Activation", is: "Virkjun" },
  topup: { en: "Top-up", is: "Áfylling" }, match: { en: "FRIENDLY (match)", is: "Æfingaleikur" }, rest: { en: "Rest day", is: "Hvíldardagur" },
};
const CAL_FOCUS: Record<CalType, Bi> = {
  mechanical: { en: "Tight-space accel/decel — mechanical overload; low HSR (protect hamstrings).", is: "Þröngt rými accel/decel — vélrænt yfirálag; lágt háhraðahlaup (verndar aftanlæri)." },
  locomotive: { en: "Open-space running capacity — week's highest HSR block; lower mechanical.", is: "Opið rými, hlaupageta — hæsti háhraða-dagur vikunnar; minna vélrænt." },
  mixed: { en: "Match-like stimulus — biggest overall session; balanced HSR + mechanical.", is: "Leiklíkt áreiti — stærsta æfing vikunnar; jafnvægi háhraða + vélræns." },
  activation: { en: "Primer only — sharpen, don't fatigue. Lowest day.", is: "Aðeins virkjun — skerpa, ekki þreyta. Léttasti dagur." },
  topup: { en: "Compensatory session for <60' players; recovery for starters. Light.", is: "Uppbót fyrir <60' leikmenn; endurheimt fyrir byrjunarlið. Létt." },
  match: { en: "Practice match = the reference unit (100%).", is: "Æfingaleikur = viðmiðunareiningin (100%)." },
  rest: { en: "Full day off — passive recovery.", is: "Heill frídagur — óvirk endurheimt." },
};
const mondayOfIso = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };

export function buildCalendarBlock(opts: {
  unit: MatchUnitAbs; startDate: string; numWeeks: number; scopeName: string; scopePos?: string | null;
  phase?: Bi; baseOverloadPct?: number; stepPct?: number;
  /** Coach-set skeleton (connected to fixtures / Week Setup). When given, matches anchor to THESE dates
   *  instead of the auto Sat/Sun; `offDays` are forced rest; `onDays` force a session where the solver
   *  would have rested (default a Mixed session). The engine fills the day-TYPES + loads around them. */
  matchDates?: string[]; offDays?: string[]; onDays?: string[];
  /** Per-day coach override of the computed day-type (Mechanical/Locomotive/Mixed/Activation/Top-up/rest),
   *  keyed by ISO date — authoritative for non-match days; the day's loads recompute from the chosen type. */
  typeOverrides?: Record<string, CalType>;
  /** Per-PLAYER individualisation (same skeleton, individual numbers): `maxMult` caps the weekly
   *  multiplier (readiness-to-load / VALD cap); `loadScale` trims every training day (minutes-based —
   *  high-minute starters carry load from matches); `emphasis` biases the running (`hsr`) and mechanical
   *  (`mech`) day-type shares by position (Figueiredo). Match days stay the exact unit (100%). */
  maxMult?: number; loadScale?: number; emphasis?: { hsr?: number; mech?: number };
}): CalendarBlock {
  const n = Math.max(1, Math.min(10, Math.round(opts.numWeeks)));
  const base = opts.baseOverloadPct ?? 100, step = opts.stepPct ?? 8;
  const start = mondayOfIso(opts.startDate);
  const DAY = 86_400_000, firstMs = Date.parse(start), total = n * 7;
  const inBlock = (iso: string) => { const k = Math.round((Date.parse(iso) - firstMs) / DAY); return k >= 0 && k < total; };
  const weekIdxOf = (iso: string) => Math.floor(Math.round((Date.parse(iso) - firstMs) / DAY) / 7);
  // Matches: the coach's fixtures/skeleton when provided, else one per week alternating Sat / Sun.
  const matchIdxOf = (i: number) => (i % 2 === 0 ? 5 : 6);
  const autoMatch = Array.from({ length: n }, (_, i) => addDays(start, i * 7 + matchIdxOf(i)));
  const matchIso = [...new Set((opts.matchDates && opts.matchDates.length ? opts.matchDates : autoMatch).filter(inBlock))].sort();
  const matchSet = new Set(matchIso);
  const matchMs = matchIso.map((d) => Date.parse(d));
  const offSet = new Set((opts.offDays ?? []).filter(inBlock));
  const onSet = new Set((opts.onDays ?? []).filter(inBlock));
  const lastWeek = n - 1;
  // Build-up templates (evidence-ordered): roomy weeks get Mechanical→Locomotive→Mixed→Off→Activation;
  // tight weeks compress to Locomotive→Mixed→Off (drop Mechanical + Activation); deload inserts extra rest.
  const LT: CalType[] = ["mechanical", "locomotive", "mixed", "rest", "activation"];
  const ST: CalType[] = ["locomotive", "mixed", "rest"];
  const DLT: CalType[] = ["locomotive", "rest", "mixed", "rest", "activation"];
  // Assign a day-type + MD label to every calendar day of the block (a continuous match stream).
  const dayType: CalType[] = [], dayMd: string[] = [];
  for (let k = 0; k < total; k++) {
    const dMs = firstMs + k * DAY, dIso = addDays(start, k);
    if (matchSet.has(dIso)) { dayType.push("match"); dayMd.push("MD-0"); continue; }
    let prevMs = -Infinity, nextMs = Infinity, nextIdx = -1;
    for (let j = 0; j < matchMs.length; j++) { if (matchMs[j] < dMs && matchMs[j] > prevMs) prevMs = matchMs[j]; if (matchMs[j] > dMs && matchMs[j] < nextMs) { nextMs = matchMs[j]; nextIdx = j; } }
    const dPrev = prevMs > -Infinity ? Math.round((dMs - prevMs) / DAY) : Infinity;
    const md = nextMs < Infinity ? `MD-${Math.round((nextMs - dMs) / DAY)}` : dPrev === 1 ? "MD+1" : "MD+2";
    if (dPrev === 1) { dayType.push("topup"); dayMd.push("MD+1"); continue; }   // post-match top-up (Buchheit)
    if (dPrev === 2) { dayType.push("rest"); dayMd.push("MD+2"); continue; }     // then a full day off
    if (nextMs < Infinity) {
      const gapStartMs = prevMs > -Infinity ? prevMs + 3 * DAY : firstMs;         // first buildable day after recovery
      const slots = Math.round((nextMs - gapStartMs) / DAY);
      const idx = Math.round((dMs - gapStartMs) / DAY);
      const isDeloadMatch = weekIdxOf(matchIso[nextIdx]) === lastWeek && n >= 3;
      const tpl = isDeloadMatch ? DLT : slots >= 4 ? LT : ST;                      // roomy → full; tight → compressed
      const tIdx = idx + (tpl.length - slots);                                     // align template to the match (end)
      dayType.push(tIdx >= 0 && tIdx < tpl.length ? tpl[tIdx] : "rest");
      dayMd.push(md);
    } else { dayType.push("rest"); dayMd.push(md); }
  }
  // Coach overrides: force off → rest; force on → a session where the solver rested (default Mixed);
  // then per-day type overrides (authoritative for non-match days — the coach picked the quality).
  const ovr = opts.typeOverrides ?? {};
  for (let k = 0; k < total; k++) {
    const dIso = addDays(start, k);
    if (offSet.has(dIso) && dayType[k] !== "match") dayType[k] = "rest";
    else if (onSet.has(dIso) && dayType[k] === "rest") dayType[k] = "mixed";
    if (ovr[dIso] && dayType[k] !== "match") dayType[k] = ovr[dIso];
  }
  // Safety: never more than 3 sessions (any on-day incl. match/top-up) in a row — scan the whole block.
  const coachPinned = (k: number) => { const iso = addDays(start, k); return onSet.has(iso) || !!ovr[iso]; };
  let run = 0;
  for (let k = 0; k < total; k++) {
    if (dayType[k] === "rest") { run = 0; continue; }
    run++;
    if (run > 3) { if (dayType[k] !== "match" && !coachPinned(k)) { dayType[k] = "rest"; run = 0; } else run = 3; } // never override a coach-forced/-typed session
  }
  const capMult = opts.maxMult ?? 1.4, loadScale = opts.loadScale ?? 1;
  const hsrEmph = opts.emphasis?.hsr ?? 1, mechEmph = opts.emphasis?.mech ?? 1;
  // Direction signature: the raw match split (unit) on the match day; position-tilted on training days.
  const dirBase = opts.unit.dirFwd != null && opts.unit.dirBack != null && opts.unit.dirLat != null
    ? { fwd: opts.unit.dirFwd, back: opts.unit.dirBack, lat: opts.unit.dirLat } : null;
  const dirTilted = directionTilt(dirBase, opts.scopePos ?? null);
  const weeks: CalWeek[] = [];
  for (let i = 0; i < n; i++) {
    const isDeload = i === n - 1 && n >= 3; // classic end-of-block unload
    const mult = isDeload ? 0.6 : Math.min(1.4, capMult, (base + step * i) / 100);
    const weekStart = addDays(start, i * 7);
    const days: CalDay[] = [];
    let sumDist = 0, sumHsr = 0, sumLoad = 0, sumAccHi = 0, sumDecHi = 0, sumStride = 0, rest = 0;
    for (let d = 0; d < 7; d++) {
      const k = i * 7 + d;
      const type = dayType[k], md = dayMd[k];
      const sh = CAL_SHARE[type];
      const f = type === "match" ? 1 : mult * loadScale;
      const rnd = (v: number, step2: number) => Math.round(v / step2) * step2;
      // The match row shows the exact unit (100% reference); training rows round (dist 10 m, HSR 5 m) and
      // carry the position emphasis on the running (HSR) and mechanical (load) axes.
      const dist = type === "rest" || opts.unit.dist == null ? null : type === "match" ? opts.unit.dist : rnd(opts.unit.dist * sh.dist * f, 10);
      const hsr = type === "rest" || opts.unit.hsr == null ? null : type === "match" ? opts.unit.hsr : rnd(opts.unit.hsr * sh.hsr * hsrEmph * f, 5);
      const load = type === "rest" || opts.unit.load == null ? null : type === "match" ? opts.unit.load : Math.round(opts.unit.load * sh.load * mechEmph * f);
      // Mechanical / IMA per-day targets (share × week factor); mechanical emphasis on the effort counts,
      // running emphasis on the free-running stride. Null on rest days or where the unit lacks the field.
      const accHiEff = type === "rest" || opts.unit.accHiEff == null ? null : type === "match" ? opts.unit.accHiEff : Math.round(opts.unit.accHiEff * sh.accdec * mechEmph * f);
      const decHiEff = type === "rest" || opts.unit.decHiEff == null ? null : type === "match" ? opts.unit.decHiEff : Math.round(opts.unit.decHiEff * sh.accdec * mechEmph * f);
      const stride = type === "rest" || opts.unit.stride == null ? null : type === "match" ? opts.unit.stride : Math.round(opts.unit.stride * sh.stride * hsrEmph * f);
      const dir = type === "rest" ? null : type === "match" ? dirBase : dirTilted;
      if (type === "rest") rest += 1;
      else if (type !== "match") { sumDist += dist ?? 0; sumHsr += hsr ?? 0; sumLoad += load ?? 0; sumAccHi += accHiEff ?? 0; sumDecHi += decHiEff ?? 0; sumStride += stride ?? 0; }
      days.push({ dow: DOW[d], md, type, label: CAL_LABEL[type], focus: CAL_FOCUS[type], dist, hsr, load, accHiEff, decHiEff, stride, dir });
    }
    const unitAccDec = (opts.unit.accHiEff ?? 0) + (opts.unit.decHiEff ?? 0);
    const intent: Bi = i === 0 ? { en: "Introduce", is: "Kynna" } : isDeload ? { en: "Deload", is: "Niðurtröppun" } : i === n - 2 ? { en: "Overload · peak", is: "Yfirálag · toppur" } : i <= (n - 1) / 2 ? { en: "Progress", is: "Framvinda" } : { en: "Overload", is: "Yfirálag" };
    const matchDayIdx = days.findIndex((d) => d.type === "match");
    const matchDow: Bi = matchDayIdx >= 0 ? DOW[matchDayIdx] : { en: "—", is: "—" };
    weeks.push({
      index: i, weekStart, intent, matchDow, mult: Math.round(mult * 100) / 100, isDeload, days,
      pctRunning: opts.unit.dist ? Math.round((sumDist / opts.unit.dist) * 100) : null,
      pctHsr: opts.unit.hsr ? Math.round((sumHsr / opts.unit.hsr) * 100) : null,
      pctMech: opts.unit.load ? Math.round((sumLoad / opts.unit.load) * 100) : null,
      pctAccDec23: unitAccDec > 0 ? Math.round(((sumAccHi + sumDecHi) / unitAccDec) * 100) : null,
      pctStride: opts.unit.stride ? Math.round((sumStride / opts.unit.stride) * 100) : null,
      restDays: rest,
    });
  }
  const legend = [
    { md: "MD-0", label: CAL_LABEL.match, what: { en: "Reference unit (100%). Alternates Sat / Sun.", is: "Viðmiðunareining (100%). Skiptist Lau / Sun." } },
    { md: "MD+1", label: CAL_LABEL.topup, what: { en: "Light compensatory for <60' players; recovery for starters.", is: "Létt uppbót fyrir <60' leikmenn; endurheimt fyrir byrjunarlið." } },
    { md: "MD+2", label: { en: "Off", is: "Frí" }, what: { en: "Full rest day — 48 h after the match.", is: "Heill frídagur — 48 klst eftir leik." } },
    { md: "MD-5", label: CAL_LABEL.mechanical, what: { en: "Tight-space accel/decel — mechanical overload.", is: "Þröngt rými accel/decel — vélrænt yfirálag." } },
    { md: "MD-4", label: CAL_LABEL.locomotive, what: { en: "Highest-HSR running day.", is: "Hæsti háhraða-hlaupadagur." } },
    { md: "MD-3", label: CAL_LABEL.mixed, what: { en: "Biggest overall session; balanced.", is: "Stærsta æfing; jafnvægi." } },
    { md: "MD-1", label: CAL_LABEL.activation, what: { en: "Primer — sharpen, don't fatigue.", is: "Virkjun — skerpa, ekki þreyta." } },
  ];
  const notes: Bi[] = [
    { en: "The match is the unit — every training day is a share of one near-full match, scaled by the week multiplier.", is: "Leikurinn er einingin — hver æfingadagur er hlutfall af einum næstum-heilum leik, skalað með vikumargfeldi." },
    { en: "Mechanical work over-shoots the match on load; HSR sits under it per session — never stack them on one day (Figueiredo; hamstring protection).", is: "Vélrænt fer yfir leikinn í álagi; háhraði er undir per æfingu — aldrei stafla þeim á einn dag (Figueiredo; aftanlæris-vernd)." },
    { en: "Mechanical days load Acc/Dec Band 2–3 (high-intensity efforts) + strength; Locomotive days load free-running strides + HSR — the split that protects the posterior chain (Buchheit).", is: "Mechanical-dagar hlaða Acc/Dec Band 2–3 (ákafar átök) + styrk; Locomotive-dagar hlaða frjáls-hlaupa skref + háhraða — skiptingin sem verndar afturkeðjuna (Buchheit)." },
    { en: "A starting point anchored to the player's data, never a norm to obey (Little & Buchheit). Descriptive — never the readiness colour.", is: "Upphafspunktur festur í gögnum leikmannsins, aldrei viðmið til að hlýða (Little & Buchheit). Lýsandi — aldrei readiness-liturinn." },
  ];
  return { unit: opts.unit, scopeName: opts.scopeName, scopePos: opts.scopePos ?? null, phase: opts.phase ?? { en: "Pre-season", is: "Undirbúningstímabil" }, numWeeks: n, startDate: start, weeks, legend, notes };
}

/** Weeks with 2+ matches inside a calendar week (congested). Each such week's Monday + match count. */
export function congestedWeeks(fixtureDates: string[]): Array<{ weekStart: string; matches: number }> {
  const byWeek = new Map<string, number>();
  const monday = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10); };
  for (const d of fixtureDates) if (d) byWeek.set(monday(d), (byWeek.get(monday(d)) ?? 0) + 1);
  return [...byWeek.entries()].filter(([, n]) => n >= 2).sort((a, b) => a[0].localeCompare(b[0])).map(([weekStart, matches]) => ({ weekStart, matches }));
}

// ───────────────────── BLOCK-GOAL RECOMMENDER (rules decide, coach overrides) ─────────────────────
// Which block goal fits right now? Block periodisation runs Accumulation → Transmutation → Realization,
// with Deload as the unload (Issurin 2010). The pick is deterministic from signals the hub already has,
// in priority order: fatigue (deload overrides everything) → season phase → runway/fixture density →
// sequence position. It's a grounded DEFAULT the coach overrides — never auto-applied (Little & Buchheit).
export type BlockGoalKey = "accum" | "transmute" | "realize" | "deload";
export const BLOCK_GOAL_LABEL: Record<BlockGoalKey, Bi> = {
  accum: { en: "Accumulation", is: "Uppsöfnun" },
  transmute: { en: "Transmutation", is: "Umbreyting" },
  realize: { en: "Realization", is: "Framkvæmd" },
  deload: { en: "Deload", is: "Niðurtröppun" },
};
/** The recommended block GOAL is always one of the three (Accumulation / Transmutation / Realization).
 *  `deloadNow` is a SEPARATE week-level signal — fatigue pulls the block's deload week forward (or inserts
 *  an extra one); it never changes the block's goal. Deload is not a recommendable goal (it's the unload
 *  week every block already ends with). */
export type RecGoalKey = "accum" | "transmute" | "realize";
export type BlockGoalRec = { goal: RecGoalKey; confidence: "high" | "medium" | "low"; reasons: Bi[]; alternative: { goal: RecGoalKey; when: Bi }; deloadNow: boolean };
const nextInSequence = (prev: BlockGoalKey | null): RecGoalKey => (prev === "accum" ? "transmute" : prev === "transmute" ? "realize" : "accum"); // realize/deload/none → back to accum

export function recommendBlockGoal(opts: {
  phaseKey: "preseason" | "competitive" | "offseason" | null;
  weeksToNextFixture: number | null; matchesPerWeek: number | null;
  deloadNow: boolean; deloadReason: Bi | null; prevGoal: BlockGoalKey | null;
  fixturesLoaded: number; loadHistoryWeeks: number;
}): BlockGoalRec {
  const thin = opts.fixturesLoaded < 3 || opts.loadHistoryWeeks < 4;
  const hintCaveat: Bi = { en: "Few fixtures / thin load history — read this as a hint, not a verdict.", is: "Fáir leikir / lítil álags-saga — lestu sem vísbendingu, ekki dóm." };
  const cap = (c: "high" | "medium" | "low"): "high" | "medium" | "low" => (thin && c === "high" ? "medium" : thin ? "low" : c);
  const seq = nextInSequence(opts.prevGoal);

  // The GOAL comes from the season signals (phase → runway → sequence). Deload is handled separately below.
  let base: Omit<BlockGoalRec, "deloadNow">;
  if (opts.phaseKey === "preseason") {
    // Season phase — pre-season is the base-building block.
    base = { goal: "accum", confidence: cap("high"),
      reasons: [{ en: "Pre-season — build the base: work capacity, max-strength, aerobic/HSR.", is: "Undirbúningur — byggðu grunninn: þol, hámarksstyrkur, loftháð/háhraði." }, ...(thin ? [hintCaveat] : [])],
      alternative: { goal: "transmute", when: { en: "Convert to strength-power + speed once the capacity base is in.", is: "Umbreyttu í styrk-kraft + hraða þegar grunngetan er komin." } } };
  } else {
    const nearKey = opts.weeksToNextFixture != null && opts.weeksToNextFixture <= 3;
    const congested = opts.matchesPerWeek != null && opts.matchesPerWeek >= 1.5;
    if (nearKey || congested) {
      // Runway to the next key fixture / congestion → peak & freshen.
      const r: Bi[] = [];
      if (nearKey) r.push({ en: `Key fixture ~${opts.weeksToNextFixture} week(s) out — peak and taper (low volume, high intensity).`, is: `Mikilvægur leikur eftir ~${opts.weeksToNextFixture} viku(r) — toppaðu og trappaðu niður (lítið magn, mikil ákefð).` });
      if (congested) r.push({ en: "Congested run — hold freshness, don't accumulate.", is: "Þéttur leikjakafli — haltu ferskleika, ekki safna álagi." });
      if (opts.prevGoal !== "transmute" && opts.prevGoal !== "accum") r.push({ en: "Note: little build behind this — a short sharpening block, not a true peak.", is: "Athuga: lítil uppbygging að baki — stutt skerpingar-lota, ekki fullur toppur." });
      base = { goal: "realize", confidence: cap(nearKey && congested ? "high" : "medium"), reasons: [...r, ...(thin ? [hintCaveat] : [])],
        alternative: { goal: "transmute", when: { en: "Transmutation instead if there's still runway to build before the fixture.", is: "Umbreyting frekar ef enn er tími til að byggja fyrir leikinn." } } };
    } else {
      // Sequence position (open runway) — enforce the logical order from the last block.
      const reasons: Bi[] = [
        { en: `Open runway${opts.weeksToNextFixture != null ? ` (~${opts.weeksToNextFixture} weeks to the next fixture)` : ""} — follow the block sequence.`, is: `Rúmur tími${opts.weeksToNextFixture != null ? ` (~${opts.weeksToNextFixture} vikur í næsta leik)` : ""} — fylgdu lotu-röðinni.` },
        opts.prevGoal ? { en: `Last block was ${BLOCK_GOAL_LABEL[opts.prevGoal].en} → ${BLOCK_GOAL_LABEL[seq].en} next.`, is: `Síðasta lota var ${BLOCK_GOAL_LABEL[opts.prevGoal].is} → ${BLOCK_GOAL_LABEL[seq].is} næst.` } : { en: "No prior block — start by accumulating a base.", is: "Engin fyrri lota — byrjaðu á að safna grunni." },
      ];
      base = { goal: seq, confidence: cap(opts.prevGoal ? "medium" : "low"), reasons: [...reasons, ...(thin ? [hintCaveat] : [])],
        alternative: { goal: "realize", when: { en: "Shift to Realization as a key fixture comes within ~3 weeks.", is: "Færðu í Framkvæmd þegar mikilvægur leikur er innan ~3 vikna." } } };
    }
  }

  // Fatigue is a WEEK-level action, not a goal change: pull the block's deload week forward. Prepend the
  // reason so the coach sees it above the goal rationale; the goal itself stays what the season signals say.
  if (opts.deloadNow) {
    const pull: Bi = { en: "Load spiking / readiness drifting — pull this block's deload week forward (or add one). The block goal is unchanged.", is: "Álag rýkur upp / viðbragð lækkar — færðu niðurtröppunar-viku lotunnar framar (eða bættu einni við). Markmið lotunnar helst." };
    return { ...base, deloadNow: true, reasons: [opts.deloadReason ?? pull, ...base.reasons] };
  }
  return { ...base, deloadNow: false };
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
  index: number; phase: Bi; goal: Bi; goalKey: BlockGoalKey; start: string; end: string; weeks: number;
  /** A deload is a WEEK, never a block: `deloadWeekStart` is the Monday of this block's deload week (the
   *  last week by default, snapped to the lightest fixture week near the end; pulled forward when fatigued).
   *  `deloadNow` = fatigue-triggered pull-forward. `isDeload` mirrors `deloadNow` for legacy consumers. */
  deloadWeekStart: string | null; deloadNow: boolean; isDeload: boolean;
  volumeTargetPct: number | null; flag: Bi | null;
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
const GOAL_BY_KEY: Record<RecGoalKey, { phase: Bi; goal: Bi }> = { accum: BLOCK_GOALS[0], transmute: BLOCK_GOALS[1], realize: BLOCK_GOALS[2] };
// The block sequence: open with Accumulation, then repeat Transmutation → Realization (Issurin 2010).
const blockGoalAt = (i: number): RecGoalKey => (i === 0 ? "accum" : i % 2 === 1 ? "transmute" : "realize");

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
 * injury predictor, not a target). Every block keeps a real goal (Accumulation → Transmutation →
 * Realization) and ENDS IN A DELOAD WEEK — the deload is never a standalone block. `deloadWeekStart` is
 * the deload week's Monday: the block's last week, snapped to the LIGHTEST fixture week near the end (a
 * bye / low-density week from `fixtures`); a fatigue signal pulls it to the block's first week (`deloadNow`).
 * `matchLoad` is the team's typical single-match load in the same currency (Player Load or sRPE-AU).
 */
export function buildMesoBlocks(phaseStart: string, phaseEnd: string, weeks: WeekLoad[], blockWeeks = 4, matchLoad: number | null = null, fixtures: string[] = []): MesoBlock[] {
  const totalWeeks = Math.max(1, Math.round(daydiff(phaseStart, phaseEnd) / 7));
  const n = Math.max(1, Math.ceil(totalWeeks / blockWeeks));
  const byWeek = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const loadAt = (start: string, end: string) => byWeek.filter((w) => w.weekStart >= start && w.weekStart < end);
  const fxMs = fixtures.map((d) => Date.parse(d)).filter((x) => Number.isFinite(x));
  const matchesInWeek = (wkStart: string) => { const s = Date.parse(wkStart), e = s + 7 * 86_400_000; return fxMs.filter((m) => m >= s && m < e).length; };
  const out: MesoBlock[] = [];
  for (let i = 0; i < n; i++) {
    const start = addDays(phaseStart, i * blockWeeks * 7);
    const end = i === n - 1 ? phaseEnd : addDays(phaseStart, (i + 1) * blockWeeks * 7);
    const blockWk = Math.max(1, Math.round(daydiff(start, end) / 7));
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
    const deloadNow = sharpRise || readinessDown; // fatigue → pull the deload week forward (week-level, not a goal change)
    // Deload WEEK placement: default the block's last week, snapped to the lightest fixture week among the
    // last two (fewest matches; tie → nearer the end). Fatigue pulls it to the block's first week.
    const cands: string[] = [];
    for (let w = Math.max(0, blockWk - 2); w < blockWk; w++) cands.push(addDays(start, w * 7));
    let deloadWeekStart = cands.length ? cands[cands.length - 1] : start, best = Infinity;
    for (const c of cands) { const m = matchesInWeek(c); if (m <= best) { best = m; deloadWeekStart = c; } }
    if (deloadNow) deloadWeekStart = start;
    const gk = blockGoalAt(i); const g = GOAL_BY_KEY[gk];
    const volumeTargetPct = acute != null ? Math.round(Math.min(1.1, Math.max(0.9, chronic && acute ? 1.08 : 1.0)) * 100) : 100;
    const flag: Bi | null = sharpRise ? { en: `Acute load rising sharply (${Math.round((ratio! - 1) * 100)}% over the prior 4 weeks) — pull the deload week forward`, is: `Bráðaálag hækkar hratt (${Math.round((ratio! - 1) * 100)}% yfir síðustu 4 vikur) — færðu niðurtröppunar-vikuna framar` }
      : readinessDown ? { en: "Readiness trending down — pull the deload week forward", is: "Viðbragð lækkandi — færðu niðurtröppunar-vikuna framar" } : null;
    out.push({
      index: i, phase: g.phase, goal: g.goal, goalKey: gk,
      start, end, weeks: blockWk, deloadWeekStart, deloadNow, isDeload: deloadNow, volumeTargetPct, flag,
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
