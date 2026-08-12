/**
 * Matchday Availability Board — pure engine.
 *
 * ONE question a head coach asks before every match: "who can I actually pick,
 * and in what state?" That answer is NOT the readiness colour on its own. A
 * player can be GREEN on his morning check-in and still be unavailable because
 * he is in rehab; another can be RED yet perfectly selectable with a managed
 * load. So this board deliberately keeps two things apart and then combines them
 * in a fixed order:
 *
 *   1. AVAILABILITY  — gated on the medical record (player_injuries). This is
 *      authoritative and beats the readiness colour: a returning/injured player
 *      is not "available" no matter how good his wellness looks. (Principle from
 *      the repo memory: "green readiness ≠ cleared for full training" — gate
 *      availability on the latest player_injuries row, surface injury as its own
 *      chip.)
 *   2. STATE         — for players the medical record clears, the canonical
 *      readiness colour (v_coach_readiness_today_v8.final_color) decides whether
 *      they are fully available or available-with-management.
 *
 * The engine is DESCRIPTIVE and READ-ONLY. It never writes, never recomputes,
 * and NEVER touches the readiness verdict — it only *reads* the canonical colour
 * and the medical status and composes a selection tier from them. Every verdict
 * carries its plain "why", a confidence, and a counterfactual (what flips it to
 * available), per the explainability-first manifesto.
 *
 * Refs: Ardern et al. 2016 (return-to-sport = a clinical decision, medical
 * clearance is the gate); Dupont et al. 2010 & Carling et al. 2015 (two matches
 * per week / congestion raises injury rate and needs load management);
 * Gabbett 2017 (ACWR framed as an *unfamiliar load spike vs the player's own
 * recent norm*, not an injury "sweet spot").
 */

export type ReadinessColor = "green" | "yellow" | "red" | "gray";

/** Latest player_injuries.status. null = no injury record (fully cleared). */
export type InjuryStatus = "injured" | "rehabilitation" | "rtp_training" | "cleared" | null;

export type AvailabilityTier = "available" | "limited" | "unavailable";

export type Bilingual = { EN: string; IS: string };
export type Tone = "green" | "amber" | "red" | "slate";

export type AvailabilityInput = {
  playerId: string;
  name: string;
  position: string | null;
  /** Canonical readiness colour for the date (mapped from final_color). */
  readiness: ReadinessColor;
  /** Was there an actual readiness check-in for the date? Drives confidence. */
  hasCheckinToday: boolean;
  /** Latest player_injuries.status (null / "cleared" = medically available). */
  injuryStatus: InjuryStatus;
  injuryType: string | null;
  bodyPart: string | null;
  /** player_injuries.rtp_stage — may be numeric or text in the DB. */
  rtpStage: string | number | null;
  /** ISO date (YYYY-MM-DD) of estimated return, if the medical record has one. */
  estimatedReturn: string | null;
  /** Sum of match minutes in the last 7 days (match_player_minutes). */
  minutesLast7: number;
  /** Count of matches featured in over the last 7 days. */
  matchesLast7: number;
  /** ACWR from the readiness training_modifier, if present. Load-spike signal. */
  acwr: number | null;
};

export type AvailabilityInjury = {
  status: Exclude<InjuryStatus, null | "cleared">;
  type: string | null;
  bodyPart: string | null;
  rtpStage: string | null;
  estimatedReturn: string | null;
};

export type AvailabilityVerdict = {
  playerId: string;
  name: string;
  position: string | null;
  tier: AvailabilityTier;
  readiness: ReadinessColor;
  /** One-sentence verdict — first and boldest (the ~5s glance). */
  headline: Bilingual;
  /** 2–3 plain supporting facts — the "why", visible without a click. */
  why: Bilingual[];
  /** Chips for the detail row (readiness, injury, load). */
  factors: Array<{ label: Bilingual; tone: Tone }>;
  /** What single change would flip this player to fully available. */
  counterfactual: Bilingual | null;
  confidence: { band: "high" | "medium" | "low"; note: Bilingual };
  /** Heavy-legs / load-spike advisory. Never changes the tier by itself. */
  loadNote: Bilingual | null;
  /** Present only when the player is on the medical record (injury-gated). */
  injury: AvailabilityInjury | null;
};

export type AvailabilityBoard = {
  date: string;
  counts: { available: number; limited: number; unavailable: number };
  available: AvailabilityVerdict[];
  limited: AvailabilityVerdict[];
  unavailable: AvailabilityVerdict[];
};

// ── Thresholds ──────────────────────────────────────────────────────────────
/** Two matches in a week is the congestion line where recovery debt accrues
 *  and load needs managing (Dupont 2010, Carling 2015). */
const CONGESTION_MATCHES_7D = 2;
/** ACWR at/above this is an unfamiliar spike vs the player's own recent norm
 *  (Gabbett 2017) — a reason to manage, framed as spike-size, not "risk". */
const ACWR_SPIKE = 1.5;

function readinessLabel(c: ReadinessColor): Bilingual {
  switch (c) {
    case "green": return { EN: "Ready (green)", IS: "Klár (grænn)" };
    case "yellow": return { EN: "Modified (yellow)", IS: "Aðlagað (gulur)" };
    case "red": return { EN: "Recovery (red)", IS: "Endurheimt (rauður)" };
    default: return { EN: "No check-in", IS: "Engin skráning" };
  }
}

function injuryStatusLabel(s: AvailabilityInjury["status"]): Bilingual {
  switch (s) {
    case "injured": return { EN: "Injured", IS: "Meiddur" };
    case "rehabilitation": return { EN: "In rehab", IS: "Í endurhæfingu" };
    case "rtp_training": return { EN: "Return-to-training", IS: "Aftur í æfingar" };
  }
}

/** Build the load advisory shared by every tier (null when nothing notable). */
function buildLoadNote(inp: AvailabilityInput): Bilingual | null {
  const congested = inp.matchesLast7 >= CONGESTION_MATCHES_7D;
  const spike = inp.acwr != null && inp.acwr >= ACWR_SPIKE;
  if (!congested && !spike) return null;
  const parts: { EN: string; IS: string }[] = [];
  if (congested) {
    parts.push({
      EN: `${inp.matchesLast7} matches / ${Math.round(inp.minutesLast7)} min in the last 7 days`,
      IS: `${inp.matchesLast7} leikir / ${Math.round(inp.minutesLast7)} mín síðustu 7 daga`,
    });
  }
  if (spike) {
    parts.push({
      EN: `load ${inp.acwr!.toFixed(2)}× his recent norm`,
      IS: `álag ${inp.acwr!.toFixed(2)}× miðað við hans vana`,
    });
  }
  const joinedEN = parts.map((p) => p.EN).join("; ");
  const joinedIS = parts.map((p) => p.IS).join("; ");
  return {
    EN: `Manage load — ${joinedEN}.`,
    IS: `Stýra álagi — ${joinedIS}.`,
  };
}

/**
 * Compose one player's availability verdict. Order is fixed and explainable:
 * medical status first (authoritative), then the canonical readiness colour.
 */
export function buildAvailabilityVerdict(inp: AvailabilityInput): AvailabilityVerdict {
  const loadNote = buildLoadNote(inp);
  const readinessFactor = { label: readinessLabel(inp.readiness), tone: (inp.readiness === "green" ? "green" : inp.readiness === "yellow" ? "amber" : inp.readiness === "red" ? "red" : "slate") as Tone };
  const loadFactor: AvailabilityVerdict["factors"] = loadNote ? [{ label: { EN: "Heavy recent load", IS: "Þungt álag nýlega" }, tone: "amber" }] : [];

  const medical = inp.injuryStatus;
  const isMedical = medical === "injured" || medical === "rehabilitation" || medical === "rtp_training";
  const injury: AvailabilityInjury | null = isMedical
    ? { status: medical as AvailabilityInjury["status"], type: inp.injuryType, bodyPart: inp.bodyPart, rtpStage: inp.rtpStage != null ? String(inp.rtpStage) : null, estimatedReturn: inp.estimatedReturn }
    : null;

  const bodyLabel = (inp.bodyPart || inp.injuryType || "").trim();
  const returnNote: Bilingual | null = inp.estimatedReturn
    ? { EN: `est. return ${inp.estimatedReturn}`, IS: `áætluð endurkoma ${inp.estimatedReturn}` }
    : null;

  // ── 1. Medical gate (authoritative) ──────────────────────────────────────
  if (medical === "injured") {
    const why: Bilingual[] = [
      { EN: bodyLabel ? `Injured — ${bodyLabel}.` : "Injured — on the medical record.", IS: bodyLabel ? `Meiddur — ${bodyLabel}.` : "Meiddur — á meiðslaskrá." },
    ];
    if (returnNote) why.push(returnNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "unavailable", readiness: inp.readiness,
      headline: { EN: bodyLabel ? `Out — ${bodyLabel}` : "Out — injured", IS: bodyLabel ? `Ekki tiltækur — ${bodyLabel}` : "Ekki tiltækur — meiddur" },
      why,
      factors: [{ label: injuryStatusLabel("injured"), tone: "red" }, readinessFactor],
      counterfactual: { EN: "Medical clearance → available", IS: "Læknisleyfi → tiltækur" },
      confidence: { band: "high", note: { EN: "From the medical record (authoritative).", IS: "Úr meiðslaskrá (áreiðanleg)." } },
      loadNote: null, injury,
    };
  }

  if (medical === "rehabilitation") {
    const why: Bilingual[] = [
      { EN: bodyLabel ? `In rehab for ${bodyLabel} — not match-available.` : "In rehab — not match-available.", IS: bodyLabel ? `Í endurhæfingu vegna ${bodyLabel} — ekki tiltækur í leik.` : "Í endurhæfingu — ekki tiltækur í leik." },
    ];
    if (returnNote) why.push(returnNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "unavailable", readiness: inp.readiness,
      headline: { EN: "In rehab — not match-available", IS: "Í endurhæfingu — ekki tiltækur" },
      why,
      factors: [{ label: injuryStatusLabel("rehabilitation"), tone: "red" }, readinessFactor],
      counterfactual: { EN: "Completes rehab → return-to-training", IS: "Lýkur endurhæfingu → aftur í æfingar" },
      confidence: { band: "high", note: { EN: "From the medical record (authoritative).", IS: "Úr meiðslaskrá (áreiðanleg)." } },
      loadNote: null, injury,
    };
  }

  if (medical === "rtp_training") {
    // rtp_stage may arrive as a number (e.g. 3) or a string (e.g. "running") —
    // coerce before any string op so a numeric stage can't blow up the render.
    const stageStr = inp.rtpStage != null && String(inp.rtpStage).trim() !== "" ? String(inp.rtpStage).trim() : null;
    const stage = stageStr ? (stageStr.charAt(0).toUpperCase() + stageStr.slice(1)) : null;
    const why: Bilingual[] = [
      { EN: stage ? `Returning to training (${stage}) — manage minutes.` : "Returning to training — manage minutes.", IS: stage ? `Aftur í æfingar (${stage}) — stýra mínútum.` : "Aftur í æfingar — stýra mínútum." },
    ];
    if (bodyLabel) why.push({ EN: `Recovering ${bodyLabel}.`, IS: `Að jafna sig af ${bodyLabel}.` });
    if (loadNote) why.push(loadNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "limited", readiness: inp.readiness,
      headline: { EN: "Returning — limited, manage minutes", IS: "Að koma til baka — takmarkað, stýra mínútum" },
      why,
      factors: [{ label: injuryStatusLabel("rtp_training"), tone: "amber" }, readinessFactor, ...loadFactor],
      counterfactual: { EN: "Completes RTP progression → full availability", IS: "Lýkur RTP-ferli → fullur aðgangur" },
      confidence: { band: "high", note: { EN: "From the medical record (authoritative).", IS: "Úr meiðslaskrá (áreiðanleg)." } },
      loadNote, injury: null,
    };
  }

  // ── 2. Readiness gate (medically cleared) ────────────────────────────────
  if (inp.readiness === "red") {
    const why: Bilingual[] = [
      { EN: "Recovery-flagged today — available, but manage his load.", IS: "Flaggaður í endurheimt í dag — tiltækur en stýra álagi." },
    ];
    if (loadNote) why.push(loadNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "limited", readiness: inp.readiness,
      headline: { EN: "Available — manage load (red)", IS: "Tiltækur — stýra álagi (rauður)" },
      why,
      factors: [readinessFactor, ...loadFactor],
      counterfactual: { EN: "GREEN check-in → fully available", IS: "GRÆNN morgunmæling → fullur aðgangur" },
      confidence: confidenceFor(inp),
      loadNote, injury: null,
    };
  }

  if (inp.readiness === "yellow") {
    const why: Bilingual[] = [
      { EN: "Modified readiness today — available with adjustments.", IS: "Aðlöguð readiness í dag — tiltækur með aðlögun." },
    ];
    if (loadNote) why.push(loadNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "limited", readiness: inp.readiness,
      headline: { EN: "Available — with adjustments (yellow)", IS: "Tiltækur — með aðlögun (gulur)" },
      why,
      factors: [readinessFactor, ...loadFactor],
      counterfactual: { EN: "GREEN check-in → fully available", IS: "GRÆNN morgunmæling → fullur aðgangur" },
      confidence: confidenceFor(inp),
      loadNote, injury: null,
    };
  }

  if (inp.readiness === "gray" || !inp.hasCheckinToday) {
    const why: Bilingual[] = [
      { EN: "No check-in yet — treated as available, status unconfirmed.", IS: "Engin skráning enn — talinn tiltækur, óstaðfest staða." },
    ];
    if (loadNote) why.push(loadNote);
    return {
      playerId: inp.playerId, name: inp.name, position: inp.position, tier: "available", readiness: inp.readiness,
      headline: { EN: "Available — unconfirmed (no check-in)", IS: "Tiltækur — óstaðfest (engin skráning)" },
      why,
      factors: [readinessFactor, ...loadFactor],
      counterfactual: null,
      confidence: { band: "low", note: { EN: "No check-in — availability is assumed, not confirmed.", IS: "Engin skráning — tiltækni gefin sér, ekki staðfest." } },
      loadNote, injury: null,
    };
  }

  // green + medically cleared
  const why: Bilingual[] = [
    { EN: "Green check-in and no medical flag — fully available.", IS: "Grænn morgunmæling og engin meiðsl — fullur aðgangur." },
  ];
  if (loadNote) why.push(loadNote);
  return {
    playerId: inp.playerId, name: inp.name, position: inp.position, tier: "available", readiness: inp.readiness,
    headline: loadNote
      ? { EN: "Available — watch his load", IS: "Tiltækur — fylgstu með álagi" }
      : { EN: "Available", IS: "Tiltækur" },
    why,
    factors: [readinessFactor, ...loadFactor],
    counterfactual: null,
    confidence: confidenceFor(inp),
    loadNote, injury: null,
  };
}

function confidenceFor(inp: AvailabilityInput): AvailabilityVerdict["confidence"] {
  if (inp.hasCheckinToday) {
    return { band: "high", note: { EN: "Today's check-in + medical record.", IS: "Skráning dagsins + meiðslaskrá." } };
  }
  return { band: "low", note: { EN: "No check-in today — state inferred.", IS: "Engin skráning í dag — staða ályktuð." } };
}

const TIER_RANK: Record<ReadinessColor, number> = { red: 0, yellow: 1, gray: 2, green: 3 };

/** Build the full board: verdict per player, grouped and sorted for selection. */
export function buildAvailabilityBoard(date: string, inputs: AvailabilityInput[]): AvailabilityBoard {
  const verdicts = inputs.map(buildAvailabilityVerdict);
  const byName = (a: AvailabilityVerdict, b: AvailabilityVerdict) => a.name.localeCompare(b.name);
  // Within "limited", surface the players who need the most management first
  // (red before yellow before green), so the coach's eye lands on them.
  const byNeed = (a: AvailabilityVerdict, b: AvailabilityVerdict) =>
    TIER_RANK[a.readiness] - TIER_RANK[b.readiness] || byName(a, b);

  const available = verdicts.filter((v) => v.tier === "available").sort(byName);
  const limited = verdicts.filter((v) => v.tier === "limited").sort(byNeed);
  const unavailable = verdicts.filter((v) => v.tier === "unavailable").sort(byName);

  return {
    date,
    counts: { available: available.length, limited: limited.length, unavailable: unavailable.length },
    available, limited, unavailable,
  };
}

/** Map a raw v_coach_readiness_today_v8.final_color to the engine's enum. */
export function toReadinessColor(raw: unknown): ReadinessColor {
  const c = String(raw ?? "").toLowerCase();
  if (c.startsWith("r")) return "red";
  if (c.startsWith("y") || c === "amber") return "yellow";
  if (c.startsWith("g")) return "green";
  return "gray";
}

/** Normalise a raw player_injuries.status. Unknown / empty → null (cleared). */
export function toInjuryStatus(raw: unknown): InjuryStatus {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "injured") return "injured";
  if (s === "rehabilitation" || s === "rehab") return "rehabilitation";
  if (s === "rtp_training" || s === "rtp" || s === "return_to_training") return "rtp_training";
  if (s === "cleared") return "cleared";
  return null;
}
