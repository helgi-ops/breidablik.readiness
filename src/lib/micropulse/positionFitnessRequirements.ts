/**
 * Position fitness requirements — "does he meet the PHYSICAL requirements of his playing position?"
 *
 * For the player's position (Ju group) and its demanded physical qualities (from roleModel), each
 * quality is graded meets / below / above against a squad/league-RELATIVE floor (his position
 * percentile ≥ MEETS_PCTL), with an ELITE literature value shown ALONGSIDE as an aspiration — never
 * as the pass/fail (absolute elite norms are too high for the level and would fail everyone).
 *
 * Honest boundary, carried in the card copy:
 *  - This is physical CAPACITY vs the position's physical DEMANDS — necessary, not sufficient. It
 *    does NOT say the player is tactically/technically right for the position ("meets the physical
 *    requirements", never "is right for the position").
 *  - Capacity ≠ match output — pair it with the RoleDemandFit Output read.
 * Descriptive scouting/development context only — it NEVER touches the readiness colour, the load
 * target, or the daily decision (same rule as roleDemandFit.ts). Pure, no I/O.
 *
 * REUSE: roleModel demand weights (which qualities a position demands + how much) and the athlete
 * profile's per-quality POSITION percentile (the relative pass/fail input). No demand weights or
 * percentiles are re-implemented here.
 *
 * Cite: Di Salvo 2007/2009, Bradley 2009, Bush 2015 (positional match demands); Slimani & Nikolaidis
 * 2019 (positional MAS/MSS); Buchheit & Mendez-Villanueva 2013, Sandford 2019 (ASR); Pettitt 2016
 * (CS↔MAS). Elite reference values are PROVISIONAL — tune per level.
 */

import type { Bi } from "@/lib/micropulse/load/peakPeriod";
import { QUALITY_BY_ID, STRENGTH_PCTL, type QualityId, type AthleteProfile, type Confidence } from "@/lib/micropulse/playerAnalysis/athleteProfile";
import { juPositionGroup, JU_GROUP_LABEL, type JuGroup } from "@/lib/micropulse/positionStyle";
import { resolveRoleFit, ROLE_MODEL_CITATIONS } from "@/lib/micropulse/roleModel";

/** Position percentile at/above which a quality "meets" the position's physical requirement. */
export const MEETS_PCTL = 40;

export type RequirementBand = "above" | "meets" | "below" | "unknown";

export interface RequirementRow {
  quality: QualityId; label: Bi; weight: number;         // demand weight (normalised, from roleModel)
  playerPctl: number | null; band: RequirementBand;
  playerValue: number | null; unit: string | null;       // km/h etc. when a fitness value exists
  eliteRef: number | null; eliteProvisional: boolean;
  gapToMeetPctl: number | null;                          // points below MEETS_PCTL (0 if meets/above)
  gapToElite: number | null;                             // eliteRef − playerValue, quality unit
  benchmark: "position" | "squad";                       // which pool the percentile used
}

export interface PositionFitnessRead {
  playerId: string; name: string; juGroup: JuGroup | null; roleLabel: Bi;
  scored: boolean; verdict: Bi;
  metCount: number; total: number;
  rows: RequirementRow[];                                // demand-weighted order (highest first)
  /** Anaerobic Speed Reserve (MSS − MAS, km/h) — a CONTEXT read next to the `speed` row (why he
   *  clears/misses the speed line), NOT a pass/fail. Distinct from anaerobic_reserve (D′, metres). */
  asrContext: { asrKmh: number; note: Bi } | null;
  /** Elite men's match demand for the position — a cited aspiration reference (HI-running > 19.8
   *  km/h m/match, total distance), NOT the pass/fail. His own HSR metres compare directly. */
  eliteMatchDemand: { hiRunningM: number; totalDistanceM: number | null; provisional: boolean; note: Bi } | null;
  confidence: Confidence; citation: string; caveat: Bi;
}

// ── Elite (literature) reference values — PROVISIONAL, elite men's football, approximate ranges
// to confirm; shown as an aspiration next to the relative pass/fail, never as the pass/fail.
// ONLY max sprinting speed (MSS → the `speed` quality) is cleanly established by position across
// studies (Di Salvo 2007; Djaoui 2017; Haugen 2014): highest for wide players + forwards, lowest for
// centre-backs and central midfielders. Elite MAS/ASR-by-position are NOT cleanly established, so we
// do NOT publish a single authoritative number for them — squad/league-relative stays the pass/fail
// and those rows carry no elite column. Never map ASR (a SPEED reserve, km/h) onto anaerobic_reserve
// (which is D′, a DISTANCE reserve in metres) — different constructs.
type EliteRef = { value: number; unit: string };
const ELITE_REFERENCE: Partial<Record<JuGroup, Partial<Record<QualityId, EliteRef>>>> = {
  WDP: { speed: { value: 33.5, unit: "km/h" } }, // full-back — top sprinting speed (Di Salvo 2007)
  WOP: { speed: { value: 33.5, unit: "km/h" } }, // winger — top sprinting speed
  COP: { speed: { value: 32.5, unit: "km/h" } }, // centre-forward — high sprinting speed
  CMP: { speed: { value: 31.5, unit: "km/h" } }, // central mid — lower MSS demand
  CDP: { speed: { value: 31.5, unit: "km/h" } }, // centre-back — lowest MSS demand
};

// ── Elite men's MATCH DEMANDS by position (reference, not the pass/fail) ──
// Cited elite EPL/La Liga numbers. Bradley 2009 defines high-intensity running as > 19.8 km/h — the
// SAME HSR threshold MicroPulse uses — so a player's own HSR metres compare to these directly, no
// rescaling. Surfaced as a labelled aspiration reference; the squad/league bar stays the pass/fail.
// PROVISIONAL: varies by league/season/tracking system — S&C-tunable.
type EliteMatchDemand = { hiRunningM: number; totalDistanceM: number | null; provisional: true };
const ELITE_MATCH_DEMAND: Partial<Record<JuGroup, EliteMatchDemand>> = {
  WOP: { hiRunningM: 3138, totalDistanceM: 11990, provisional: true }, // wide mid — highest HI-running (Bradley 2009)
  CMP: { hiRunningM: 2825, totalDistanceM: 12027, provisional: true }, // central mid — highest total distance (Di Salvo 2007)
  WDP: { hiRunningM: 2605, totalDistanceM: null, provisional: true },  // full-back — high all-round
  COP: { hiRunningM: 2341, totalDistanceM: null, provisional: true },  // attacker — sprint-led
  CDP: { hiRunningM: 1834, totalDistanceM: 10627, provisional: true }, // centre-back — lowest HI-run/volume
};

const CITATION = [
  ...ROLE_MODEL_CITATIONS,
  "Di Salvo 2007/2009 · Bradley 2009 · Bush 2015 (positional match demands)",
  "Slimani & Nikolaidis 2019 (positional MAS/MSS) · Buchheit & Mendez-Villanueva 2013 · Sandford 2019 (ASR)",
].join(" · ");

const CAVEAT: Bi = {
  en: "Physical CAPACITY vs the position's physical DEMANDS — necessary, not sufficient: it says he meets the physical requirements, not that he is tactically/technically right for the position. The pass/fail is squad/league-relative (a position-percentile floor). The only elite figure shown is max sprinting speed by position (well established); elite aerobic/reserve-by-position are not cleanly established across studies, so those rows carry no elite number — squad-relative stays the pass mark. Speed reserve (ASR) is shown as context beside the speed row, not a pass/fail. Capacity is not match output — read it with the Output tile. Descriptive scouting/development context — it never touches the readiness verdict, the load target or the daily plan.",
  is: "Líkamleg GETA borin saman við líkamlegar KRÖFUR stöðunnar — nauðsynleg, ekki nægjanleg: hún segir að hann uppfylli líkamlegu kröfurnar, ekki að hann sé taktískt/tæknilega réttur í stöðuna. Staðið/fallið er miðað við lið/deild (percentíl-gólf stöðunnar). Eina elítu-talan sem birt er er hámarks-spretthraði eftir stöðu (vel staðfest); elítu loftháð/forði eftir stöðu er ekki vel staðfest milli rannsókna, svo þær línur bera enga elítu-tölu — lið-viðmið er áfram fallmarkið. Hraðaforði (ASR) er sýndur sem samhengi við hraða-línuna, ekki staðið/fallið. Geta er ekki leikframleiðsla — lestu með Output-reitnum. Lýsandi skátun/þróun — snertir aldrei readiness-dóminn, álagsmarkið eða dagsáætlunina.",
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const bandOf = (pctl: number | null): RequirementBand =>
  pctl == null ? "unknown" : pctl >= STRENGTH_PCTL ? "above" : pctl >= MEETS_PCTL ? "meets" : "below";

/**
 * Grade each demanded physical quality meets/below/above the position floor, with the elite
 * reference and both gaps. Pure. GK / unknown / basketball → `scored:false` with an honest verdict.
 */
export function buildPositionFitnessRequirements(input: {
  playerId: string; name: string; position: string | null; subRole?: string | null; sport?: string | null;
  profile: AthleteProfile | null;
  fitnessValues: Partial<Record<QualityId, { value: number; unit: string }>>;
  /** ASR (MSS − MAS, km/h) from the speed-zones/criticalSpeed routine — carried as context. */
  asrKmh?: number | null;
}): PositionFitnessRead {
  const { playerId, name, position, profile, fitnessValues } = input;
  const juGroup = juPositionGroup(position, input.sport);
  const roleLabel: Bi = juGroup ? JU_GROUP_LABEL[juGroup] : { en: "this role", is: "þessari stöðu" };

  const asrKmh = typeof input.asrKmh === "number" && isFinite(input.asrKmh) && input.asrKmh > 0 ? r1(input.asrKmh) : null;
  const asrContext = asrKmh == null ? null : {
    asrKmh,
    note: {
      en: `Speed reserve (top speed − aerobic pace) ${asrKmh} km/h — the room he has above his aerobic pace; a bigger reserve is why he can clear the sprint line. Context for the speed row, not a pass/fail.`,
      is: `Hraðaforði (topphraði − loftháður hraði) ${String(asrKmh).replace(".", ",")} km/klst — svigrúmið sem hann hefur yfir loftháða hraðanum; stærri forði er ástæðan fyrir að hann nær sprettlínunni. Samhengi fyrir hraða-línuna, ekki staðið/fallið.`,
    } as Bi,
  };

  const emd = juGroup ? ELITE_MATCH_DEMAND[juGroup] ?? null : null;
  const eliteMatchDemand = emd == null ? null : {
    hiRunningM: emd.hiRunningM, totalDistanceM: emd.totalDistanceM, provisional: emd.provisional,
    note: {
      en: `Elite men's match demand for a ${roleLabel.en} (reference): ~${emd.hiRunningM.toLocaleString("en")} m high-intensity running per match (> 19.8 km/h, the same line as his HSR)${emd.totalDistanceM ? `, ~${emd.totalDistanceM.toLocaleString("en")} m total` : ""}. Di Salvo 2007 / Bradley 2009 — reference/aspiration, not the pass/fail.`,
      is: `Elítu leikkrafa fyrir ${roleLabel.is} (viðmið): ~${emd.hiRunningM.toLocaleString("en").replace(/,/g, ".")} m háákefðar-hlaup í leik (> 19,8 km/klst, sama lína og HSR hans)${emd.totalDistanceM ? `, ~${emd.totalDistanceM.toLocaleString("en").replace(/,/g, ".")} m alls` : ""}. Di Salvo 2007 / Bradley 2009 — viðmið/markmið, ekki staðið/fallið.`,
    } as Bi,
  };

  const base: PositionFitnessRead = {
    playerId, name, juGroup, roleLabel, scored: false, verdict: { en: "", is: "" },
    metCount: 0, total: 0, rows: [], asrContext, eliteMatchDemand, confidence: "low", citation: CITATION, caveat: CAVEAT,
  };

  // GK / unknown / basketball — the outfield demand model doesn't apply (mirror roleDemandFit).
  if (!juGroup) {
    return { ...base, verdict: {
      en: `${name} — no outfield physical-requirement benchmark for this position.`,
      is: `${name} — ekkert líkamlegt stöðu-viðmið fyrir þessa leikstöðu.`,
    } };
  }

  const { demand: model } = resolveRoleFit(juGroup, input.subRole);
  const weights = model.weights;
  const totalW = (Object.values(weights) as number[]).reduce((s, w) => s + (w ?? 0), 0) || 1;
  const eliteForGroup = ELITE_REFERENCE[juGroup] ?? {};

  const rows: RequirementRow[] = (Object.keys(weights) as QualityId[]).map((q) => {
    const pq = profile?.qualities.find((x) => x.id === q) ?? null;
    const playerPctl = pq?.positionPercentile ?? null;
    const benchmark: "position" | "squad" = pq?.benchmark === "squad" ? "squad" : "position";
    const band = bandOf(playerPctl);

    // Prefer a fitness-test km/h value (matches the elite reference's unit); else the profile value.
    const fv = fitnessValues[q] ?? null;
    const playerValue = fv?.value ?? pq?.value ?? null;
    const unit = fv?.unit ?? pq?.unit ?? null;

    const elite = eliteForGroup[q] ?? null;
    const eliteRef = elite?.value ?? null;
    // Only subtract when both are in the SAME unit (never mix km/h with a profile D′ in metres).
    const gapToElite = eliteRef != null && playerValue != null && unit != null && elite!.unit === unit
      ? r1(eliteRef - playerValue) : null;

    return {
      quality: q, label: QUALITY_BY_ID[q], weight: (weights[q] ?? 0) / totalW,
      playerPctl, band, playerValue: playerValue != null ? r1(playerValue) : null, unit,
      eliteRef, eliteProvisional: eliteRef != null,
      gapToMeetPctl: playerPctl == null ? null : Math.max(0, MEETS_PCTL - playerPctl),
      gapToElite, benchmark,
    };
  }).sort((a, b) => b.weight - a.weight);

  const scoredRows = rows.filter((r) => r.band !== "unknown");
  const total = scoredRows.length;
  const metCount = scoredRows.filter((r) => r.band === "meets" || r.band === "above").length;

  // Weakest demanded quality = the lowest-percentile "below" row (tiebreak: highest demand weight).
  const belowRows = scoredRows.filter((r) => r.band === "below")
    .sort((a, b) => (a.playerPctl ?? 0) - (b.playerPctl ?? 0) || b.weight - a.weight);
  const weakest = belowRows[0] ?? null;

  const verdict: Bi = total === 0
    ? { en: `${name} — not enough fitness-test data to score his position's physical requirements yet.`,
        is: `${name} — ekki nóg þolpróf-gögn til að meta líkamlegar kröfur stöðunnar enn.` }
    : {
        en: `Meets his ${roleLabel.en} physical requirements on ${metCount}/${total}${weakest ? ` — below on ${weakest.label.en.toLowerCase()}` : ""}.`,
        is: `Uppfyllir líkamlegar kröfur ${roleLabel.is} í ${metCount}/${total}${weakest ? ` — undir í ${weakest.label.is.toLowerCase()}` : ""}.`,
      };

  const squadFallback = scoredRows.some((r) => r.benchmark === "squad");
  const hasMasMss = fitnessValues.aerobic_endurance != null && fitnessValues.speed != null;
  const confidence: Confidence = total === 0 || squadFallback ? "low" : hasMasMss ? "high" : "moderate";

  return { ...base, scored: total > 0, verdict, metCount, total, rows, confidence };
}
