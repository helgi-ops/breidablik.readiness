/**
 * Robustness drill catalog — maps a LOAD QUALITY (what a player's own movement
 * data shows he does a lot of, or where he's asymmetric) to targeted drills
 * that build his capacity to HANDLE that load. This is capacity-building, the
 * deliberate complement to Unfamiliar Load (which only monitors drift).
 *
 * Rules decide which qualities matter for a player (see engine.ts); this file
 * is the curated, evidence-tagged menu of drills per quality. Plain language,
 * bilingual, with a short "why" so a non-S&C coach (and the player) understand
 * the point. Citations are real S&C references.
 */

export type LoadQuality = "decel" | "cod" | "sprint" | "jumps" | "accel";

export type RobustnessDrill = {
  id: string;
  quality: LoadQuality;
  name: { en: string; is: string };
  cue: { en: string; is: string };     // how to do it / coaching point
  dose: string;                          // simple prescription
  evidence: string;                      // short citation tag
  unilateral: boolean;                   // usable for asymmetry correction
};

export const QUALITY_META: Record<LoadQuality, {
  label: { en: string; is: string };
  signal: { en: string; is: string };   // the data signal that flags it
  why: { en: string; is: string };       // why building this helps him handle his load
}> = {
  decel: {
    label: { en: "Braking / deceleration", is: "Hemlun / hraðaminnkun" },
    signal: { en: "high-intensity decelerations", is: "háákefðar hraðaminnkanir" },
    why: {
      en: "He brakes hard and often — building eccentric strength and landing control lets his body absorb that force safely.",
      is: "Hann hemlar oft og kröftuglega — eccentric styrkur og lendingarstjórn hjálpa líkamanum að taka við því álagi á öruggan hátt.",
    },
  },
  cod: {
    label: { en: "Change of direction", is: "Stefnubreytingar" },
    signal: { en: "change-of-direction volume", is: "fjöldi stefnubreytinga" },
    why: {
      en: "He cuts and changes direction a lot — lateral strength and clean cutting technique make those actions more powerful and more durable.",
      is: "Hann skiptir oft um stefnu — hliðarstyrkur og hrein tækni gera þær hreyfingar kröftugri og endingarbetri.",
    },
  },
  sprint: {
    label: { en: "High-speed running", is: "Háhraðahlaup" },
    signal: { en: "sprint / high-speed distance", is: "sprett- / háhraðavegalengd" },
    why: {
      en: "He covers a lot at high speed — hamstring robustness and sprint mechanics protect against the highest-risk moments of sprinting.",
      is: "Hann hleypur mikið á miklum hraða — aftanlæris-robustness og sprett-tækni verja gegn áhættusömustu augnablikum spretthlaups.",
    },
  },
  jumps: {
    label: { en: "Jumping & landing", is: "Stökk og lending" },
    signal: { en: "jump count", is: "fjöldi stökka" },
    why: {
      en: "He jumps a lot — landing mechanics and ankle/tendon stiffness let him take off and land repeatedly without breaking down.",
      is: "Hann stekkur mikið — lendingartækni og stífleiki í ökkla/sin gera honum kleift að stökkva og lenda aftur og aftur án þess að gefa sig.",
    },
  },
  accel: {
    label: { en: "Acceleration / explosive starts", is: "Hröðun / sprengikraftur" },
    signal: { en: "high-intensity accelerations", is: "háákefðar hraðaaukningar" },
    why: {
      en: "He accelerates explosively and often — posterior-chain power and acceleration mechanics make those starts stronger and more repeatable.",
      is: "Hann hraðar sér oft og kröftuglega — kraftur í aftanverðum líkama og hröðunartækni gera startin sterkari og endurteknari.",
    },
  },
};

export const ROBUSTNESS_DRILLS: RobustnessDrill[] = [
  // ── Deceleration / braking ──────────────────────────────────────────
  { id: "decel_snapdown", quality: "decel", unilateral: false,
    name: { en: "Snapdown to athletic stick", is: "Snapdown í stöðustopp" },
    cue: { en: "Drop fast into a strong athletic position and freeze — absorb, don't collapse.", is: "Fall hratt í sterka íþróttastöðu og frystu — taktu við, ekki hrynja." },
    dose: "3 × 5", evidence: "Dos'Santos 2022 (decel mechanics)" },
  { id: "decel_tempo_squat", quality: "decel", unilateral: false,
    name: { en: "Tempo squat (4s lowering)", is: "Tempo hnébeygja (4s niður)" },
    cue: { en: "Lower under control for 4 seconds, then stand normally.", is: "Síga stjórnað í 4 sek, stattu svo upp eðlilega." },
    dose: "3 × 5", evidence: "Eccentric overload (Harper 2022)" },
  { id: "decel_sl_rdl", quality: "decel", unilateral: true,
    name: { en: "Single-leg Romanian deadlift", is: "Einfætt rúmensk réttstöðulyfta" },
    cue: { en: "Hinge on one leg, slow on the way down, flat back.", is: "Beygðu á öðrum fæti, hægt niður, beint bak." },
    dose: "3 × 6 each", evidence: "Posterior-chain eccentric" },
  { id: "decel_lateral_stick", quality: "decel", unilateral: true,
    name: { en: "Lateral bound + stick", is: "Hliðarstökk + stopp" },
    cue: { en: "Bound sideways, land on one leg and hold 2 seconds, silent landing.", is: "Stökktu til hliðar, lentu á öðrum fæti og haltu í 2 sek, hljóðlaus lending." },
    dose: "3 × 4 each", evidence: "Harper 2022 (horizontal braking)" },

  // ── Change of direction ─────────────────────────────────────────────
  { id: "cod_45_cut", quality: "cod", unilateral: true,
    name: { en: "45° cut technique", is: "45° beygjutækni" },
    cue: { en: "Plant the outside foot, stay low, push hard off it into the new direction.", is: "Plantaðu ytri fæti, vertu lágur, ýttu kröftuglega í nýja átt." },
    dose: "4 × 3 each side", evidence: "Dos'Santos 2019 (COD technique)" },
  { id: "cod_skater", quality: "cod", unilateral: true,
    name: { en: "Lateral skater bounds", is: "Skautastökk til hliðar" },
    cue: { en: "Push side to side, land and stabilise on one leg each time.", is: "Ýttu hlið í hlið, lentu og jafnvægisstilltu á öðrum fæti í hvert sinn." },
    dose: "3 × 6 each", evidence: "Lateral force production" },
  { id: "cod_copenhagen", quality: "cod", unilateral: true,
    name: { en: "Copenhagen plank", is: "Copenhagen planki" },
    cue: { en: "Side plank with top leg on a bench — builds groin/adductor strength for cutting.", is: "Hliðarplanki með efri fót á bekk — byggir nára/aðdráttarvöðva fyrir beygjur." },
    dose: "3 × 20s each", evidence: "Adductor robustness (Harøy 2019)" },
  { id: "cod_crossover_decel", quality: "cod", unilateral: false,
    name: { en: "Crossover step → decel", is: "Krossspor → hemlun" },
    cue: { en: "Crossover-run a few steps then brake under control.", is: "Hlauptu krossspor nokkur skref og hemlaðu svo stjórnað." },
    dose: "4 × 2 each way", evidence: "COD + braking transfer" },

  // ── Sprint / high-speed running ─────────────────────────────────────
  { id: "sprint_nordic", quality: "sprint", unilateral: false,
    name: { en: "Nordic hamstring curl", is: "Nordic aftanlærisbeygja" },
    cue: { en: "Lower your torso slowly, resisting with the hamstrings as long as you can.", is: "Síga búknum hægt, streittu á móti með aftanlæri eins lengi og þú getur." },
    dose: "3 × 4–6", evidence: "Hamstring injury ↓ (van Dyk 2019)" },
  { id: "sprint_askips", quality: "sprint", unilateral: false,
    name: { en: "A-skips / sprint mechanics", is: "A-skips / sprett-tækni" },
    cue: { en: "Tall posture, punch the knee up, snap the foot down under the hip.", is: "Hár líkami, lyftu hné, sláðu fæti niður undir mjöðm." },
    dose: "3 × 20m", evidence: "Sprint technique" },
  { id: "sprint_strides", quality: "sprint", unilateral: false,
    name: { en: "Flying strides (build-ups)", is: "Fljúgandi skref (build-ups)" },
    cue: { en: "Accelerate to ~90% over 20–30m and relax — exposure to top speed.", is: "Hraðaðu í ~90% á 20–30m og slakaðu — útsetning fyrir hámarkshraða." },
    dose: "4 × 25m", evidence: "Speed exposure (Malone 2017)" },
  { id: "sprint_hip_flexor", quality: "sprint", unilateral: true,
    name: { en: "Wall drive holds", is: "Veggdrif-stöður" },
    cue: { en: "Drive one knee up against a wall, hold a strong sprint position.", is: "Drífðu eitt hné upp í vegg, haltu sterkri sprettstöðu." },
    dose: "3 × 10s each", evidence: "Acceleration position" },

  // ── Jumping & landing ───────────────────────────────────────────────
  { id: "jumps_drop_stick", quality: "jumps", unilateral: false,
    name: { en: "Drop landing → stick", is: "Fallendingar → stopp" },
    cue: { en: "Step off a low box, land soft and silent, freeze the position.", is: "Stígðu af lágum kassa, lentu mjúkt og hljóðlaust, frystu stöðuna." },
    dose: "3 × 5", evidence: "Landing mechanics" },
  { id: "jumps_pogo", quality: "jumps", unilateral: false,
    name: { en: "Pogo hops", is: "Pogo-hopp" },
    cue: { en: "Small fast hops off stiff ankles — minimal ground time.", is: "Lítil hröð hopp af stífum ökklum — sem stystur jarðtími." },
    dose: "3 × 15", evidence: "Ankle/tendon stiffness" },
  { id: "jumps_calf_ecc", quality: "jumps", unilateral: true,
    name: { en: "Eccentric calf raise", is: "Eccentric kálfalyfta" },
    cue: { en: "Rise on two, lower slowly on one — protects the achilles for repeated jumping.", is: "Lyftu á tveimur, síga hægt á einum — verndar hásin fyrir endurteknum stökkum." },
    dose: "3 × 8 each", evidence: "Achilles tendon load" },
  { id: "jumps_box_landing", quality: "jumps", unilateral: false,
    name: { en: "Box jump (focus on landing)", is: "Kassastökk (áhersla á lendingu)" },
    cue: { en: "Jump up, land soft on the box in a strong position — quality over height.", is: "Stökktu upp, lentu mjúkt á kassanum í sterkri stöðu — gæði fram yfir hæð." },
    dose: "3 × 5", evidence: "Plyometric progression" },

  // ── Acceleration / explosive starts ─────────────────────────────────
  { id: "accel_hip_thrust", quality: "accel", unilateral: false,
    name: { en: "Hip thrust", is: "Mjaðmaspyrna (hip thrust)" },
    cue: { en: "Drive the hips up powerfully, squeeze the glutes at the top.", is: "Drífðu mjaðmir kröftuglega upp, kreistu rassvöðva efst." },
    dose: "3 × 6", evidence: "Horizontal force (Contreras 2017)" },
  { id: "accel_broad_jump", quality: "accel", unilateral: false,
    name: { en: "Standing broad jump", is: "Langstökk án atrennu" },
    cue: { en: "Jump forward as far as possible, stick the landing.", is: "Stökktu eins langt fram og þú getur, festu lendinguna." },
    dose: "3 × 4", evidence: "Horizontal power" },
  { id: "accel_sled", quality: "accel", unilateral: false,
    name: { en: "Resisted sled push/march", is: "Sleðaýting með mótstöðu" },
    cue: { en: "Drive forward with long, powerful steps against resistance.", is: "Drífðu fram með löngum, kröftugum skrefum gegn mótstöðu." },
    dose: "4 × 15m", evidence: "Acceleration (resisted)" },
  { id: "accel_wall_drive", quality: "accel", unilateral: true,
    name: { en: "Single-leg wall drive", is: "Einfætt veggdrif" },
    cue: { en: "Explosive knee drive against a wall, strong tall position.", is: "Sprengikröftugt hnédrif í vegg, sterk há staða." },
    dose: "3 × 6 each", evidence: "Acceleration mechanics" },
];

export function drillsForQuality(q: LoadQuality): RobustnessDrill[] {
  return ROBUSTNESS_DRILLS.filter((d) => d.quality === q);
}
export function drillById(id: string): RobustnessDrill | null {
  return ROBUSTNESS_DRILLS.find((d) => d.id === id) ?? null;
}
