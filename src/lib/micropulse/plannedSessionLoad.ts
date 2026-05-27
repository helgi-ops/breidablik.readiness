/**
 * src/lib/micropulse/plannedSessionLoad.ts
 *
 * Planned session-load recommendation for the coach Today page.
 *
 * Given today's microcycle context from Week setup — which MD-day it is,
 * the day type and the planned focus — this derives a coach-facing target
 * for the session: a load TYPE (mixed / locomotive / mechanical), a load
 * BAND, an sRPE target (intensity × duration) and an approximate share of
 * match demand.
 *
 * The mapping follows the evidence-informed microcycle structure
 * (Buchheit et al. 2024, "The 11 Principles of Microcycle Periodization"):
 * a 3-phase microcycle — recovery (MD+1/+2) → acquisition (MD-4/MD-3) →
 * taper (MD-2/MD-1) — with MD-3 the peak training day, MD-4 the mechanical
 * (force / accel-decel) day, and MD-2 the locomotor speed primer.
 *
 * This is decision-support: a starting target the coach adjusts, not a
 * prescription. Readiness modulation is applied separately by the caller.
 */

export type SessionLoadType = "mixed" | "locomotive" | "mechanical";
export type SessionLoadBand = "light" | "moderate" | "high" | "very_high";

export type PlannedSessionLoad = {
  /** False on match days, days off, and when no MD context is resolved. */
  applicable: boolean;
  reason?: "match" | "off" | "no_md";
  /** Resolved MD label, e.g. "MD-3". Null when no MD context is available. */
  mdLabel: string | null;
  loadType: SessionLoadType;
  band: SessionLoadBand;
  /** Target session RPE (1–10). */
  rpe: number;
  /** Target session duration in minutes. */
  durationMin: number;
  /** sRPE session load (rpe × durationMin), in AU. */
  sessionLoad: number;
  /** Approximate share of a typical match's load, in percent. */
  matchPct: number;
  rationaleEN: string;
  rationaleIS: string;
};

type Base = {
  band: SessionLoadBand;
  rpe: number;
  durationMin: number;
  matchPct: number;
  rationaleEN: string;
  rationaleIS: string;
  mdType: SessionLoadType;
};

/** Parse "MD-3" / "MD+1" / "MD" → signed offset. Null when unrecognised. */
function mdOffset(mdDay: string | null): number | null {
  if (!mdDay) return null;
  const s = String(mdDay).toUpperCase().replace(/\s+/g, "");
  if (s === "MD" || s === "MD0" || s === "MD+0") return 0;
  const m = s.match(/^MD([+-])(\d+)$/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * parseInt(m[2], 10);
}

/** Load TYPE inferred from the Week-setup focus token, when present. */
function typeFromFocus(focus: string | null): SessionLoadType | null {
  const f = String(focus ?? "").toUpperCase();
  if (!f) return null;
  if (f.includes("FORCE")) return "mechanical";
  if (f.includes("VELOCITY") || f.includes("NEURAL") || f.includes("SPEED")) return "locomotive";
  if (f.includes("RECOVERY") || f.includes("POLISH") || f.includes("CALM") || f.includes("ACTIVATION")) {
    return "mixed";
  }
  return null;
}

/**
 * Per-MD base targets, keyed by MD offset. Only reached when a real MD
 * context exists (offset != null). Rationale text describes the day's
 * PLACE in the microcycle and is deliberately type-neutral — the load
 * type is carried separately by `loadType`, so the two can never contradict.
 */
function baseForOffset(offset: number): Base {
  switch (offset) {
    case -1:
      return {
        band: "light", rpe: 5, durationMin: 55, matchPct: 32, mdType: "mixed",
        rationaleEN: "Day before the match — keep it light and short; the squad tapers into the game.",
        rationaleIS: "Dagur fyrir leik — haltu því léttu og stuttu; hópurinn trappar niður inn í leikinn.",
      };
    case -2:
      return {
        band: "moderate", rpe: 6, durationMin: 70, matchPct: 50, mdType: "locomotive",
        rationaleEN: "Two days out — moderate volume as the taper begins.",
        rationaleIS: "Tveir dagar í leik — hóflegt rúmmál þegar niðurtröppun hefst.",
      };
    case -3:
      return {
        band: "very_high", rpe: 8, durationMin: 90, matchPct: 85, mdType: "locomotive",
        rationaleEN: "Main acquisition session — the peak training day of the week.",
        rationaleIS: "Meginæfing vikunnar — þyngsti æfingadagurinn.",
      };
    case -4:
      return {
        band: "high", rpe: 7, durationMin: 85, matchPct: 68, mdType: "mechanical",
        rationaleEN: "Acquisition day — the first hard session of the week, placed early in the microcycle (Principle 7).",
        rationaleIS: "Megin-álagsdagur — fyrsta þunga æfing vikunnar, snemma í vikuhringnum (Regla 7).",
      };
    case 1:
      return {
        band: "light", rpe: 4, durationMin: 45, matchPct: 22, mdType: "mixed",
        rationaleEN: "Post-match recovery / substitute compensation — light and regenerative.",
        rationaleIS: "Endurheimt eftir leik / uppbót varamanna — létt og endurnærandi.",
      };
    case 2:
      return {
        band: "light", rpe: 5, durationMin: 55, matchPct: 35, mdType: "mixed",
        rationaleEN: "Recovery day — light session as the squad rebuilds toward acquisition.",
        rationaleIS: "Endurheimtardagur — létt æfing meðan hópurinn byggir sig upp.",
      };
    default:
      if (offset <= -5) {
        return {
          band: "moderate", rpe: 6.5, durationMin: 80, matchPct: 60, mdType: "mixed",
          rationaleEN: "Early-week build-up before the acquisition block.",
          rationaleIS: "Uppbygging snemma í viku, á undan megin-álagsblokkinni.",
        };
      }
      // Large positive offsets — recovery phase of the microcycle.
      return {
        band: "light", rpe: 5, durationMin: 55, matchPct: 35, mdType: "mixed",
        rationaleEN: "Recovery phase of the microcycle — keep the session light.",
        rationaleIS: "Endurheimtarfasi vikuhringsins — haltu æfingunni léttri.",
      };
  }
}

/**
 * Build the planned session-load target for today.
 */
export function planSessionLoad(params: {
  mdDay: string | number | null;
  dayType: string | null;
  focus: string | null;
  /** Days since the previous match (from v_training_day_context). */
  daysSincePrev?: number | null;
  /** Days until the next match (from v_training_day_context). */
  daysToNext?: number | null;
}): PlannedSessionLoad {
  const mdDayStr = params.mdDay == null ? null : String(params.mdDay);
  const dt = String(params.dayType ?? "").trim().toUpperCase();
  const offset = mdOffset(mdDayStr);

  // Match days and days off carry no training-load target.
  if (dt === "GAME" || offset === 0) {
    return {
      applicable: false, reason: "match", mdLabel: "MD",
      loadType: "mixed", band: "very_high", rpe: 0, durationMin: 0, sessionLoad: 0, matchPct: 100,
      rationaleEN: "Match day — no planned training load.",
      rationaleIS: "Leikdagur — ekkert áætlað æfingaálag.",
    };
  }
  if (dt === "OFF") {
    const off = offDayRationale(offset, params.daysSincePrev ?? null, params.daysToNext ?? null);
    return {
      applicable: false, reason: "off", mdLabel: offset != null ? labelForOffset(offset) : null,
      loadType: "mixed", band: "light", rpe: 0, durationMin: 0, sessionLoad: 0, matchPct: 0,
      rationaleEN: off.en,
      rationaleIS: off.is,
    };
  }

  // No MD context resolved (e.g. a no-match / manual week). The card has no
  // honest basis for a load target — surface that instead of fabricating
  // a generic number that looks computed.
  if (offset == null) {
    return {
      applicable: false, reason: "no_md", mdLabel: null,
      loadType: "mixed", band: "moderate", rpe: 0, durationMin: 0, sessionLoad: 0, matchPct: 0,
      rationaleEN: "No MD day resolved from Week setup — set up the match week in Week setup to get a load target.",
      rationaleIS: "Enginn MD-dagur úr Week setup — settu upp leikvikuna í Week setup til að fá álagsviðmið.",
    };
  }

  const base = baseForOffset(offset);
  // Focus token (when Week setup provides one) is the more reliable signal
  // for the load TYPE; fall back to the per-MD default otherwise.
  const loadType = typeFromFocus(params.focus) ?? base.mdType;

  return {
    applicable: true,
    mdLabel: offset != null ? labelForOffset(offset) : null,
    loadType,
    band: base.band,
    rpe: base.rpe,
    durationMin: base.durationMin,
    sessionLoad: Math.round(base.rpe * base.durationMin),
    matchPct: base.matchPct,
    rationaleEN: base.rationaleEN,
    rationaleIS: base.rationaleIS,
  };
}

function labelForOffset(offset: number): string {
  if (offset === 0) return "MD";
  return offset < 0 ? `MD-${Math.abs(offset)}` : `MD+${offset}`;
}

/**
 * Compose a microcycle-aware paragraph for an OFF-day. The card has no
 * load number to show on a day off — but the day still has a PLACE in
 * the microcycle, and that's what the coach needs to see. The text
 * explains how today's rest fits the week (taper, recovery, anomaly),
 * what to look for tomorrow, and references the relevant Buchheit
 * principle when one applies.
 *
 * Falls back to the original neutral line when no MD offset is resolved
 * or when the surrounding days are unknown.
 */
function offDayRationale(
  offset: number | null,
  daysSincePrev: number | null,
  daysToNext: number | null,
): { en: string; is: string } {
  // No MD context — keep it honest.
  if (offset == null) {
    return {
      en: "Day off — no planned training load.",
      is: "Frídagur — ekkert áætlað æfingaálag.",
    };
  }

  // Small inline helper — adds the "(X dagar í leik · Y frá leik)" tail
  // when at least one of the figures is available, so the paragraph
  // never reads in a vacuum.
  const ctxIS = formatDaysContext(daysSincePrev, daysToNext, "IS");
  const ctxEN = formatDaysContext(daysSincePrev, daysToNext, "EN");
  const tailIS = ctxIS ? ` ${ctxIS}.` : "";
  const tailEN = ctxEN ? ` ${ctxEN}.` : "";

  switch (offset) {
    case -1:
      return {
        is:
          "Frídagur daginn fyrir leik er óvenjulegur — viðmið mæla með stuttri " +
          "virkjun (40–50 mín, RPE 4–5) til að halda kerfinu vakandi án þess að " +
          "bæta við þreytu." + tailIS,
        en:
          "A full day off the day before the match is unusual — guidelines call " +
          "for a short activation (40–50 min, RPE 4–5) to keep the system primed " +
          "without adding fatigue." + tailEN,
      };
    case -2:
      return {
        is:
          "Frídagur á MD-2 fellur inn í niðurtröppun fyrir leik (Regla 8). " +
          "Á morgun (MD-1) er stutt virkjun til að halda kerfinu skörpu." + tailIS,
        en:
          "An off-day on MD-2 fits the pre-match taper (Principle 8). Tomorrow " +
          "(MD-1) is a short activation to keep the system sharp." + tailEN,
      };
    case -3:
      return {
        is:
          "MD-3 er venjulega meginæfing vikunnar (þyngsta æfingadagurinn). Frídagur hér " +
          "er ekki hefðbundinn — ef hann er meðvitaður (álagsstjórnun, ferðalag, " +
          "veikindi í hópnum) er það í lagi, annars vantar megin-álagsdaginn í vikuna." + tailIS,
        en:
          "MD-3 is typically the peak training session of the week. An off-day here " +
          "is unusual — if it's deliberate (load management, travel, illness) that's " +
          "fine; otherwise the week is missing its main acquisition day." + tailEN,
      };
    case -4:
      return {
        is:
          "MD-4 er hefðbundinn megin-álagsdagur snemma í viku (Regla 7). " +
          "Frídagur hér færir megin-álagið nær leik — gættu þess að MD-3 verði ekki of " +
          "þungur." + tailIS,
        en:
          "MD-4 is the typical early-week acquisition day (Principle 7). Resting " +
          "here pushes the main load closer to the match — keep an eye that MD-3 " +
          "doesn't get over-loaded as a result." + tailEN,
      };
    case 1:
      return {
        is:
          "MD+1 frídagur — algengt en ekki sjálfgefið besta lausnin. Rannsóknir " +
          "Buchheit (2023) benda til þess að hreyfing daginn eftir leik (gangur, " +
          "léttur hjólatúr eða undirbúningur varamanna) flýti endurheimt fyrir alla." + tailIS,
        en:
          "MD+1 off — common practice, but not necessarily optimal. Buchheit (2023) " +
          "suggests light activity the day after the match (walk, easy bike, or " +
          "compensation work for non-starters) accelerates recovery for the squad." + tailEN,
      };
    case 2:
      return {
        is:
          "MD+2 frídagur er í samræmi við Buchheit (2023) — hópar með frí á MD+2 " +
          "sýndu lægri meiðslatíðni en þeir sem æfðu þá. Hópurinn er tilbúinn í " +
          "megin-álagið á næstu dögum." + tailIS,
        en:
          "MD+2 off aligns with Buchheit (2023) — squads resting on MD+2 showed " +
          "lower injury rates than those training. The squad is set up for the " +
          "main load in the coming days." + tailEN,
      };
    default:
      if (offset <= -5) {
        return {
          is:
            "Frídagur snemma í langri viku — eðlilegt í uppbyggingu á undan " +
            "megin-álagsblokkinni." + tailIS,
          en:
            "Off-day early in a long week — normal as a buffer before the " +
            "acquisition block." + tailEN,
        };
      }
      // offset >= +3 — well into recovery / early-week phase.
      return {
        is:
          "Frídagur í endurheimtarfasa vikuhringsins — passar inn í náttúrulega " +
          "hvíld áður en uppbygging hefst." + tailIS,
        en:
          "Off-day in the recovery phase of the microcycle — fits the natural " +
          "rest before the build-up starts." + tailEN,
      };
  }
}

/**
 * "X dagar í leik · Y dagar frá síðasta leik" — built only from the
 * pieces we actually have. Returns an empty string when both are null,
 * so the caller can drop the tail cleanly.
 */
function formatDaysContext(
  daysSincePrev: number | null,
  daysToNext: number | null,
  lang: "IS" | "EN",
): string {
  const is = lang === "IS";
  const parts: string[] = [];
  if (daysToNext != null && daysToNext >= 0) {
    if (daysToNext === 0) {
      parts.push(is ? "leikur í dag" : "match today");
    } else if (daysToNext === 1) {
      parts.push(is ? "leikur á morgun" : "match tomorrow");
    } else {
      parts.push(is ? `${daysToNext} dagar í leik` : `${daysToNext} days to match`);
    }
  }
  if (daysSincePrev != null && daysSincePrev >= 0) {
    if (daysSincePrev === 0) {
      parts.push(is ? "leikur í dag" : "match today");
    } else if (daysSincePrev === 1) {
      parts.push(is ? "1 dagur frá leik" : "1 day since match");
    } else {
      parts.push(is ? `${daysSincePrev} dagar frá leik` : `${daysSincePrev} days since match`);
    }
  }
  if (parts.length === 0) return "";
  return `(${parts.join(" · ")})`;
}
