/** Per-exercise info shown in the ⓘ modal. Keys are lowercase exercise names. */

export type ExerciseDescription = {
  execution: string[];
  focus?: string[];
  goal: string;
};

export type ExerciseEntry = {
  IS: ExerciseDescription;
  EN: ExerciseDescription;
  /** Optional video URL (e.g. Vimeo) shown as a button in the info modal */
  videoUrl?: string;
};

export const EXERCISE_DB: Record<string, ExerciseEntry> = {
  "trap bar deadlift": {
    IS: {
      execution: [
        "Stattu inni í trap bar",
        "Hné og mjaðmir beygð (neutral bak)",
        "Lyftu með því að þrýsta fótum í gólfið",
        "Haltu bringu uppi og bakinu beinu",
        "Stjórnað niður aftur",
      ],
      focus: [
        "Hámarks kraftur í upphafi lyftu",
        "Sprengja upp (ekki hæg lyfta)",
      ],
      goal: "👉 Byggja upp hráan styrk og force production í mjöðmum og lærum",
    },
    EN: {
      execution: [
        "Stand inside the trap bar, feet shoulder-width apart",
        "Bend knees and hips — maintain neutral spine",
        "Grip the handles and brace your core",
        "Drive your feet into the floor to lift",
        "Keep chest up and shoulders back",
        "Lower the bar under control",
      ],
      focus: [
        "Maximum force off the floor",
        "Explosive drive — not a slow, grinding lift",
      ],
      goal: "Build raw strength and force production in hips and legs.",
    },
  },

  "split stance trap bar deadlift": {
    IS: {
      execution: [
        "Einn fótur aðeins framar (split stance)",
        "Sama lyftuhreyfing og í trap bar deadlift",
        "Meiri áhersla á framfót",
      ],
      goal: "👉 Auka einbeittan styrk og stöðugleika (unilateral strength)",
    },
    EN: {
      execution: [
        "Stand inside the trap bar",
        "Place one foot slightly forward (70–80% of load on the front foot)",
        "Lift it like a deadlift",
        "Keep balance and control through the full lift",
        "Keep the torso stable with no rotation",
      ],
      focus: [
        "Drive through the front foot",
        "Stable torso — no rotation",
        "Balance first — don't fall out of position",
      ],
      goal: "Increase unilateral strength, reduce side-to-side imbalance and improve match stability.",
    },
  },

  "rfess": {
    IS: {
      execution: [
        "Aftari fótur upp á bekk",
        "Framfótur tekur mest álag",
        "Lækka niður þar til hné nálgast gólf",
        "Ýta upp í gegnum framfót",
      ],
      goal: "👉 Styrkja:\nQuadriceps og glutes\nJafnvægi og stöðugleika milli fóta",
    },
    EN: {
      execution: [
        "Place the rear foot on a bench",
        "Let the front foot take most of the load",
        "Lower down and then drive back up",
        "Keep the torso upright throughout",
        "Use a deep, controlled range of motion",
      ],
      focus: [
        "Deep, controlled movement",
        "Don't fall forward",
        "Keep the torso stable",
      ],
      goal: "Strengthen the quadriceps and glutes, improve single-leg control and reduce knee and groin injury risk.",
    },
  },

  "box jumps": {
    IS: {
      execution: [
        "Stattu framan við kassa með fætur í öxlabreidd",
        "Beygðu hægar niður í hálf-hnébeygju",
        "Sprengdu upp með lám og örmum",
        "Lendum mjúklega á kassa — mjúkar liðir við lendingu",
        "Rétttu þig upp og stígðu rólega niður",
      ],
      focus: [
        "Hámarks hraði og sprengikraftur upp á við",
        "Gæði > magn — ekki hoppa of oft í þreytu",
        "Mjúk og stöðug lending",
      ],
      goal: "Auka explosiveness og rate of force development (RFD) — hversu fljótt þú getur framleitt hámarks kraft.",
    },
    EN: {
      execution: [
        "Stand facing the box, feet shoulder-width apart",
        "Dip into a shallow quarter-squat",
        "Explosively jump using legs and arms",
        "Land softly on the box — absorb with your joints",
        "Stand up fully, then step down carefully",
      ],
      focus: [
        "Maximum height and explosive power",
        "Quality over quantity — don't jump fatigued",
        "Soft, controlled landing",
      ],
      goal: "Increase explosiveness and rate of force development (RFD) — how quickly you can produce maximum force.",
    },
  },

  "drop jumps": {
    IS: {
      execution: [
        "Stattu á brún kassa",
        "Stígðu niður (ekki hoppaðu niður) af kassanum",
        "Um leið og þú snertir gólf — hoppaðu strax upp aftur",
        "Haltu snertitíma við gólf sem stystan",
        "Lend mjúklega — ekki sökkva djúpt niður",
      ],
      focus: [
        "\"Snappy\" viðbragð — eins og gólf sé heitt",
        "Lágmarks snertitími",
        "Ekki sökkva djúpt niður við lendingu",
      ],
      goal: "Þjálfa reactive strength og elastic energy — getan til að nota orku frá lendingu beint í næsta stökk.",
    },
    EN: {
      execution: [
        "Stand on the edge of the box",
        "Step off (don't jump off) the box",
        "As soon as you land — immediately jump back up",
        "Minimise ground contact time",
        "Land softly — don't sink into a deep squat",
      ],
      focus: [
        "\"Snappy\" reaction — as if the floor is hot",
        "Minimal ground contact time",
        "Shallow landing — stay stiff through ankles and knees",
      ],
      goal: "Train reactive strength and elastic energy — the ability to redirect landing force directly into the next jump.",
    },
  },

  "db snatch": {
    IS: {
      execution: [
        "Byrjaðu með lóð milli fóta",
        "Farðu í hinge stöðu og sprengdu upp frá mjöðmum",
        "Dragðu lóðið upp og catchaðu því yfir höfuð í einni hreyfingu",
        "Láttu lóðið fara létt upp — ekki toga hægt",
        "Skiptu um hendur eftir reps",
      ],
      focus: [
        "🎯 Notaðu mjöðmina — ekki armana",
        "Lóðið á að fljúga létt upp",
        "Sprengikraftur og samhæfing í einni hreyfingu",
      ],
      goal: "Þjálfa full-body explosiveness, bæta samhæfingu og auka transfer yfir í sprint og stefnubreytingar.",
    },
    EN: {
      execution: [
        "Start with the dumbbell between your feet",
        "Hinge and explode through the hips",
        "Pull the dumbbell up and catch it overhead in one motion",
        "Let the load move fast — don't grind it up",
        "Switch hands after the prescribed reps",
      ],
      focus: [
        "Use the hips — not the arm",
        "The dumbbell should feel light going up",
        "Explosive movement with clean coordination",
      ],
      goal: "Train full-body explosiveness, improve coordination and build transfer into sprinting and change of direction.",
    },
  },

  "mid-thigh pull": {
    IS: {
      execution: [
        "Stattu uppréttur með stöng við miðjan læri",
        "Létt beygja í hnjám og mjöðmum",
        "Dragðu stöngina upp með sprengikrafti — hip drive + shrug",
        "Haltu olnbogum slökum (þeir fylgja með, ráa ekki)",
        "Stutt, snöpp og sprengjandi hreyfing",
      ],
      focus: [
        "Krafturinn kemur frá mjöðmum og lendum — ekki armunum",
        "Hámarks effort í hvert skipti",
        "Lóð fer létt upp — ekki toga hægt",
      ],
      goal: "Auka max force og rate of force development (RFD). Virkjar posterior chain og undirbýr taugakerfið fyrir sprengikraft — neural primer + power builder.",
    },
    EN: {
      execution: [
        "Stand tall with the bar at mid-thigh height",
        "Slight bend in knees and hips",
        "Pull the bar upward with explosive force — hip drive + shrug",
        "Keep elbows relaxed (they follow the movement, don't row)",
        "Short, sharp, explosive movement",
      ],
      focus: [
        "Power comes from hips and legs — not the arms",
        "Maximum effort every rep",
        "Bar should feel light going up — don't pull slow",
      ],
      goal: "Increase max force and rate of force development (RFD). Activates the posterior chain and primes the nervous system for explosive output — neural primer + power builder.",
    },
  },

  "iso mid-thigh pull": {
    IS: {
      execution: [
        "Sama staða og í Mid-Thigh Pull",
        "Dragðu stöngina upp af hámarks hraða en haltu henni alveg kyrri",
        "Engin hreyfing á stönginni — bara hámarks tog",
        "Haltu spennunni í 3–5 sekúndur",
        "Full spenna allan tímann",
      ],
      focus: [
        "🔥 Max effort (iso)",
        "100% effort í toginu",
        "Engin slökun í stöðunni",
      ],
      goal: "Auka maximal neural drive, bæta force production án mikillar þreytu og styðja við sinar og meiðslavarnir — low fatigue, high neural output.",
    },
    EN: {
      execution: [
        "Use the same setup as the Mid-Thigh Pull",
        "Pull against the bar as fast and hard as possible while keeping it still",
        "No bar movement — just maximal isometric force",
        "Hold tension for 3–5 seconds",
        "Maintain full tension the whole time",
      ],
      focus: [
        "Max effort on every pull",
        "No relaxation during the hold",
        "Stay fully braced throughout",
      ],
      goal: "Increase maximal neural drive, improve force production with minimal fatigue and support tendon health and injury prevention — low fatigue, high neural output.",
    },
  },

  "jump shrugs": {
    IS: {
      execution: [
        "Stattu með stöng eða dumbbell fremur að þér",
        "Beygðu hægar í mjöðmum og hnám (hip hinge)",
        "Sprengdu upp með mjöðmum, lendum og ökkljum",
        "Rétttu þig upp að fullu og rykktu öxlum upp (shrug)",
        "Lend mjúklega og endurtaktu",
      ],
      focus: [
        "Full extension — mjöðmar, hnén og ökklar réttast að fullu",
        "Shrug kemur eftir extension — ekki samtímis",
        "Haltu þyngdinni nálægt líkamanum",
      ],
      goal: "Þjálfa explosive triple extension og taugavöðvavirkjun sem overflows yfir í hraðaæfingar og stökk.",
    },
    EN: {
      execution: [
        "Stand with bar or dumbbell in front of you",
        "Hinge at hips and knees into a hip hinge position",
        "Explosively drive hips, knees and ankles to full extension",
        "At the top, shrug your shoulders up powerfully",
        "Land softly and repeat",
      ],
      focus: [
        "Full triple extension — hips, knees and ankles fully extended",
        "Shrug follows extension — don't do them at the same time",
        "Keep the load close to your body",
      ],
      goal: "Train explosive triple extension and neuromuscular activation that transfers directly into speed and jumping.",
    },
  },

  // ─── MET exercises (OFF day) ──────────────────────────────────────

  "hip flexor met": {
    videoUrl: "https://vimeo.com/706049903/8ec966ac36",
    IS: {
      execution: [
        "Liggðu á bakmegin á bekkjarenda — annað hné hangir niður (Thomas-test staða)",
        "Þjálfari færir fótinn niður þar til fyrsta mótstaða finnst (feather-edge) — ekki þrýsta of langt",
        "INNÖNDUN: Þrýstu hnénu upp gegn hendi þjálfara — létt, ~20% kraftur — í 5 sek",
        "ÚTÖNDUN: Andaðu út og slakaðu algjörlega á — þjálfari lætur fótinn síga varlega í nýja lengd (10 sek)",
        "Endurtaktu 3 sinnum á hvora hlið",
      ],
      focus: [
        "Byrjaðu alltaf á feather-edge — ekki hámarkshreyfisvið",
        "20% kraftur eingöngu — þetta er EKKI styrktaræfing",
        "Andinn stýrir: innöndun = samdráttur, útöndun = slökun + ný lengd",
      ],
      goal: "👉 Losa um mjaðmabeygjur (iliopsoas + rectus femoris) sem styttast við langvarandi setu og þjálfun. Dregur úr anterior pelvic tilt og léttir álagi á mjóbak.",
    },
    EN: {
      execution: [
        "Lie supine at the edge of a bench — one knee hangs off (Thomas-test position)",
        "Coach lowers the leg until the first resistance is felt (feather-edge) — do not push too far",
        "INHALE: Push knee up against coach's hand — light, ~20% force — for 5 seconds",
        "EXHALE: Breathe out and fully relax — coach gently lowers the leg to a new length (10 sec)",
        "Repeat 3 times per side",
      ],
      focus: [
        "Always start at feather-edge — not max range",
        "20% force only — this is NOT a strength exercise",
        "Breathing drives it: inhale = contraction, exhale = release + new length",
      ],
      goal: "Release hip flexors (iliopsoas + rectus femoris) that shorten from prolonged sitting and training. Reduces anterior pelvic tilt and relieves lower back load.",
    },
  },

  "hamstring met": {
    IS: {
      execution: [
        "Liggðu á baki — þjálfari lyftir beinum fæti þar til fyrsta mótstaða (feather-edge)",
        "MIKILVÆGT: Mjaðnagrind verður að vera FLAT við benkinn — ef hún veltur tapast krafturinn í lendarhrygg",
        "INNÖNDUN: Þrýstu hælnum niður gegn hendi/öxl þjálfara — ~20% kraftur — í 5 sek",
        "ÚTÖNDUN: Slakaðu á — þjálfari færir fót varlega í nýja lengd (10 sek). Mjaðnagrind helst flat.",
        "Endurtaktu 3 sinnum á hvora hlið",
      ],
      focus: [
        "Mjaðnagrind flat á benknum alla tíma — annars er æfingin óskilvirk",
        "Feather-edge — fyrsta mótstaðan, ekki hámarksteygja",
        "Heimaæfing: Nota belti um fótinn og framkvæma sjálfur",
      ],
      goal: "👉 Auka teygjuþol (stretch tolerance) í hamstrings. Taugakerfið leyfir meiri hreyfingu til langs tíma, þó viscoelastic breytingin sé skammvinn.",
    },
    EN: {
      execution: [
        "Lie supine — coach lifts the straight leg until first resistance (feather-edge)",
        "CRITICAL: Pelvis must stay FLAT on the bench — if it tilts, the force transfers to the lumbar spine",
        "INHALE: Push heel down against coach's hand/shoulder — ~20% force — for 5 seconds",
        "EXHALE: Relax — coach gently moves the leg to a new length (10 sec). Pelvis stays flat.",
        "Repeat 3 times per side",
      ],
      focus: [
        "Pelvis flat on the bench at all times — otherwise the exercise is ineffective",
        "Feather-edge — first resistance, not max stretch",
        "Self-MET: Use a belt around the foot and perform solo",
      ],
      goal: "Increase stretch tolerance in hamstrings. The nervous system allows greater range long-term, even though the viscoelastic change is short-lived.",
    },
  },

  "adductor met": {
    IS: {
      execution: [
        "Liggðu á baki, hné beygt, fótur á borði",
        "Þjálfari færir hnéð út til hliðar (abduction) að feather-edge",
        "INNÖNDUN: Þrýstu hnénu inn (adduction) gegn hendi þjálfara — ~20% kraftur — í 5 sek",
        "ÚTÖNDUN: Slakaðu á — þjálfari færir hnéð varlega lengra út í nýja lengd (10 sek)",
        "Endurtaktu 3 sinnum á hvora hlið",
      ],
      focus: [
        "Þrýstu inn (nærfærsla) — ekki upp eða niður",
        "Feather-edge áður en samdráttur hefst",
        "Létt kraftur — aðeins 20% af hámarkskrafti",
      ],
      goal: "👉 Losa um nærfærsluvöðva sem eru oft ofvirkir hjá fótboltamönnum vegna sparks og snúnings. Dregur úr sársauka í nára og eykur mjaðnasnúning.",
    },
    EN: {
      execution: [
        "Lie supine, knee bent, foot on the table",
        "Coach moves the knee outward (abduction) to feather-edge",
        "INHALE: Push knee inward (adduction) against coach's hand — ~20% force — for 5 seconds",
        "EXHALE: Release — coach gently moves knee further out to a new length (10 sec)",
        "Repeat 3 times per side",
      ],
      focus: [
        "Push inward (adduction) — not up or down",
        "Find feather-edge before starting the contraction",
        "Light force — only 20% of maximum",
      ],
      goal: "Release adductors that are often overactive in footballers from kicking and turning. Reduces groin pain and improves hip rotation.",
    },
  },

  "piriformis met": {
    IS: {
      execution: [
        "Liggðu á baki, hné beygt í 90°, fótur á borði",
        "Þjálfari fer í innsnúning á mjaðnalið (færir fót út) að feather-edge",
        "INNÖNDUN: Þrýstu fæti inn (ytri snúningur) gegn hendi þjálfara — ~20% kraftur — 5 sek",
        "ÚTÖNDUN: Slakaðu á — þjálfari færir fót lengra út (innsnúningur) í nýja lengd (10 sek)",
        "Endurtaktu 3 sinnum á hvoru hlið",
      ],
      focus: [
        "Ef sársauki við samdrátt: Notaðu RI (reciprocal inhibition) — spennu mjaðmabeygjur í staðinn",
        "Sérstaklega gott til að slökkva á trigger-punktum í piriformis",
        "Horfa í átt að samdrættinum (visual synkinesis) auðveldar taugaboðin",
      ],
      goal: "👉 Losa um piriformis sem getur hermt ischias-einkenni. MET er sérstaklega áhrifarík til að slökkva á trigger-punktum í þessum vöðva.",
    },
    EN: {
      execution: [
        "Lie supine, knee bent at 90°, foot on table",
        "Coach takes the hip into internal rotation (moves foot outward) to feather-edge",
        "INHALE: Push foot inward (external rotation) against coach's hand — ~20% force — 5 sec",
        "EXHALE: Release — coach gently moves foot further outward (internal rotation) to new length (10 sec)",
        "Repeat 3 times per side",
      ],
      focus: [
        "If pain during contraction: Use RI (reciprocal inhibition) — contract hip flexors instead",
        "Especially effective at turning off trigger points in piriformis",
        "Look in the direction of contraction (visual synkinesis) to facilitate neural signaling",
      ],
      goal: "Release piriformis which can mimic sciatic symptoms. MET is particularly effective at turning off trigger points in this muscle.",
    },
  },

  "ql met": {
    IS: {
      execution: [
        "Liggðu á hliðinni — efri handleggur rétt yfir höfuð til að opna QL",
        "Þjálfari stöðugar mjaðnagrind og færir bol í hliðarbeygjur (lateral flexion) að feather-edge",
        "INNÖNDUN: Þrýstu bol aftur í átt að hliðarbeygjunni — ~20% — 5 sek",
        "ÚTÖNDUN: Slakaðu á — þjálfari færir varlega í nýja lengd (10 sek)",
        "Endurtaktu 3 sinnum á hvora hlið",
      ],
      focus: [
        "Mjaðnagrind stöðug — eingöngu hreyfing í bol",
        "Létt kraftur — QL er lítill vöðvi",
        "Þessi æfing er í GREEN+ sniðmátinu eingöngu",
      ],
      goal: "👉 Losa um quadratus lumborum sem getur valdið einhliða mjóbaksverkjum og dregið úr hliðarbeygjur hreyfisviðs.",
    },
    EN: {
      execution: [
        "Lie on your side — upper arm extended overhead to open the QL",
        "Coach stabilizes the pelvis and moves the torso into lateral flexion to feather-edge",
        "INHALE: Push torso back against the lateral flexion — ~20% — 5 sec",
        "EXHALE: Release — coach gently moves to new length (10 sec)",
        "Repeat 3 times per side",
      ],
      focus: [
        "Pelvis stays stable — movement only in the torso",
        "Light force — QL is a small muscle",
        "This exercise is in the GREEN+ template only",
      ],
      goal: "Release the quadratus lumborum which can cause unilateral lower back pain and reduced lateral flexion range.",
    },
  },
};

/**
 * Look up exercise info by name (case-insensitive, partial match).
 * Returns null if no match found.
 */
export function lookupExercise(name: string): ExerciseEntry | null {
  const key = name.toLowerCase().trim();
  // Exact match first
  if (EXERCISE_DB[key]) return EXERCISE_DB[key];
  // Partial match
  for (const dbKey of Object.keys(EXERCISE_DB)) {
    if (key.includes(dbKey) || dbKey.includes(key)) return EXERCISE_DB[dbKey];
  }
  return null;
}
