/**
 * Isometric Training Protocols — Library
 *
 * Evidence-based isometric protocols for tendon adaptation, rehab, injury
 * prevention and performance enhancement. Sourced from:
 *   • Optimizing Isometric Training Parameters for Tendon Adaptation
 *   • Isometric Training for Tendon Injury Rehabilitation and Prevention
 *   • Isometric Training for Performance Enhancement and Longevity
 *   • The Role of Isometric Training in Tendon Adaptation and Health
 *
 * Key references: Kubo et al. 2001; Bojsen-Møller et al. 2005; Burgess et al. 2007;
 * Silbernagel & Crossley 2015; Marchetti et al. 2016; Oranchuk et al. 2019;
 * Lanza et al. 2019; Baar 2019; Tam & Baar 2025; Power et al. 2023.
 */

export type IsoCategory =
  | "rehab"
  | "performance"
  | "prevention"
  | "longevity"
  | "sport_specific";

export type IsoIntensity = "low" | "moderate" | "high" | "maximal";

export interface IsoExercise {
  /** Display name (EN) — trainer-facing */
  name: string;
  /** Optional short description of technique / setup */
  setup?: string;
  /** Number of sets */
  sets: number;
  /** Hold duration per rep, in seconds. A tuple means a range (e.g. [30,45]). */
  holdSeconds: number | [number, number];
  /** Reps per set (omit if sets × 1) */
  reps?: number;
  /** %MVC (maximal voluntary contraction) */
  mvcPercent?: number | [number, number];
  /** Rest between sets (seconds) */
  restSeconds?: number | [number, number];
  /** Joint angle note (e.g. "90° knee", "mid-range") */
  jointAngle?: string;
  /** Target tendon / region */
  target?: string;
}

export interface IsoPhase {
  /** Phase title (EN), e.g. "Phase 1: Pain modulation" */
  name: string;
  /** Typical timeline, e.g. "Weeks 1–2" */
  timeline?: string;
  /** Exercises performed in this phase */
  exercises: IsoExercise[];
  /** Sessions per week (or per day for acute rehab) */
  frequency: string;
  /** Progression criteria to next phase */
  progression?: string;
}

export interface IsoProtocol {
  id: string;
  /** Icelandic display title */
  titleIS: string;
  /** English display title */
  titleEN: string;
  category: IsoCategory;
  intensity: IsoIntensity;
  /** Short goal statement (IS) */
  goalIS: string;
  /** Short goal statement (EN) */
  goalEN: string;
  /** Who should use this (IS) */
  audienceIS: string;
  audienceEN: string;
  /** Clinical / physiological mechanism (IS, 1-2 sentences) */
  rationaleIS: string;
  rationaleEN: string;
  /** Phased protocols (rehab) use multiple phases; single-phase programs use one. */
  phases: IsoPhase[];
  /** Safety / contraindication notes */
  cautionsIS?: string;
  cautionsEN?: string;
  /** Short reference list */
  references: string[];
}

// ─── Protocol library ─────────────────────────────────────────────────────

export const ISO_PROTOCOLS: IsoProtocol[] = [
  // 1. Tendinopathy rehab (3-phase)
  {
    id: "tendinopathy_rehab_3phase",
    titleIS: "Endurhæfing við sintinflammation (3 fasar)",
    titleEN: "Tendinopathy Rehabilitation (3-Phase)",
    category: "rehab",
    intensity: "moderate",
    goalIS:
      "Stjórna verkjum, endurhlaða sinina smám saman og skila íþróttamanni aftur í keppnisástand.",
    goalEN:
      "Modulate pain, progressively reload the tendon and return the athlete to sport-ready capacity.",
    audienceIS:
      "Leikmenn með einkenni um patellar-, Achilles- eða proximal hamstring tendinopathíu.",
    audienceEN:
      "Athletes with patellar, Achilles or proximal hamstring tendinopathy symptoms.",
    rationaleIS:
      "Ísometrískar samdrættir veita stjórnlausri vélrænu álagi sem dregur úr sársauka (analgesic áhrif) og örvar collagen-nýmyndun án þess að lengja sinina.",
    rationaleEN:
      "Isometric contractions provide controlled mechanical loading that reduces pain (analgesic effect) and stimulates collagen synthesis without lengthening the tendon.",
    phases: [
      {
        name: "Phase 1 — Pain modulation",
        timeline: "Weeks 1–2",
        frequency: "3–5× per day",
        progression: "Advance when pain ≤ 3/10 during and 24h after loading.",
        exercises: [
          {
            name: "Isometric knee extension (patellar) / calf raise hold (Achilles) / long-lever bridge (hamstring)",
            setup:
              "Choose the variation matching the symptomatic tendon. Mid-range joint angle to limit peak tendon strain.",
            sets: 5,
            holdSeconds: [30, 45],
            reps: 1,
            mvcPercent: [50, 60],
            restSeconds: 120,
            jointAngle: "Mid-range",
            target: "Symptomatic tendon",
          },
        ],
      },
      {
        name: "Phase 2 — Load progression",
        timeline: "Weeks 3–6",
        frequency: "3–4× per week",
        progression:
          "Advance when the athlete tolerates 80% MVC holds without symptom flare.",
        exercises: [
          {
            name: "Single-leg isometric with added resistance",
            setup:
              "Progress to unilateral loading (single-leg press hold, single-leg calf raise hold, single-leg bridge hold) with external load.",
            sets: 5,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: [90, 120],
            jointAngle: "Functional mid-range",
          },
        ],
      },
      {
        name: "Phase 3 — Strength & return-to-sport",
        timeline: "Weeks 7+",
        frequency: "2–3× per week",
        progression:
          "Transition to full sport-specific training once bilateral deficit < 10% and pain-free max holds.",
        exercises: [
          {
            name: "Heavy isometric + eccentric/concentric integration",
            setup:
              "Combine near-maximal holds with a slow eccentric or concentric rep (e.g. Spanish squat hold → slow descent).",
            sets: 5,
            holdSeconds: [20, 30],
            reps: 1,
            mvcPercent: [80, 90],
            restSeconds: 120,
            jointAngle: "Sport-relevant angle",
          },
        ],
      },
    ],
    cautionsIS:
      "Ef verkur yfir 3/10 eða bólga versnar, minnkaðu %MVC eða lengd. Tendinopathy-rehab á að vera smám saman — ekki hoppa yfir fasa.",
    cautionsEN:
      "If pain exceeds 3/10 or swelling worsens, reduce %MVC or hold duration. Do not skip phases.",
    references: [
      "Silbernagel & Crossley (2015) — Achilles RTS program",
      "Baar (2019) — patellar tendinopathy nutrition & loading",
      "Cook et al. (2016) — tendinopathy pathology",
      "Power et al. (2023) — progressive isometric loading",
    ],
  },

  // 2. Explosive strength & power
  {
    id: "explosive_power",
    titleIS: "Sprengikraftur og neural drive",
    titleEN: "Explosive Strength & Power",
    category: "performance",
    intensity: "maximal",
    goalIS:
      "Auka rate of force development (RFD) og neuromuscular drive fyrir sprengikraftsíþróttir.",
    goalEN:
      "Increase rate of force development (RFD) and neural drive for explosive sports.",
    audienceIS: "Spretthlauparar, stökkvarar, liðsíþróttamenn í ballistic íþróttum.",
    audienceEN: "Sprinters, jumpers, athletes in ballistic team sports.",
    rationaleIS:
      "Stutt, hámarks ísometrísk átak virkja hátíðni motor units og auka taugatengsl án þess að skapa mikla lífræna þreytu.",
    rationaleEN:
      "Short maximal isometric efforts recruit high-threshold motor units and increase neural drive with minimal metabolic fatigue.",
    phases: [
      {
        name: "Main session",
        frequency: "3–4× per week",
        exercises: [
          {
            name: "Isometric Mid-Thigh Pull (IMTP)",
            setup:
              "Barbell fixed at mid-thigh height, athlete pulls maximally for 3–5s.",
            sets: 5,
            holdSeconds: [3, 5],
            reps: 1,
            mvcPercent: 100,
            restSeconds: 180,
            jointAngle: "120–140° knee",
            target: "Posterior chain / RFD",
          },
          {
            name: "Isometric Calf Raise Hold",
            sets: 4,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: 90,
            target: "Achilles / soleus",
          },
          {
            name: "Isometric Lunge Hold",
            setup: "Split stance, back knee 2cm above floor.",
            sets: 3,
            holdSeconds: 45,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 90,
            jointAngle: "90° front knee",
          },
        ],
      },
    ],
    references: [
      "Oranchuk et al. (2019) — isometric training adaptations",
      "Burgess et al. (2007) — plyometric vs isometric tendon effects",
      "Bojsen-Møller et al. (2005) — tendon stiffness & force",
    ],
  },

  // 3. Injury prevention & longevity
  {
    id: "injury_prevention_longevity",
    titleIS: "Meiðslaforvarnir og langlífi",
    titleEN: "Injury Prevention & Longevity",
    category: "longevity",
    intensity: "moderate",
    goalIS:
      "Viðhalda sinastyrk og liðstöðugleika með lágu rúmmáli — hentar eldri íþróttamönnum og í mótahlaupi.",
    goalEN:
      "Maintain tendon strength and joint stability with low volume — suitable for older athletes and in-season maintenance.",
    audienceIS:
      "Eldri íþróttamenn, leikmenn með mikið álag, íþróttamenn á miðju keppnistímabili.",
    audienceEN:
      "Masters athletes, high-volume athletes, in-season players.",
    rationaleIS:
      "Lágt rúmmál ísometrískrar þjálfunar dugar til að viðhalda collagen turnover og liðstöðugleika án þess að bæta þreytu ofan á keppnisálag.",
    rationaleEN:
      "Low-volume isometric work is sufficient to maintain collagen turnover and joint stability without adding fatigue to competition load.",
    phases: [
      {
        name: "Maintenance session",
        frequency: "2× per week",
        exercises: [
          {
            name: "Wall Sit Hold",
            sets: 3,
            holdSeconds: [30, 45],
            reps: 1,
            mvcPercent: [50, 60],
            restSeconds: 60,
            jointAngle: "90° knee",
            target: "Quadriceps / patellar tendon",
          },
          {
            name: "Isometric Shoulder Press Hold",
            setup: "Dumbbell or resistance band, pressed and held overhead.",
            sets: 3,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 60,
            target: "Rotator cuff / deltoid",
          },
          {
            name: "Isometric Hamstring Bridge Hold",
            setup: "Feet on bench, hips extended, hold top position.",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 60,
            target: "Hamstring / glute",
          },
        ],
      },
    ],
    references: [
      "Bojsen-Møller et al. (2005)",
      "Benjamin et al. (2008) — collagen integrity",
      "Franchi et al. (2007)",
    ],
  },

  // 4. Achilles tendinopathy
  {
    id: "achilles_tendinopathy",
    titleIS: "Achilles tendinopathía",
    titleEN: "Achilles Tendinopathy",
    category: "rehab",
    intensity: "moderate",
    goalIS:
      "Draga úr verkjum í Achilles-sin og endurvekja tolerance fyrir hlaupum og stökki.",
    goalEN:
      "Reduce Achilles tendon pain and restore tolerance to running and jumping.",
    audienceIS:
      "Leikmenn með midportion Achilles tendinopathíu (ekki insertional).",
    audienceEN:
      "Athletes with midportion Achilles tendinopathy (not insertional).",
    rationaleIS:
      "Silbernagel-prótokollinn sýnir að ísometrísk hleðsla fylgt eftir með eccentric-þjálfun skilar bestu klínísku niðurstöðunum.",
    rationaleEN:
      "The Silbernagel protocol demonstrates that isometric loading followed by eccentric work yields the best clinical outcomes.",
    phases: [
      {
        name: "Acute phase",
        timeline: "Days 1–14",
        frequency: "Daily (1–2× per day)",
        progression: "Advance when morning pain < 3/10.",
        exercises: [
          {
            name: "Double-leg isometric calf raise hold",
            setup: "Stand on step, heel level. Both feet.",
            sets: 5,
            holdSeconds: 45,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 120,
          },
        ],
      },
      {
        name: "Progression phase",
        timeline: "Weeks 3–6",
        frequency: "4× per week",
        exercises: [
          {
            name: "Single-leg isometric calf raise hold",
            setup: "On symptomatic side only, with body weight.",
            sets: 5,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: 120,
          },
        ],
      },
      {
        name: "Return to sport",
        timeline: "Weeks 7+",
        frequency: "3× per week",
        exercises: [
          {
            name: "Loaded single-leg calf raise hold",
            setup: "Hold dumbbell or weighted vest.",
            sets: 4,
            holdSeconds: [20, 30],
            reps: 1,
            mvcPercent: [80, 90],
            restSeconds: 120,
          },
        ],
      },
    ],
    references: [
      "Silbernagel & Crossley (2015)",
      "Rio et al. (2015) — isometric analgesia in patellar tendinopathy",
    ],
  },

  // 5. Patellar tendinopathy
  {
    id: "patellar_tendinopathy",
    titleIS: "Patellar tendinopathía (jumper's knee)",
    titleEN: "Patellar Tendinopathy (Jumper's Knee)",
    category: "rehab",
    intensity: "high",
    goalIS: "Draga úr patellar-verkjum og auka toleranse fyrir stökkálagi.",
    goalEN: "Reduce patellar tendon pain and restore jumping tolerance.",
    audienceIS: "Körfubolta-, blak- og fótboltaleikmenn með jumper's knee.",
    audienceEN: "Basketball, volleyball and football players with jumper's knee.",
    rationaleIS:
      "Heavy isometrics framkallað analgesic áhrif í 45+ mínútur eftir set (Rio o.fl.), og þola þjálfun á keppnisdag.",
    rationaleEN:
      "Heavy isometrics produce 45+ minutes of post-set analgesia (Rio et al.) and are tolerated on match day.",
    phases: [
      {
        name: "Loading phase",
        timeline: "Weeks 1–4",
        frequency: "5× per week (or daily if in-season)",
        exercises: [
          {
            name: "Isometric leg extension or Spanish squat hold",
            setup:
              "Leg extension machine at 60° knee, or Spanish squat with heavy band behind knees.",
            sets: 5,
            holdSeconds: 45,
            reps: 1,
            mvcPercent: [70, 85],
            restSeconds: 120,
            jointAngle: "60° knee flexion",
          },
        ],
      },
      {
        name: "Performance integration",
        timeline: "Weeks 5+",
        frequency: "3× per week",
        exercises: [
          {
            name: "Single-leg isometric squat hold",
            sets: 4,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [80, 90],
            restSeconds: 120,
            jointAngle: "60° knee",
          },
        ],
      },
    ],
    references: [
      "Rio et al. (2015)",
      "Baar (2019)",
      "Kubo et al. (2001)",
    ],
  },

  // 6. Proximal hamstring tendinopathy
  {
    id: "hamstring_tendinopathy",
    titleIS: "Proximal hamstring tendinopathía",
    titleEN: "Proximal Hamstring Tendinopathy",
    category: "rehab",
    intensity: "moderate",
    goalIS:
      "Endurhlaða proximal hamstring-sin án þess að ofálag sitjandi-stellingu.",
    goalEN:
      "Reload the proximal hamstring tendon without aggravating it in sitting positions.",
    audienceIS: "Hlauparar og fótboltamenn með djúpan gluteal sársauka.",
    audienceEN: "Runners and footballers with deep gluteal pain.",
    rationaleIS:
      "Long-lever bridge heldur sininni í lengdri stöðu meðan álag er sett á, sem er nauðsynlegt fyrir hamstring tendón.",
    rationaleEN:
      "Long-lever bridge holds the tendon in a lengthened position under load, which is necessary for hamstring tendon adaptation.",
    phases: [
      {
        name: "Phase 1 — Isometric",
        timeline: "Weeks 1–3",
        frequency: "Daily",
        exercises: [
          {
            name: "Long-lever bridge hold",
            setup:
              "Heels on bench, knees nearly straight. Lift hips, hold.",
            sets: 5,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [50, 70],
            restSeconds: 90,
          },
        ],
      },
      {
        name: "Phase 2 — Loaded holds",
        timeline: "Weeks 4–8",
        frequency: "4× per week",
        exercises: [
          {
            name: "Single-leg long-lever bridge hold",
            sets: 4,
            holdSeconds: [20, 30],
            reps: 1,
            mvcPercent: [70, 85],
            restSeconds: 120,
          },
        ],
      },
    ],
    cautionsIS:
      "Forðastu djúpa hip-flexion æfingar (svo sem deadlift frá gólfi) í fyrstu 4 vikum.",
    cautionsEN:
      "Avoid deep hip-flexion exercises (e.g. deadlift from floor) for the first 4 weeks.",
    references: [
      "Goom et al. (2016) — proximal hamstring tendinopathy",
      "Cook et al. (2016)",
    ],
  },

  // 7. Rotator cuff / shoulder
  {
    id: "rotator_cuff",
    titleIS: "Rotator cuff og axlir",
    titleEN: "Rotator Cuff & Shoulder",
    category: "prevention",
    intensity: "moderate",
    goalIS:
      "Auka stöðugleika á öxl og úthald rotator cuff, sérstaklega fyrir kastíþróttamenn og handboltamenn.",
    goalEN:
      "Improve shoulder stability and rotator cuff endurance, particularly for throwing and handball athletes.",
    audienceIS: "Handboltamenn, körfuboltamenn, kastíþróttamenn, boxarar.",
    audienceEN: "Handball, basketball, throwing athletes, boxers.",
    rationaleIS:
      "Ísometrísk external rotation þjálfun eykur tendon stiffness í rotator cuff og minnkar áhættu á subacromial impingement.",
    rationaleEN:
      "Isometric external rotation training increases rotator cuff tendon stiffness and reduces the risk of subacromial impingement.",
    phases: [
      {
        name: "Main session",
        frequency: "3× per week",
        exercises: [
          {
            name: "Isometric External Rotation Hold",
            setup:
              "Elbow at 90°, tucked to side. Press against wall or band.",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [60, 75],
            restSeconds: 60,
          },
          {
            name: "Isometric Y-raise Hold",
            setup: "Prone on bench, arms in Y position, hold at top.",
            sets: 3,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: [50, 60],
            restSeconds: 60,
          },
          {
            name: "Isometric Scapular Retraction Hold",
            setup:
              "Band-pull apart, hold end-range retraction.",
            sets: 3,
            holdSeconds: 25,
            reps: 1,
            mvcPercent: [50, 60],
            restSeconds: 45,
          },
        ],
      },
    ],
    references: [
      "Lanza et al. (2019)",
      "Oranchuk et al. (2019)",
    ],
  },

  // 8. Sprinter-specific
  {
    id: "sprinter_power",
    titleIS: "Sprinter sprengikraftur",
    titleEN: "Sprinter Power",
    category: "sport_specific",
    intensity: "maximal",
    goalIS:
      "Bæta force at joint-angles sem eru mikilvæg í acceleration og top-speed fasa sprints.",
    goalEN:
      "Improve force at the joint angles critical for acceleration and top-speed sprint phases.",
    audienceIS: "Spretthlauparar, knattspyrnumenn, körfuboltamenn með RTS-kröfur.",
    audienceEN: "Sprinters, footballers, basketball players with RTS demands.",
    rationaleIS:
      "Þjálfun á horni 120–140° hnjáliðar endurspeglar force-vectoring við acceleration og bætir functional carryover betur en full-range squat.",
    rationaleEN:
      "Training at 120–140° knee angle reflects the force vector during acceleration and improves functional carryover better than full-range squats.",
    phases: [
      {
        name: "Main session",
        frequency: "3× per week",
        exercises: [
          {
            name: "Isometric squat hold at 90° knee",
            sets: 4,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: [80, 90],
            restSeconds: 120,
            jointAngle: "90° knee",
          },
          {
            name: "Isometric Mid-Thigh Pull (acceleration angle)",
            sets: 5,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 180,
            jointAngle: "120–140° knee",
          },
          {
            name: "Isometric split-stance hold",
            setup: "Sport-specific split stance mimicking start position.",
            sets: 3,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: 90,
          },
        ],
      },
    ],
    references: [
      "Marchetti et al. (2016) — joint-angle specificity",
      "Lanza et al. (2019)",
    ],
  },

  // 9. Combat / grip
  {
    id: "combat_grip",
    titleIS: "Bardagaíþróttir og grip",
    titleEN: "Combat Sports & Grip",
    category: "sport_specific",
    intensity: "high",
    goalIS:
      "Auka grip-endurance og statískan styrk fyrir glímu, júdó og MMA.",
    goalEN:
      "Build grip endurance and static strength for wrestling, judo and MMA.",
    audienceIS: "Glímumenn, júdókar, MMA-ar, klifrarar.",
    audienceEN: "Wrestlers, judokas, MMA athletes, climbers.",
    rationaleIS:
      "Löng ísometrísk grip-hold líkja eftir kröfu á gripið í clinch og groundwork.",
    rationaleEN:
      "Long isometric grip holds replicate the demand on the grip during clinch and groundwork.",
    phases: [
      {
        name: "Main session",
        frequency: "3× per week",
        exercises: [
          {
            name: "Isometric grip hold (thick bar hang or towel hang)",
            sets: 3,
            holdSeconds: 40,
            reps: 1,
            mvcPercent: [70, 85],
            restSeconds: 120,
          },
          {
            name: "Isometric chin-up hold (chin over bar)",
            sets: 3,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 120,
          },
          {
            name: "Isometric lunge hold",
            setup: "Unilateral force application.",
            sets: 3,
            holdSeconds: 45,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 90,
          },
        ],
      },
    ],
    references: [
      "Oranchuk et al. (2019)",
    ],
  },

  // 10. In-season maintenance
  {
    id: "in_season_maintenance",
    titleIS: "Viðhald á keppnistímabili",
    titleEN: "In-Season Maintenance",
    category: "longevity",
    intensity: "moderate",
    goalIS:
      "Viðhalda tendon-stiffness og neuromuscular drive án þess að auka þreytu á keppnisdögum.",
    goalEN:
      "Maintain tendon stiffness and neural drive without adding fatigue on match days.",
    audienceIS:
      "Leikmenn á fullum keppnistímabili sem hafa litlan tíma í lyftingasalnum.",
    audienceEN:
      "In-season players with limited time in the weight room.",
    rationaleIS:
      "Stuttar ísometrískar lotur (15–20 mín) viðhalda aðlögun án þess að krefjast langra recovery-tíma eins og hefðbundin þyngd.",
    rationaleEN:
      "Short isometric sessions (15–20 min) maintain adaptations without the recovery demands of heavy traditional lifting.",
    phases: [
      {
        name: "Short maintenance block",
        frequency: "1–2× per week (MD+2 / MD-3)",
        exercises: [
          {
            name: "Wall Sit",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [50, 60],
            restSeconds: 60,
          },
          {
            name: "Isometric Hamstring Bridge Hold",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 60,
          },
          {
            name: "Isometric Shoulder Press Hold",
            sets: 3,
            holdSeconds: 20,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 60,
          },
        ],
      },
    ],
    references: [
      "Baar (2019)",
      "Oranchuk et al. (2019)",
    ],
  },

  // 11. Achilles — primer / potentiation
  {
    id: "primer_potentiation",
    titleIS: "Primer / potentiation fyrir leik",
    titleEN: "Pre-Match Primer / Potentiation",
    category: "performance",
    intensity: "maximal",
    goalIS:
      "Virkja CNS og auka RFD rétt fyrir leik eða keppni án þess að þreytta leikmanninn.",
    goalEN:
      "Prime the CNS and increase RFD immediately before match play without inducing fatigue.",
    audienceIS:
      "Liðsíþróttamenn á MD (match day) — 15–30 mín fyrir hitaupphitun eða innan warm-up.",
    audienceEN:
      "Team-sport athletes on match day — 15–30 minutes before warm-up or within the warm-up.",
    rationaleIS:
      "Stutt hámarks-isometrics framkalla post-activation performance enhancement (PAPE) í 5–20 mín og skila hærri RFD í fyrstu mínútum leiks.",
    rationaleEN:
      "Brief maximal isometrics produce post-activation performance enhancement (PAPE) for 5–20 min, delivering higher RFD in the opening minutes of a match.",
    phases: [
      {
        name: "Primer block",
        frequency: "Match day (single exposure)",
        exercises: [
          {
            name: "Isometric Mid-Thigh Pull",
            setup: "3–5s maximal pulls at mid-thigh height.",
            sets: 3,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 60,
          },
          {
            name: "Isometric calf raise hold",
            sets: 2,
            holdSeconds: 10,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 60,
          },
        ],
      },
    ],
    cautionsIS:
      "Ekki nota ef leikmaður er RED eða með symptom flare. Í MicroPulse er þetta bundið við GREEN / GREEN+.",
    cautionsEN:
      "Do not use if player is RED or flared. In MicroPulse this is gated to GREEN / GREEN+ only.",
    references: [
      "Tillin & Bishop (2009) — PAPE",
      "Oranchuk et al. (2019)",
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getProtocolById(id: string): IsoProtocol | undefined {
  return ISO_PROTOCOLS.find((p) => p.id === id);
}

export function protocolsByCategory(category: IsoCategory): IsoProtocol[] {
  return ISO_PROTOCOLS.filter((p) => p.category === category);
}

export const ISO_CATEGORY_LABELS: Record<
  IsoCategory,
  { IS: string; EN: string }
> = {
  rehab: { IS: "Endurhæfing", EN: "Rehabilitation" },
  performance: { IS: "Frammistöðuaukning", EN: "Performance" },
  prevention: { IS: "Forvarnir", EN: "Prevention" },
  longevity: { IS: "Langlífi og viðhald", EN: "Longevity & Maintenance" },
  sport_specific: { IS: "Íþróttasértækt", EN: "Sport-specific" },
};

export const ISO_INTENSITY_LABELS: Record<
  IsoIntensity,
  { IS: string; EN: string; color: string }
> = {
  low: { IS: "Lágt", EN: "Low", color: "bg-green-100 text-green-700" },
  moderate: {
    IS: "Miðlungs",
    EN: "Moderate",
    color: "bg-blue-100 text-blue-700",
  },
  high: { IS: "Hátt", EN: "High", color: "bg-amber-100 text-amber-700" },
  maximal: { IS: "Hámarks", EN: "Maximal", color: "bg-red-100 text-red-700" },
};

/** Format a hold duration or MVC range/single value */
export function formatRange(
  value: number | [number, number] | undefined,
  suffix = ""
): string {
  if (value === undefined) return "—";
  if (Array.isArray(value)) return `${value[0]}–${value[1]}${suffix}`;
  return `${value}${suffix}`;
}
