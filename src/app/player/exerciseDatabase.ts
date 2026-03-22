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
        "Stattu inni í trap bar með fætur í axlabreidd",
        "Beygðu hnén og mjaðmir — haltu bakinu beinu (neutral)",
        "Gríptu þangana og festustu",
        "Lyftu með því að þrýsta fótum í gólfið",
        "Haltu bringu uppi og öxlum aftur",
        "Stjórnaðu niður aftur með hægum hraða",
      ],
      focus: [
        "Hámarks kraftur í upphafi lyftu",
        "Sprengja upp — ekki hæg, stöðug lyfta",
      ],
      goal: "Byggja upp hráan styrk og force production í mjöðmum og lærum.",
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
        "Stattu inni í trap bar — annar fótur aðeins framar (70–80% þyngdar á framfót)",
        "Aftari fótur er stuðningur — ekki dýfa honum niður",
        "Lyftu eins og venjulega trap bar deadlift",
        "Ýttu í gegnum framfót og haltu jafnvægi",
        "Haltu bolnum stöðugum — enginn snúningur",
      ],
      focus: [
        "Ýta í gegnum framfót — ekki dregst á afturfót",
        "Stöðugur bolur (ekki snúningur til hliðar)",
        "Haltu mjöðmum láréttar í gegnum lyftu",
      ],
      goal: "Auka unilateral strength og jafna út styrksmun milli fóta. Bætir stöðugleika í leiknum.",
    },
    EN: {
      execution: [
        "Stand inside the trap bar — one foot slightly forward (70–80% weight on front foot)",
        "Rear foot is for balance — don't sink into it",
        "Lift as in a standard trap bar deadlift",
        "Drive through the front foot and maintain balance",
        "Keep torso stable — no rotation",
      ],
      focus: [
        "Drive through the front foot — don't shift to the rear",
        "Stable torso (no lateral rotation)",
        "Keep hips level throughout the lift",
      ],
      goal: "Increase unilateral strength and correct strength imbalances between legs. Improves stability in match situations.",
    },
  },

  "rfess": {
    IS: {
      execution: [
        "Settu aftari fót upp á bekk",
        "Framfótur tekur mest álag — um 70% þyngdar",
        "Lækkaðu niður þar til aftara hné nálgast gólf",
        "Ýttu upp í gegnum framfót til að koma aftur upp",
        "Haldu bol uppréttum — ekki detta fram",
      ],
      focus: [
        "Djúp og stjórnuð hreyfing niður",
        "Haltu hné yfir tám (ekki inn á við)",
        "Stöðugur bolur — ekki snúningur",
      ],
      goal: "Styrkja quadriceps og glutes á hvorum fæti sérstaklega. Eykur single-leg control og dregur úr meiðslahættu (ACL / groin).",
    },
    EN: {
      execution: [
        "Place the rear foot on a bench",
        "Front foot takes most of the load — approx 70% of weight",
        "Lower until the rear knee approaches the floor",
        "Drive up through the front foot to return",
        "Keep torso upright — don't fall forward",
      ],
      focus: [
        "Deep, controlled descent",
        "Keep knee tracking over toes (not caving in)",
        "Stable torso — no rotation",
      ],
      goal: "Strengthen quadriceps and glutes on each leg individually. Improves single-leg control and reduces injury risk (ACL / groin).",
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
        "Byrjaðu með lóð á milli fóta",
        "Mjaðmabeygja (hinge) — sprengja upp með mjöðmum",
        "Dragðu lóð upp og \"catcðu\" yfir höfuð í einni hreyfingu",
        "Lendum stöðugt — öxl, lendar og hné í línu",
        "Skiptu um hendur eftir hverja endurtekningu",
      ],
      focus: [
        "Hraðinn kemur frá mjöðmum — ekki handleggnum",
        "Lóð fer \"létt\" upp — ekki toga hægt",
        "Stöðug landing yfir höfuð með beinum handlegg",
      ],
      goal: "Þjálfa full-body explosiveness, samhæfingu og kraftflutning — transfer yfir í sprint og stefnubreytingar.",
    },
    EN: {
      execution: [
        "Start with the dumbbell between your feet",
        "Hip hinge — explosively drive through hips",
        "Pull the dumbbell overhead and \"catch\" it in one movement",
        "Land stable — shoulder, hip and knee stacked",
        "Switch hands after each rep",
      ],
      focus: [
        "Power comes from the hips — not the arm",
        "The weight should feel \"light\" going up — don't pull slow",
        "Stable overhead catch with a straight arm",
      ],
      goal: "Train full-body explosiveness, coordination and force transfer — carries over to sprinting and change of direction.",
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
        "Sama uppsetning og Mid-Thigh Pull",
        "Dragðu stöngina upp með 100% krafti en haltu henni kyrri",
        "Engin hreyfing á stönginni — isometric toggle",
        "Haltu hámarks spennu í 3–5 sek",
        "Slaktu alveg á á milli setta",
      ],
      focus: [
        "100% effort í toginu — engin heldur aftur af sér",
        "Engin slökun meðan á holdinu stendur",
        "Öndun: dragðu að þér og haltu, eða blásðu út hægt",
      ],
      goal: "Auka maximal neural drive og force production án hreyfingartengdrar þreytu. Góð æfing fyrir sinar og meiðslavarnir — low fatigue, high neural output.",
    },
    EN: {
      execution: [
        "Same setup as Mid-Thigh Pull",
        "Pull the bar with 100% force but keep it completely still",
        "No movement on the bar — isometric contraction",
        "Maintain maximum tension for 3–5 seconds",
        "Fully relax between sets",
      ],
      focus: [
        "100% effort throughout — don't hold back",
        "No relaxation during the hold",
        "Breathing: inhale and brace, or exhale slowly",
      ],
      goal: "Maximise neural drive and force production without movement-related fatigue. Excellent for tendon health and injury prevention — low fatigue, high neural output.",
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
