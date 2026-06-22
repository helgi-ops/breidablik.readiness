/**
 * trainingPrescriptions — the "how to train them" layer for Train like you Play.
 *
 * Closes the loop the preparedness board opens: the board flags WHERE a player
 * (or position) is under-exposed to match demand; this maps each under-exposed
 * movement metric to a concrete, paper-cited training method the coach can act on.
 *
 * Rules decide, not AI (explainability-first principle #3 — every flag gets a
 * "what to do" lever; #7 — every recommendation carries a citation). The mapping
 * is a fixed lookup, deterministic; nothing here is generated.
 *
 * Keys mirror the Train-like-you-Play metric keys (route.ts METRICS): top_speed,
 * fmp_run_high, fmp_dyn_high, fmp_dyn_med, ima_accel, ima_decel, ima_cod, ima_jumps.
 */

export type PrescriptionKey =
  | "top_speed" | "fmp_run_high" | "fmp_dyn_high" | "fmp_dyn_med"
  | "ima_accel" | "ima_decel" | "ima_cod" | "ima_jumps"
  // Core / Lite (GPS + Gen2 efforts) keys — same training methods, different signal.
  | "decel_eff" | "sprint_eff" | "hsr_dist"
  // Volume + work-rate.
  | "player_load" | "pl_per_min";

type L = { EN: string; IS: string };

export type Prescription = {
  /** Plain-language name of the quality being trained (no jargon). */
  quality: L;
  /** The concrete "what to do" — drills / methods / dosage. */
  method: L;
  /** Paper citation shown in a tooltip (principle #7). */
  cite: string;
};

export const PRESCRIPTIONS: Record<PrescriptionKey, Prescription> = {
  top_speed: {
    quality: { EN: "Top-speed sprinting", IS: "Hámarkshraða-spretti" },
    method: {
      EN: "Expose to near-maximal sprinting weekly — flying 20–40 m runs reaching ≥90% of top speed. Builds the speed reserve and protects the hamstrings against match sprints.",
      IS: "Útsettu fyrir nær-hámarks spretti vikulega — fljúgandi 20–40 m spretti í ≥90% hámarkshraða. Byggir hraða-forða og ver aftanlæri fyrir leik-sprettum.",
    },
    cite: "Malone 2017; Buchheit 2014",
  },
  fmp_run_high: {
    quality: { EN: "High-speed running", IS: "Háhraðahlaupi" },
    method: {
      EN: "Build high-speed running volume — repeated runs above the high-speed threshold (e.g. 4–6 × 30–40 m), tempo runs, and games on a larger pitch.",
      IS: "Byggðu upp háhraðahlaup — endurtekin hlaup yfir háhraðaþröskuld (t.d. 4–6 × 30–40 m), tempo-hlaup og leiki á stærri velli.",
    },
    cite: "Malone 2018",
  },
  fmp_dyn_high: {
    quality: { EN: "High-intensity multidirectional work", IS: "Háákefðar fjölátta vinnu" },
    method: {
      EN: "Add high-intensity multidirectional work — small-sided games (3v3–5v5) and intense agility circuits with the ball, where accelerations and turns come fast.",
      IS: "Bættu við háákefðar fjölátta vinnu — fámenna leiki (3v3–5v5) og ákafar agility-brautir með bolta, þar sem hröðun og snúningar koma hratt.",
    },
    cite: "Malone 2017",
  },
  fmp_dyn_med: {
    quality: { EN: "Moderate multidirectional volume", IS: "Miðlungs fjölátta magni" },
    method: {
      EN: "Add moderate multidirectional volume — possession games on a medium pitch and tempo runs with turns and changes of pace.",
      IS: "Bættu við miðlungs fjölátta magni — boltahalds-leiki á miðlungsvelli og tempo-hlaup með snúningum og hraðabreytingum.",
    },
    cite: "Malone 2017",
  },
  ima_accel: {
    quality: { EN: "Accelerations", IS: "Hröðun" },
    method: {
      EN: "Add acceleration exposure — short sprint starts (5–15 m), resisted accelerations (sled or band) and reactive starts from varied stances.",
      IS: "Bættu við hröðunar-útsetningu — stutta sprettstarta (5–15 m), mótstöðu-hröðun (sleði eða teygja) og viðbragðs-starta úr ýmsum stöðum.",
    },
    cite: "Buchheit 2014",
  },
  ima_decel: {
    quality: { EN: "Decelerations & braking", IS: "Hemlun & bremsun" },
    method: {
      EN: "Add deceleration and braking exposure — planned and reactive stops, decel-to-cut drills, plus eccentric strength (Nordics, split squats) to tolerate the braking load.",
      IS: "Bættu við hemlunar- og bremsu-útsetningu — skipulögð og viðbragðs-stopp, decel-to-cut æfingar, ásamt sérvirkum styrk (Nordics, split squats) til að þola bremsu-álagið.",
    },
    cite: "McBurnie 2022",
  },
  ima_cod: {
    quality: { EN: "Change of direction", IS: "Stefnubreytingum" },
    method: {
      EN: "Add change-of-direction work — cutting drills (45–90°) in both directions, reactive agility to a cue, and deceleration-into-turn patterns.",
      IS: "Bættu við stefnubreytinga-vinnu — cutting æfingar (45–90°) í báðar áttir, viðbragðs-agility eftir merki og hemlun-inn-í-snúning mynstur.",
    },
    cite: "McBurnie 2022; Dos'Santos 2022",
  },
  ima_jumps: {
    quality: { EN: "Jumps & plyometrics", IS: "Stökki & plyometrics" },
    method: {
      EN: "Add jump and plyometric exposure — bounding, hops and repeated landings; build landing control before adding volume.",
      IS: "Bættu við stökk- og plyometrískri útsetningu — bounding, hopp og endurteknar lendingar; byggðu lendingar-stjórn áður en magn er aukið.",
    },
    cite: "Markovic 2007",
  },
  // ── Core / Lite (GPS + Gen2 efforts) — same methods as the IMA/FMP equivalents ──
  decel_eff: {
    quality: { EN: "Hard accel/decel efforts", IS: "Ákafa-átök (hröðun/hemlun)" },
    method: {
      EN: "Add hard accel/decel exposure — planned and reactive stops, decel-to-cut drills, plus eccentric strength (Nordics, split squats) to tolerate the braking load.",
      IS: "Bættu við ákafa hröðunar/hemlunar-útsetningu — skipulögð og viðbragðs-stopp, decel-to-cut æfingar, ásamt sérvirkum styrk (Nordics, split squats) til að þola bremsu-álagið.",
    },
    cite: "McBurnie 2022",
  },
  sprint_eff: {
    quality: { EN: "Sprint efforts", IS: "Spretta-átök" },
    method: {
      EN: "Add sprint-effort exposure — repeated near-maximal sprints (e.g. 6–10 × 20–30 m) and large-pitch games that force top-end efforts.",
      IS: "Bættu við spretta-átökum — endurteknir nær-hámarks sprettir (t.d. 6–10 × 20–30 m) og leikir á stórum velli sem kalla á hámarks-átök.",
    },
    cite: "Malone 2017",
  },
  hsr_dist: {
    quality: { EN: "High-speed running", IS: "Háhraðahlaupi" },
    method: {
      EN: "Build high-speed running volume — repeated runs above the high-speed threshold (e.g. 4–6 × 30–40 m), tempo runs, and games on a larger pitch.",
      IS: "Byggðu upp háhraðahlaup — endurtekin hlaup yfir háhraðaþröskuld (t.d. 4–6 × 30–40 m), tempo-hlaup og leiki á stærri velli.",
    },
    cite: "Malone 2018",
  },
  player_load: {
    quality: { EN: "Training volume (Player Load)", IS: "Þjálfunarmagni (Player Load)" },
    method: {
      EN: "Raise overall training volume — longer or denser sessions, more ball-in-play time, so the weekly mechanical load approaches match level.",
      IS: "Auktu heildar þjálfunarmagn — lengri eða þéttari æfingar, meiri bolta-í-leik tími, svo vikulegt vélrænt álag nálgist leik-stig.",
    },
    cite: "Gabbett 2016",
  },
  pl_per_min: {
    quality: { EN: "Work rate (intensity)", IS: "Ákefð (work rate)" },
    method: {
      EN: "Train at match intensity — smaller-sided games, higher tempo, shorter rest, so Player Load per minute matches what the game demands.",
      IS: "Þjálfaðu á leik-ákefð — fámennari leikir, hærra tempó, styttri hvíld, svo Player Load á mínútu nái því sem leikurinn krefst.",
    },
    cite: "Gabbett 2016",
  },
};

export function prescriptionFor(key: string): Prescription | undefined {
  return (PRESCRIPTIONS as Record<string, Prescription>)[key];
}

/** Member shape the focus helpers need (a subset of the page's Player). */
export type FocusMember = {
  name: string;
  modeGaps: number;
  display: Record<string, { pct: number | null; flag: string } | undefined>;
};

export type GroupFocusItem = { key: string; underCount: number; share: number };

/**
 * Rank a position group's training priorities: the metrics where the most
 * members are under-exposed. Returns metrics with at least one under-exposed
 * member, sorted by how widespread the gap is. Caller decides how many to show.
 */
export function rankGroupFocus(members: FocusMember[], metricKeys: string[]): GroupFocusItem[] {
  const total = members.length || 1;
  return metricKeys
    .map((key) => {
      const underCount = members.filter((m) => m.display[key]?.flag === "under").length;
      return { key, underCount, share: underCount / total };
    })
    .filter((x) => x.underCount > 0)
    .sort((a, b) => b.underCount - a.underCount || b.share - a.share);
}

/**
 * A single player's worst under-exposed metric (lowest % of match demand), so
 * the per-player exception can show the one thing to prioritise for him.
 */
export function worstGapFor(member: FocusMember, metricKeys: string[]): { key: string; pct: number } | null {
  const under = metricKeys
    .map((key) => ({ key, pct: member.display[key]?.pct ?? null, flag: member.display[key]?.flag }))
    .filter((x): x is { key: string; pct: number; flag: string } => x.flag === "under" && x.pct != null)
    .sort((a, b) => a.pct - b.pct);
  return under[0] ? { key: under[0].key, pct: under[0].pct } : null;
}
