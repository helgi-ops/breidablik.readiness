/** Per-exercise info shown in the ⓘ modal. Keys are lowercase exercise names. */

export type ExerciseDescription = {
  execution: string[];
  focus?: string[];
  goal: string;
};

export type ExerciseEntry = {
  IS: ExerciseDescription;
  EN: ExerciseDescription;
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
