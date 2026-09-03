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
  isDeload: boolean; acwr: number | null; volumeTargetPct: number | null; flag: Bi | null;
};

const BLOCK_GOALS: Array<{ phase: Bi; goal: Bi }> = [
  { phase: { en: "Accumulation", is: "Uppsöfnun" }, goal: { en: "Work capacity + max strength base", is: "Þol + hámarksstyrks grunnur" } },
  { phase: { en: "Transmutation", is: "Umbreyting" }, goal: { en: "Strength–power + speed", is: "Styrkur–kraftur + hraði" } },
  { phase: { en: "Realization", is: "Framkvæmd" }, goal: { en: "Freshness + peak power, taper to fixtures", is: "Ferskleiki + hámarkskraftur, niðurtröppun að leikjum" } },
];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Break the competitive phase into ~`blockWeeks`-week meso blocks. Each block's ACWR is measured
 * from the REAL weekly load (acute = block mean, chronic = trailing ~4-week mean); a block is flagged
 * DELOAD when its load spikes (ACWR > 1.3) or readiness trends down, else the volume target is an
 * ACWR-safe ramp. Goals rotate Accumulation → Transmutation → Realization.
 */
export function buildMesoBlocks(phaseStart: string, phaseEnd: string, weeks: WeekLoad[], blockWeeks = 4): MesoBlock[] {
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
    const acwr = acute != null && chronic && chronic > 0 ? Math.round((acute / chronic) * 100) / 100 : null;
    const rd = inBlock.map((w) => w.readiness).filter((x): x is number => x != null);
    const priorRd = byWeek.filter((w) => w.weekStart < start).slice(-2).map((w) => w.readiness).filter((x): x is number => x != null);
    const readinessDown = rd.length && priorRd.length ? mean(rd) < mean(priorRd) - 3 : false;
    const spike = acwr != null && acwr > 1.3;
    const isDeload = spike || readinessDown || (i > 0 && (i + 1) % 3 === 0); // spike / fatigue / planned every 3rd block
    const g = BLOCK_GOALS[Math.min(i, BLOCK_GOALS.length - 1)];
    const volumeTargetPct = isDeload ? 60 : acwr != null ? Math.round(Math.min(1.1, Math.max(0.9, chronic && acute ? 1.08 : 1.0)) * 100) : 100;
    const flag: Bi | null = spike ? { en: `Load spike (ACWR ${acwr}) — deload recommended`, is: `Álags-toppur (ACWR ${acwr}) — mælt með niðurtröppun` }
      : readinessDown ? { en: "Readiness trending down — deload recommended", is: "Viðbragð lækkandi — mælt með niðurtröppun" }
        : isDeload ? { en: "Planned recovery block", is: "Áætluð endurheimtar-lota" } : null;
    out.push({
      index: i, phase: isDeload ? { en: "Deload", is: "Niðurtröppun" } : g.phase,
      goal: isDeload ? { en: "Recover — cut volume ~40%, keep intensity touches", is: "Endurheimt — minnka magn ~40%, halda ákefðar-snertingum" } : g.goal,
      start, end, weeks: Math.max(1, Math.round(daydiff(start, end) / 7)), isDeload, acwr, volumeTargetPct, flag,
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
