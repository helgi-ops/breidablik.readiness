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

/** Contraction type (Lum, Oranchuk, Chen, Kong 2026 — PIMA vs HIMA):
 *   - "push"  (PIMA / overcoming): press against an immovable resistance —
 *     better for maximal STRENGTH and RFD.
 *   - "hold"  (HIMA / yielding): resist a load to keep a position — superior for
 *     MORPHOLOGICAL adaptation (muscle thickness) and pain-modulated tissue work.
 *   - "mixed": the protocol uses both across its phases.
 *  Omitted on the dynamic (non-isometric) methods that also live in this library. */
export type IsoMode = "push" | "hold" | "mixed";

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
  /** Push (PIMA / strength-biased) vs hold (HIMA / tissue-biased) vs mixed.
   *  Absent on the dynamic methods in this library (they are not a push/hold choice). */
  isoMode?: IsoMode;
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
    isoMode: "hold",
    goalIS:
      "Stjórna verkjum, endurhlaða sinina smám saman og skila íþróttamanni aftur í keppnisástand.",
    goalEN:
      "Modulate pain, progressively reload the tendon and return the athlete to sport-ready capacity.",
    audienceIS:
      "Leikmenn með einkenni um patellar-, Achilles- eða proximal hamstring tendinopathíu.",
    audienceEN:
      "Athletes with patellar, Achilles or proximal hamstring tendinopathy symptoms.",
    rationaleIS:
      "Ísómetrískar samdrættir veita stýrðu vélrænu álagi með lágri ertingu og örva collagen-nýmyndun án þess að lengja sinina. (Sú hugmynd að ein lota gefi tafarlausa verkjastillingu — Rio 2015 — hefur ekki staðist endurtekningar; notaðu vegna álagsþols og aðlögunar, ekki loforðs um verkjastillingu.)",
    rationaleEN:
      "Isometric contractions provide controlled mechanical loading at low irritability and stimulate collagen synthesis without lengthening the tendon. (The idea that a bout gives immediate analgesia — Rio 2015 — has not consistently replicated; use for load tolerance and adaptation, not a promise of instant pain relief.)",
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
      "Oranchuk, Storey, Nelson, Cronin (2019) — Isometric training systematic review (Scand J Med Sci Sports): ≥70% MVC required for tendon adaptation; long muscle length transfers better to dynamic performance.",
    ],
  },

  // 2. Explosive strength & power
  {
    id: "explosive_power",
    titleIS: "Sprengikraftur og neural drive",
    titleEN: "Explosive Strength & Power",
    category: "performance",
    intensity: "maximal",
    isoMode: "push",
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
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Ballistic intent (push as hard as possible) drives 1.04-10.5%/week NM activation gains and 1.2-13.4%/week RFD gains, vs only 1.64-5.53%/week and 1.01-8.13%/week with non-ballistic intent.",
      "Burgess, Connick, Graham-Smith, Pearson (2007) — plyometric vs isometric tendon effects.",
      "Bojsen-Møller et al. (2005) — tendon stiffness & force.",
      "Lum & Barbosa (2019) — Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. Int J Sports Physiol Perform.",
    ],
  },

  // 3. Injury prevention & longevity
  {
    id: "injury_prevention_longevity",
    titleIS: "Meiðslaforvarnir og langlífi",
    titleEN: "Injury Prevention & Longevity",
    category: "longevity",
    intensity: "moderate",
    isoMode: "hold",
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
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Even low-volume isometrics (2-3 sets, 2x/wk) maintain tendon stiffness and CSA when ≥70% MVC is used; ideal for in-season / masters athletes who cannot tolerate high concentric volume.",
      "Lum & Barbosa (2019). Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. Int J Sports Physiol Perform 14(2):137-147. → 6-12 wk of joint-specific isometrics retains dynamic strength carryover when matched to functional joint angles (90° knee for squat, mid-thigh for pull).",
      "Bojsen-Møller, Magnusson, Rasmussen, Kjaer, Aagaard (2005). Muscle performance during maximal isometric and dynamic contractions is influenced by the stiffness of the tendinous structures. J Appl Physiol 99(3):986-994. → Tendon stiffness directly mediates RFD; isometric loading is one of the few stimuli that maintains stiffness without high mechanical cost.",
    ],
  },

  // 4. Achilles tendinopathy
  {
    id: "achilles_tendinopathy",
    titleIS: "Achilles tendinopathía",
    titleEN: "Achilles Tendinopathy",
    category: "rehab",
    intensity: "moderate",
    isoMode: "hold",
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
      "Silbernagel & Crossley (2015). A Proposed Return-to-Sport Program for Patients With Midportion Achilles Tendinopathy: Rationale and Implementation. JOSPT 45(11):876-886. → 4-phase model: phase 1 isometrics + pain-monitoring (≤5/10 morning pain), then progressive eccentric loading; ≥5/5 single-leg heel raises required before return-to-run.",
      "Rio, Kidgell, Purdam, Gaida, Moseley, Pearce, Cook (2015). Isometric exercise induces analgesia and reduces inhibition in patellar tendinopathy. Br J Sports Med 49(19):1277-1283. → 5×45s holds at 70% MVC; the loading model transfers to the Achilles. NB: the immediate post-set analgesia has NOT consistently replicated in later studies — value is load tolerance + adaptation at low irritability, not guaranteed analgesia.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → ≥70% MVC required for tendon adaptation; long muscle length (dorsiflexed ankle) yields better hypertrophy than short.",
    ],
  },

  // 5. Patellar tendinopathy
  {
    id: "patellar_tendinopathy",
    titleIS: "Patellar tendinopathía (jumper's knee)",
    titleEN: "Patellar Tendinopathy (Jumper's Knee)",
    category: "rehab",
    intensity: "high",
    isoMode: "hold",
    goalIS: "Draga úr patellar-verkjum og auka toleranse fyrir stökkálagi.",
    goalEN: "Reduce patellar tendon pain and restore jumping tolerance.",
    audienceIS: "Körfubolta-, blak- og fótboltaleikmenn með jumper's knee.",
    audienceEN: "Basketball, volleyball and football players with jumper's knee.",
    rationaleIS:
      "Þungar ísómetríur þolast vel á keppnisdag vegna lágrar ertingar og lítillar þreytu. (Tafarlaus verkjastilling eftir set — Rio 2015 — hefur ekki staðist endurtekningar áreiðanlega; treystu á álagsþol, ekki verkjastillingu.)",
    rationaleEN:
      "Heavy isometrics are tolerated on match day thanks to low irritability and low fatigue. (Immediate post-set analgesia — Rio 2015 — has not reliably replicated; rely on load tolerance, not pain relief.)",
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
      "Rio, Kidgell, Purdam, Gaida, Moseley, Pearce, Cook (2015). Isometric exercise induces analgesia and reduces inhibition in patellar tendinopathy. Br J Sports Med 49(19):1277-1283. → 5×45s @ 70% MVC at 60° knee, tolerated on match day. NB: the immediate-analgesia finding has NOT consistently replicated in later studies — treat the value as load tolerance + adaptation, not guaranteed pain relief.",
      "Baar (2019). Stress Relaxation and Targeted Nutrition to Treat Patellar Tendinopathy. Int J Sport Nutr Exerc Metab 29(4):453-457. → 10 min of mechanical loading every 6 hr maximizes collagen synthesis; isometric holds 30-45 s at heavy load are the practical delivery vehicle.",
      "Kubo, Kanehisa, Fukunaga (2001). Effects of different duration isometric contractions on tendon elasticity in human quadriceps muscles. J Physiol 536(2):649-655. → Long-duration isometrics (20s @ 70%) increase tendon stiffness by ~58% over 12 wk vs short-duration; mechanism for jumper's knee progressive loading.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → 60° knee = optimal compromise between long-length quad hypertrophy and tolerable knee shear for tendinopathy.",
    ],
  },

  // 6. Proximal hamstring tendinopathy
  {
    id: "hamstring_tendinopathy",
    titleIS: "Proximal hamstring tendinopathía",
    titleEN: "Proximal Hamstring Tendinopathy",
    category: "rehab",
    intensity: "moderate",
    isoMode: "hold",
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
      "Goom, Malliaras, Reiman, Purdam (2016). Proximal Hamstring Tendinopathy: Clinical Aspects of Assessment and Management. JOSPT 46(6):483-493. → 4-stage rehab: (1) isometric long-lever bridge holds, (2) isotonic mid-range, (3) energy storage, (4) sport-specific loading. Avoid hip flexion >70° early.",
      "Cook & Purdam (2009/2014 update). Is compressive load a factor in the development of tendinopathy? Br J Sports Med 46:163-168. → Hamstring tendon is compressed against ischial tuberosity in deep hip flexion → explains why deadlifts from floor flare proximal hamstring tendinopathy in early phase.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Long-lever bridge holds the hamstring at lengthened position — Oranchuk's data: long-length isometrics drive 0.86-1.69%/wk hypertrophy vs 0.08-0.83%/wk at short length.",
    ],
  },

  // 6b. Groin / adductor rehab (Copenhagen-based)
  {
    id: "groin_adductor",
    titleIS: "Nára / aðfæru endurhæfing",
    titleEN: "Groin / Adductor Rehabilitation",
    category: "rehab",
    intensity: "moderate",
    isoMode: "hold",
    goalIS:
      "Endurhlaða aðfæruvöðva og nára-sinar smám saman og draga úr endurmeiðsla-hættu við stefnubreytingar og spretti.",
    goalEN:
      "Progressively reload the adductors and groin tendons and reduce re-injury risk in change-of-direction and sprinting.",
    audienceIS:
      "Fótboltamenn með nára-/aðfæruverki (adductor-tengda) eða beinbjúg í lífbeini.",
    audienceEN:
      "Footballers with groin / adductor-related pain or pubic bone stress.",
    rationaleIS:
      "Copenhagen aðfærsla hleður aðfæruvöðva í lengdri stöðu; aðfærslu-styrkur er sterkasti breytanlegi áhættuþátturinn fyrir nára-meiðsli. Byrjað er á verkjastýrðri ísómetrík áður en farið er í eccentrísk álag.",
    rationaleEN:
      "Copenhagen adduction loads the adductors at length; adductor strength is the strongest modifiable risk factor for groin injury. Start with pain-monitored isometrics before progressing to eccentric load.",
    phases: [
      {
        name: "Phase 1 — Isometric tolerance",
        timeline: "Weeks 1–2",
        frequency: "Daily (pain ≤ 3/10)",
        exercises: [
          {
            name: "Adductor squeeze isometric (ball between knees)",
            setup: "Supine, knees bent ~60°, ball between knees. Squeeze and hold.",
            sets: 5,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [50, 70],
            restSeconds: 60,
            target: "adductors",
          },
        ],
      },
      {
        name: "Phase 2 — Copenhagen progression",
        timeline: "Weeks 3–6",
        frequency: "3× per week",
        exercises: [
          {
            name: "Copenhagen adduction (short → long lever)",
            setup: "Side plank with top leg on bench; start knee-support, progress to foot-support.",
            sets: 3,
            holdSeconds: [15, 30],
            reps: 6,
            mvcPercent: [70, 85],
            restSeconds: 90,
            target: "adductor longus",
          },
        ],
      },
      {
        name: "Phase 3 — Return to sport",
        timeline: "Weeks 7+",
        frequency: "2–3× per week",
        exercises: [
          {
            name: "Full Copenhagen adduction + change-of-direction loading",
            sets: 3,
            holdSeconds: [20, 30],
            reps: 8,
            mvcPercent: [80, 90],
            restSeconds: 120,
            target: "adductors",
          },
        ],
        progression:
          "Progress on-pitch change-of-direction and sprint volume slowly (they are the key re-injury qualities); pain-free Copenhagen at full lever before full training.",
      },
    ],
    cautionsIS:
      "Haltu verkjum ≤ 3/10 á meðan og eftir. Auktu stefnubreytingar og spretti hægt — það eru lykil-endurmeiðsla-gæðin fyrir nára.",
    cautionsEN:
      "Keep pain ≤ 3/10 during and after. Ramp change-of-direction and sprint load slowly — they are the key groin re-injury qualities.",
    references: [
      "Harøy J, Clarsen B, Wiger EG, et al. (2019). The Adductor Strengthening Programme prevents groin problems among male football players: a cluster-randomised controlled trial. Br J Sports Med 53(3):150-157. → Copenhagen adduction cut groin problems by 41%.",
      "Ishøi L, Sørensen CN, Kaae NM, et al. (2016). Large eccentric strength increase using the Copenhagen Adduction exercise in football: a randomized controlled trial. Scand J Med Sci Sports 26(11):1334-1342. → +35.7% eccentric adduction strength over 8 weeks.",
      "Serner A, Weir A, Tol JL, et al. (2020). Return to sport after criteria-based rehabilitation of acute adductor injuries in male athletes. Orthop J Sports Med 8(1). → Criteria-based, isometric-first adductor loading progression.",
    ],
  },

  // 7. Rotator cuff / shoulder
  {
    id: "rotator_cuff",
    titleIS: "Rotator cuff og axlir",
    titleEN: "Rotator Cuff & Shoulder",
    category: "prevention",
    intensity: "moderate",
    isoMode: "hold",
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
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Joint-angle specificity is real (3-5x stronger transfer at trained angle); train external rotation at 90° elbow, the position used in throwing/hitting acceleration.",
      "Lum & Barbosa (2019). Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. Int J Sports Physiol Perform 14(2):137-147. → Joint-specific isometrics improve cuff endurance with low joint stress; ideal between throwing sessions when full-ROM resistance work risks overuse.",
      "Lanza, Castelli, Magalhães, Vitor-Costa, Bertuzzi, Yanagimachi, Cyrino (2019). Isometric strength training increases neuromuscular performance via different neural and morphological adaptations. Eur J Appl Physiol. → 6 wk isometric ER training increased throwing-arm cocking angle force without cuff tendinopathy markers.",
    ],
  },

  // 8. Sprinter-specific
  {
    id: "sprinter_power",
    titleIS: "Sprinter sprengikraftur",
    titleEN: "Sprinter Power",
    category: "sport_specific",
    intensity: "maximal",
    isoMode: "push",
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
      "Lum, Barbosa, Joseph, Balasekaran (2021). Effects of Two Isometric Strength Training Methods on Jump and Sprint Performances: A Randomized Controlled Trial. J Strength Cond Res. → IMTP-style maximal isometrics (5×5s @ 100% MVC at 120-140° knee) improved 20m sprint by 1.7% and CMJ by 4.2% in 8 wk in trained athletes — directly justifies our acceleration-angle protocol.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Joint-angle specificity is the strongest finding in the review; training at the acceleration angle (120-140°) transfers ~3x more to acceleration than full-range squat.",
      "Hicks, Schuster, Samozino, Morin (2020). Improving Mechanical Effectiveness During Sprint Acceleration: Practical Recommendations and Guidelines. NSCA SCJ 42(2):45-62. → Forward-lean acceleration angle = high horizontal force production; this is exactly the joint angle our IMTP/split-stance holds reinforce.",
      "Marchetti et al. (2016) — joint-angle specificity in isometric training.",
    ],
  },

  // 9. Combat / grip
  {
    id: "combat_grip",
    titleIS: "Bardagaíþróttir og grip",
    titleEN: "Combat Sports & Grip",
    category: "sport_specific",
    intensity: "high",
    isoMode: "hold",
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
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Long-duration sub-max isometrics (30-45s @ 60-80%) drive endurance hypertrophy + tendon CSA — exact stimulus needed for grip endurance in clinch/groundwork.",
      "Schoenfeld, Grgic, Van Every, Plotkin (2021) — long muscle length hypertrophy. → Towel/thick-bar grip holds sit at the lengthened end of the finger flexor range; aligns with Oranchuk's long-length advantage.",
      "Lum & Barbosa (2019). Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. → Isometric chin-over-bar holds = high motor unit recruitment without eccentric load; safe to repeat 3-4x/wk between sparring.",
    ],
  },

  // 10. In-season maintenance
  {
    id: "in_season_maintenance",
    titleIS: "Viðhald á keppnistímabili",
    titleEN: "In-Season Maintenance",
    category: "longevity",
    intensity: "moderate",
    isoMode: "hold",
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
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → 1-2x/wk low-volume isometrics (3 sets, 20-30s) maintain strength + tendon CSA across an 8-12 wk in-season block without adding eccentric-induced soreness.",
      "Baar (2019). Stress Relaxation and Targeted Nutrition to Treat Patellar Tendinopathy. Int J Sport Nutr Exerc Metab 29(4):453-457. → 10 min loading every 6 hr maximizes collagen synthesis; in-season players hit this with 2x weekly 15-20 min ISO blocks.",
      "Lum & Barbosa (2019). Brief Review: Effects of Isometric Strength Training on Strength and Dynamic Performance. → Isometric maintenance preserves dynamic strength gains (CMJ, sprint) for 4-6 wk into a competition phase even when concentric volume is dropped 60%.",
      "Lum, Joseph, Ong, Tang, Suchomel (2023). Comparing the Effects of Long-Term vs. Periodic Inclusion of Isometric Strength Training on Strength and Dynamic Performances. J Strength Cond Res 37(2):305-314. → 24 weeks of CONTINUOUS isometric inclusion beat periodic or no inclusion for sprint/jump/strength — keep it in the programme, don't dip in and out.",
      "Lum, Howatson (2025). Comparing the Acute Effects of a Session of Isometric Strength Training with Heavy Resistance Training on Neuromuscular Function. J Sci Sport Exerc 7:40-49. DOI 10.1007/s42978-023-00241-0. → In 10 resistance-trained athletes, ISO carried less neuromuscular cost than heavy resistance work (smaller sprint + IMTP drop at 5 min and 24 h) and higher 24 h perceived recovery — ideal for in-season weeks.",
    ],
  },

  // 11. Achilles — primer / potentiation
  {
    id: "primer_potentiation",
    titleIS: "Primer / potentiation fyrir leik",
    titleEN: "Pre-Match Primer / Potentiation",
    category: "performance",
    intensity: "maximal",
    isoMode: "push",
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
      "Tillin & Bishop (2009). Factors Modulating Post-Activation Potentiation and its Effect on Performance of Subsequent Explosive Activities. Sports Med 39(2):147-166. → 3-5s maximal isometric contractions produce PAPE (post-activation performance enhancement) lasting 5-20 min; effect strongest in trained athletes.",
      "Blazevich & Babault (2019). Post-activation Potentiation Versus Post-activation Performance Enhancement in Humans: Historical Perspective, Underlying Mechanisms, and Current Issues. Front Physiol 10:1359. → Distinguishes acute neural PAP (seconds) from PAPE (5-20 min, useful window for warm-up). Maximal IMTP is one of the highest-yield, lowest-fatigue PAPE stimuli.",
      "Hernández-Davó, Sabido, Behm, Blazevich (2021). Acute Effects of Isometric Conditioning Activity with Different Set Volumes on Countermovement Jump Performance in Highly Trained Male Volleyball Players. → 3 sets of brief maximal IMTP @ 100% MVC improved CMJ height 2-4% in well-trained athletes 6-8 min post; volume above this added fatigue without further benefit.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Ballistic intent ('push as hard as possible') is the key driver of acute neural priming — same mechanism that powers PAPE.",
      "Lum, Ong, Haischer (2024). Postactivation Performance Enhancement With Maximal Isometric Contraction on Power-Clean Performance Across Multiple Sets. Int J Sports Physiol Perform 19:265-270. DOI 10.1123/ijspp.2023-0383. → Low-volume maximal isometrics potentiate explosive output ~1 min later without extra perceived exertion — direct support for an IMTP primer.",
      "Lum, Howatson (2025). Comparing the Acute Effects of a Session of Isometric Strength Training with Heavy Resistance Training on Neuromuscular Function. J Sci Sport Exerc 7:40-49. DOI 10.1007/s42978-023-00241-0. → Isometrics recovered to baseline faster than heavy resistance work (higher 24 h perceived recovery in resistance-trained athletes) — why the primer is a low-fatigue match-day option.",
    ],
  },

  // 12. Long muscle-length hypertrophy (Oranchuk 2019 — direct application)
  {
    id: "long_length_hypertrophy",
    titleIS: "Vöðvavöxtur í lengdri stöðu (long muscle length)",
    titleEN: "Long Muscle-Length Hypertrophy",
    category: "performance",
    intensity: "high",
    isoMode: "hold",
    goalIS:
      "Hámarka vöðvavöxt og dynamic strength carryover með ísometrískum holds í lengdri vöðvastöðu — 10x meiri hypertrophy/viku en short-length holds.",
    goalEN:
      "Maximize hypertrophy and dynamic strength carryover by holding isometrics at long muscle length — Oranchuk 2019: 0.86–1.69%/week hypertrophy at long length vs only 0.08–0.83%/week at short length.",
    audienceIS:
      "Íþróttamenn í offseason eða preseason hypertrophy block; fótboltamenn í endurhæfingu sem þurfa að bæta CSA á quad/hamstring; íþróttamenn með lélega þol fyrir hárri concentric álag (post-injury, masters).",
    audienceEN:
      "Athletes in off-season or pre-season hypertrophy block; football players in late-stage rehab needing quad/hamstring CSA gains; athletes with poor tolerance for high concentric volume (post-injury, masters).",
    rationaleIS:
      "Oranchuk et al. (2019) systematic review: ísometrík þjálfun við long muscle length skilar 1.7–10x meiri hypertrophy en short-length, og skilar betri carryover í dynamic verkefni (CMJ, sprint, squat 1RM). Mekanismi: hærri passive tension + meiri tími undir álagi við lengri sarcomere length.",
    rationaleEN:
      "Oranchuk 2019 systematic review: isometric training at long muscle length produces 1.7–10x greater hypertrophy than short-length, and yields better carryover to dynamic tasks (CMJ, sprint, squat 1RM). Mechanism: higher passive tension + greater time under load at extended sarcomere length.",
    phases: [
      {
        name: "Block 1 — Tolerance",
        timeline: "Weeks 1–3",
        frequency: "2× per week",
        progression:
          "Advance to Block 2 when 4×30s @ 70% feels manageable with full ROM.",
        exercises: [
          {
            name: "Long-length split squat ISO hold",
            setup:
              "Bottom of split squat — back knee just off floor, front knee 90°+. Hold rear leg in stretched hip flexor position.",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 90,
            jointAngle: "Long-length quad/hip flexor",
            target: "Quadriceps + hip flexor",
          },
          {
            name: "Stiff-leg RDL ISO hold (long-length hamstring)",
            setup:
              "Hold barbell at mid-shin, hips hinged back, knees soft, hamstring fully lengthened.",
            sets: 3,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 90,
            jointAngle: "Long-length hamstring",
            target: "Hamstring + glute",
          },
          {
            name: "Deficit push-up ISO bottom hold",
            setup:
              "Hands on parallettes or stacked plates, lower until chest passes hand level, hold.",
            sets: 3,
            holdSeconds: [20, 30],
            reps: 1,
            mvcPercent: [60, 70],
            restSeconds: 60,
            jointAngle: "Long-length pec",
            target: "Pec / anterior deltoid",
          },
        ],
      },
      {
        name: "Block 2 — Loaded long-length",
        timeline: "Weeks 4–8",
        frequency: "2× per week",
        progression:
          "Advance load 5–10% when 4×30s feels controlled and joint comfortable.",
        exercises: [
          {
            name: "Heel-elevated ISO squat hold (deep)",
            setup:
              "Plates under heels, sit into deepest tolerable squat. Hold.",
            sets: 4,
            holdSeconds: 30,
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: 120,
            jointAngle: "Deep squat (long-length quad)",
            target: "Quadriceps",
          },
          {
            name: "Single-leg long-lever bridge ISO",
            setup:
              "Heel on bench, knee nearly straight, hips elevated. Single leg.",
            sets: 4,
            holdSeconds: [20, 30],
            reps: 1,
            mvcPercent: [70, 80],
            restSeconds: 120,
            jointAngle: "Long-length hamstring",
            target: "Hamstring",
          },
          {
            name: "Deep dip ISO bottom hold",
            setup: "Parallel bar dip, lower to deepest tolerable position, hold.",
            sets: 3,
            holdSeconds: [15, 25],
            reps: 1,
            mvcPercent: [70, 85],
            restSeconds: 90,
            jointAngle: "Long-length pec/anterior shoulder",
            target: "Pec / triceps",
          },
        ],
      },
    ],
    cautionsIS:
      "Long-length holds eru mikið passive tension — ekki nota á tendinopathy-svæði í acute phase (sjá tendinopathy_rehab_3phase í staðinn). Forðastu deficit/deep stöður ef joint pain > 3/10.",
    cautionsEN:
      "Long-length holds carry high passive tension — do not use over an acute tendinopathy site (use tendinopathy_rehab_3phase instead). Avoid deficit/deep positions if joint pain > 3/10.",
    references: [
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Long muscle length: 0.86–1.69%/wk hypertrophy vs 0.08–0.83%/wk at short length (1.7–10x advantage). Long-length holds also transfer better to dynamic 1RM and sprint than short-length.",
      "Schoenfeld, Grgic, Van Every, Plotkin (2021). Loading Recommendations for Muscle Strength, Hypertrophy, and Local Endurance: A Re-Examination of the Repetition Continuum. Sports 9(2):32. → Lengthened-position training (e.g. deep squat, deficit work) produces preferential distal hypertrophy vs short-length variants.",
      "Maeo, Shan, Otsuka, Kanehisa, Kawakami (2018). Single-joint Eccentric Knee Extensor Training Preferentially Trains the Lengthened Position. → Long muscle length training is mechanistically distinct from short-length and yields region-specific hypertrophy not achievable with mid-range work alone.",
      "Lum, Soh, Teo, Wong, Lee (2022). Effects of Performing Isometric Bench Press Training at Single Versus Multiple Joint Positions on Strength and Power Performance. Int J Sports Physiol Perform. DOI 10.1123/ijspp.2021-0461. → Multiple joint positions + long muscle length built more max strength and peak power than a single angle — train the quality across several angles.",
      "Lum, Oranchuk, Chen, Kong (2026). Comparing the Effects of Push and Hold Isometric Training on Strength and Musculotendinous Adaptations. J Strength Cond Res 40(9):1050-1058. → Holding/yielding (HIMA) was superior for morphological adaptation (muscle thickness, esp. rectus femoris) — the reason this hypertrophy block is built on long-length holds, not pushes.",
    ],
  },

  // 13. Ballistic-intent RFD development (Oranchuk 2019 — direct application)
  {
    id: "ballistic_intent_rfd",
    titleIS: "Ballistic-intent ísometrík (RFD development)",
    titleEN: "Ballistic-Intent Isometric (RFD Development)",
    category: "performance",
    intensity: "maximal",
    isoMode: "push",
    goalIS:
      "Hámarka rate of force development (RFD) og neuromuscular drive með ballistic intent — Oranchuk 2019: 1.2–13.4%/viku RFD aukning með 'push as hard as possible' vs 1.01–8.13%/viku án ballistic intent.",
    goalEN:
      "Maximize rate of force development (RFD) and neural drive via ballistic intent — Oranchuk 2019: 1.2–13.4%/week RFD gains with 'push as hard as possible' intent vs 1.01–8.13%/week without ballistic intent.",
    audienceIS:
      "Sprengikraftaríþróttamenn (sprinterar, jumpers, körfuboltamenn, fótboltamenn) sem vilja bæta first-100ms force production. Hentar líka leikmönnum sem geta ekki gert hámarks plyometrics vegna joint stress.",
    audienceEN:
      "Power athletes (sprinters, jumpers, basketball, football) wanting to improve first-100ms force production. Also suits athletes who cannot tolerate maximal plyometrics due to joint stress.",
    rationaleIS:
      "Lykilatriði Oranchuk 2019: það er INTENT (push hard, instantly), ekki tímalengd holdsins, sem drífur RFD adaptation. Stutt (1–3s) ballistic ISO contractions með full intent = hærri MU recruitment + neural drive en lengri sustained holds. Í praktíkinni: 'press the floor as hard as you possibly can for 3 seconds'.",
    rationaleEN:
      "Key Oranchuk 2019 finding: INTENT (push hard, instantly), not duration, drives RFD adaptation. Brief (1–3s) ballistic ISO contractions with full intent = higher MU recruitment + neural drive than longer sustained holds. Practical cue: 'press the floor as hard as you possibly can for 3 seconds'.",
    phases: [
      {
        name: "Block 1 — Build the intent",
        timeline: "Weeks 1–2",
        frequency: "2× per week",
        progression:
          "Advance when athlete demonstrates immediate force ramp on EMG/force plate (or visibly explosive intent).",
        exercises: [
          {
            name: "Ballistic Isometric Mid-Thigh Pull",
            setup:
              "Bar at mid-thigh height (immovable). On 'go' — pull as fast and hard as possible for 3 s.",
            sets: 4,
            holdSeconds: 3,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 120,
            jointAngle: "Mid-thigh (140° knee, 145° hip)",
            target: "Triple extension chain",
          },
          {
            name: "Ballistic Isometric Leg Press",
            setup:
              "Legs at 90° knee, push platform as hard and fast as possible for 3 s.",
            sets: 4,
            holdSeconds: 3,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 120,
            jointAngle: "90° knee",
            target: "Quad / glute",
          },
        ],
      },
      {
        name: "Block 2 — Accumulate ballistic volume",
        timeline: "Weeks 3–6",
        frequency: "2–3× per week",
        progression:
          "Hold session quality high — terminate early if any rep loses ballistic character.",
        exercises: [
          {
            name: "Ballistic Isometric Mid-Thigh Pull",
            setup: "3-s maximal pulls, full ballistic intent.",
            sets: 6,
            holdSeconds: 3,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 120,
            jointAngle: "Mid-thigh",
          },
          {
            name: "Ballistic Isometric Bench Press (against pins)",
            setup:
              "Barbell against pins ~5 cm off chest. Press as fast/hard as possible for 3 s.",
            sets: 4,
            holdSeconds: 3,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 120,
            target: "Pec / triceps",
          },
          {
            name: "Ballistic ISO calf raise (top-position)",
            setup:
              "Standing on plate, full plantarflexion against fixed bar. 3-s ballistic press.",
            sets: 4,
            holdSeconds: 3,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 90,
            target: "Triceps surae / Achilles",
          },
        ],
      },
    ],
    cautionsIS:
      "Mikill CNS-kostnaður — ekki tvær slíkar lotur í röð án ≥48 klst hvíldar. Hættu lotunni þegar RFD-quality dettur (athlete can't generate explosive intent any more). Ekki nota ef RED.",
    cautionsEN:
      "High CNS cost — do not run two ballistic sessions back-to-back without ≥48h recovery. Stop the session when RFD-quality drops (athlete can no longer generate explosive intent). Do not use if RED.",
    references: [
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations: Effects of muscle length, intensity, and intent. Scand J Med Sci Sports 29(4):484-503. → Ballistic intent: 1.04–10.5%/wk neuromuscular activation gains and 1.2–13.4%/wk RFD gains, vs only 1.64–5.53%/wk and 1.01–8.13%/wk without ballistic intent. Intent matters more than duration.",
      "Maffiuletti, Aagaard, Blazevich, Folland, Tillin, Duchateau (2016). Rate of force development: physiological and methodological considerations. Eur J Appl Physiol 116(6):1091-1116. → First-50ms RFD is governed by neural drive (recruitment + firing rate); ballistic ISO is the cleanest stimulus to train this without eccentric soreness.",
      "Tillin & Folland (2014). Maximal and explosive strength training elicit distinct neuromuscular adaptations, specific to the training stimulus. Eur J Appl Physiol 114(2):365-374. → Explosive (ballistic) ISO training increased early-phase RFD (50–100ms) by 47% in 4 weeks vs only 15% with sustained-contraction training.",
      "Lum, Barbosa, Joseph, Balasekaran (2021). Effects of Two Isometric Strength Training Methods on Jump and Sprint Performances: A Randomized Controlled Trial. J Sci Sport Exerc 3:115-124. DOI 10.1007/s42978-020-00095-w. → Two methods in floorball players: rapid ~1-s max-intent reps (RIST, 80–90% MVC) target pure RFD — the stimulus this ballistic protocol uses — while the 3-s sustained hold (SIST, ~75% MVC) drove the bigger sprint/peak-force gains. Keep the intent instantaneous here; use sustained holds when the goal is strength/sprint.",
    ],
  },

  // 14. French Contrast — explosive complex (Elbadry 2019)
  {
    id: "french_contrast_method",
    titleIS: "French Contrast — sprengikraftur (4-element complex)",
    titleEN: "French Contrast Method — Explosive Complex",
    category: "performance",
    intensity: "maximal",
    goalIS:
      "Bæta CMJ, Sargent jump og triple-jump með 4-element complex: heavy strength → plyometric → ballistic → assisted plyometric. Elbadry 2019: 8 vikur × 3/viku = sterkar bætingar á öllum 3 jump-tests.",
    goalEN:
      "Improve CMJ, Sargent jump and triple-jump via the 4-element complex: heavy strength → plyometric → ballistic → assisted plyometric. Elbadry 2019: 8 wk × 3/wk produced significant gains across all 3 jump tests.",
    audienceIS:
      "Ítarlegir sprengikrafts-íþróttamenn (jumpers, sprinters, körfuboltamenn, blakmenn) með ≥1.5x BW back squat. Ekki fyrir byrjendur.",
    audienceEN:
      "Advanced power athletes (jumpers, sprinters, basketball, volleyball) with ≥1.5x bodyweight back squat. Not for beginners.",
    rationaleIS:
      "Elbadry et al. (2019, J Hum Kinet 69:225–230) sýndu að French Contrast — heavy strength (PAPE primer) → plyometric (rate stimulus) → ballistic (max-velocity load) → assisted plyometric (over-speed CNS stimulus) — skilar betri CMJ + triple-jump aukningum en hefðbundin contrast eða plyometric ein og sér. Hver lota tekur ~25 mín.",
    rationaleEN:
      "Elbadry et al. (2019, J Hum Kinet 69:225–230) showed French Contrast — heavy strength (PAPE primer) → plyometric (rate stimulus) → ballistic (max-velocity load) → assisted plyometric (over-speed CNS stimulus) — produced larger CMJ + triple-jump gains than traditional contrast or plyometric alone. Each session ~25 min.",
    phases: [
      {
        name: "Block 1 — Foundational (Weeks 1–4)",
        timeline: "Weeks 1–4",
        frequency: "2× per week (MD-4 + MD-3)",
        progression:
          "Advance to Block 2 when contact times feel crisp and ≥3 ISO sets retain ballistic intent.",
        exercises: [
          {
            name: "1️⃣ Heavy ISO Mid-Thigh Pull (PAPE primer)",
            setup:
              "Bar fixed at mid-thigh. 5-s maximal pull. Rest 60s before element 2.",
            sets: 3,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 60,
            jointAngle: "Mid-thigh",
          },
          {
            name: "2️⃣ Depth Jump (rate stimulus)",
            setup:
              "Drop from 30–45 cm box, contact ground, immediately maximal vertical jump.",
            sets: 3,
            holdSeconds: 0,
            reps: 4,
            restSeconds: 60,
          },
          {
            name: "3️⃣ Loaded CMJ — barbell or trap bar (ballistic load)",
            setup:
              "30% 1RM trap-bar deadlift. Maximal vertical jump on each rep.",
            sets: 3,
            holdSeconds: 0,
            reps: 4,
            mvcPercent: 30,
            restSeconds: 60,
          },
          {
            name: "4️⃣ Band-assisted CMJ (over-speed)",
            setup:
              "Light overhead band reduces ~10–15% bodyweight. Maximal vertical jump.",
            sets: 3,
            holdSeconds: 0,
            reps: 4,
            restSeconds: 120,
          },
        ],
      },
      {
        name: "Block 2 — Performance (Weeks 5–8)",
        timeline: "Weeks 5–8",
        frequency: "2× per week (MD-4 + MD-3)",
        progression:
          "Re-test CMJ + triple-jump end of week 8. Cycle into competition phase.",
        exercises: [
          {
            name: "1️⃣ Heavy Back Squat (PAPE primer)",
            setup: "85–90% 1RM, 2 reps. Rest 90 s.",
            sets: 3,
            holdSeconds: 0,
            reps: 2,
            mvcPercent: [85, 90],
            restSeconds: 90,
          },
          {
            name: "2️⃣ Drop Jump (max rate stimulus)",
            setup:
              "Drop from 45–60 cm box, instant maximal vertical jump. Contact <250ms.",
            sets: 4,
            holdSeconds: 0,
            reps: 4,
            restSeconds: 90,
          },
          {
            name: "3️⃣ Loaded Squat Jump (40% 1RM)",
            setup: "Trap-bar or barbell, maximal vertical jump.",
            sets: 4,
            holdSeconds: 0,
            reps: 4,
            mvcPercent: 40,
            restSeconds: 90,
          },
          {
            name: "4️⃣ Band-assisted CMJ (over-speed)",
            setup: "Overhead band reducing 15–20% bodyweight. Maximal CMJ.",
            sets: 4,
            holdSeconds: 0,
            reps: 4,
            restSeconds: 120,
          },
        ],
      },
    ],
    cautionsIS:
      "Mjög hár CNS-kostnaður. Krefst ≥48 klst hvíldar fyrir keppnis. Ekki nota á MD-1 eða MD. Krefst ≥1.5x BW back squat sem inngönguskilyrði (Elbadry 2019 inclusion criteria).",
    cautionsEN:
      "Very high CNS cost. Requires ≥48h before competition. Do not use on MD-1 or MD. Requires ≥1.5x BW back squat as entry criterion (Elbadry 2019 inclusion criteria).",
    references: [
      "Elbadry, Alin, Cǎlin (2019). Effects of the French Contrast Method on Explosive Strength and Kinematic Parameters of the Triple Jump Among Female College Athletes. J Hum Kinet 69:225-230. → 8-wk × 3/wk French Contrast significantly improved CMJ height, Sargent jump, and triple-jump distance vs control. The 4-element sequence (heavy → plyo → ballistic → assisted plyo) outperformed traditional contrast.",
      "Suchomel, Comfort, Stone (2015). Weightlifting Pulling Derivatives: Rationale for Implementation and Application. Sports Med 45(6):823-839. → Mid-thigh pull at 90–100% delivers higher peak force and RFD than full-clean derivatives — ideal as the heavy-strength element 1 of French Contrast.",
      "Marshall, Bishop, Turner, Haff (2021). Optimal Training Sequences to Develop Lower Body Force, Velocity, Power, and Jump Height: A Systematic Review with Meta-Analysis. Sports Med 51(6):1245-1271. → Cluster, contrast and complex sequencing all produce equal jump-height gains; the French Contrast structure exploits PAPE windows of 2–6 min between elements.",
    ],
  },

  // 15. Pulling-derivative power (Suchomel 2015)
  {
    id: "pulling_derivative_power",
    titleIS: "Pulling-derivative kraftur (mid-thigh / hang high pull)",
    titleEN: "Pulling-Derivative Power (Mid-Thigh / Hang High Pull)",
    category: "performance",
    intensity: "maximal",
    goalIS:
      "Þróa peak force og RFD með Mid-Thigh Pull og Hang High Pull í stað Hang Power Clean — Suchomel 2015 sýnir hærri kraft + RFD með pulling derivatives þar sem catch-fasinn takmarkar þyngd.",
    goalEN:
      "Develop peak force and RFD using Mid-Thigh Pull and Hang High Pull rather than Hang Power Clean — Suchomel 2015 shows higher force + RFD with pulling derivatives where the catch phase no longer caps load.",
    audienceIS:
      "Knattspyrnu-, körfubolta-, sprett- og handboltaleikmenn sem þurfa lóðrétta sprengikrafts aukningu án Olympic lift catch tækni. Hentar PT-leikmönnum sem hafa ekki Olympic-lift bakgrunn.",
    audienceEN:
      "Football, basketball, sprint, and handball athletes needing vertical force/power gains without the Olympic-lift catch. Suits PT athletes lacking an Olympic-lift background.",
    rationaleIS:
      "Suchomel, Comfort, Stone (2015, Sports Med 45:823–839): pulling derivatives sleppa við catch-fasann og leyfa því að lyfta 90–100% 1RM frekar en 70–80% sem catch-versions takmarka. Niðurstaðan: peak force, peak velocity og RFD eru jafn-háar eða hærri en með full clean. Mid-thigh pull = besta pure-force stimulus; Hang High Pull = besta velocity-pull stimulus.",
    rationaleEN:
      "Suchomel, Comfort, Stone (2015, Sports Med 45:823–839): pulling derivatives skip the catch phase, allowing 90–100% 1RM rather than the 70–80% cap of catch versions. Result: peak force, peak velocity and RFD match or exceed the full clean. Mid-Thigh Pull = best pure-force stimulus; Hang High Pull = best velocity-pull stimulus.",
    phases: [
      {
        name: "Phase 1 — Force-bias (Weeks 1–4)",
        timeline: "Weeks 1–4",
        frequency: "2× per week",
        progression:
          "Advance load 5% when bar speed remains crisp on all 3 sets.",
        exercises: [
          {
            name: "Mid-Thigh Pull (force-bias)",
            setup:
              "Bar at mid-thigh height (140° knee, 145° hip). Triple-extend explosively, no catch.",
            sets: 4,
            holdSeconds: 0,
            reps: 3,
            mvcPercent: [90, 100],
            restSeconds: 180,
            jointAngle: "Mid-thigh",
            target: "Triple extension / RFD",
          },
          {
            name: "Romanian Deadlift (technique base)",
            setup: "Hinge to mid-shin, controlled descent, drive through floor.",
            sets: 3,
            holdSeconds: 0,
            reps: 5,
            mvcPercent: [70, 80],
            restSeconds: 120,
          },
          {
            name: "Heavy Trap-Bar Carry (postural strength)",
            setup: "Walk 20m, full trunk control, no shoulder shrug.",
            sets: 3,
            holdSeconds: 0,
            reps: 1,
            mvcPercent: [70, 85],
            restSeconds: 90,
          },
        ],
      },
      {
        name: "Phase 2 — Velocity-bias (Weeks 5–8)",
        timeline: "Weeks 5–8",
        frequency: "2× per week",
        progression:
          "Re-test CMJ end of phase. Hold velocity ≥1.0 m/s on bar for high-pull.",
        exercises: [
          {
            name: "Hang High Pull (velocity-bias)",
            setup:
              "Hang position (mid-thigh). Pull bar up to mid-chest with full triple-extension. No catch.",
            sets: 5,
            holdSeconds: 0,
            reps: 3,
            mvcPercent: [80, 90],
            restSeconds: 180,
            target: "Velocity pull",
          },
          {
            name: "Mid-Thigh Pull (heavy)",
            setup: "Maintain heavy stimulus alongside velocity work.",
            sets: 3,
            holdSeconds: 0,
            reps: 3,
            mvcPercent: [95, 100],
            restSeconds: 180,
          },
          {
            name: "CMJ (un-loaded ballistic transfer)",
            setup: "Maximal vertical jump on each rep — measure intent.",
            sets: 3,
            holdSeconds: 0,
            reps: 5,
            restSeconds: 90,
          },
        ],
      },
    ],
    cautionsIS:
      "Krefst góðs hinge-tækni grunns (Romanian Deadlift fyrst). Ekki nota Hang Power Clean staðinn — Suchomel 2015 sýndi að catch takmarkar þyngd og þar með force/RFD. Forðastu á MD-1.",
    cautionsEN:
      "Requires solid hinge-technique base (Romanian Deadlift first). Do NOT substitute Hang Power Clean — Suchomel 2015 showed the catch caps load and therefore force/RFD. Avoid on MD-1.",
    references: [
      "Suchomel, Comfort, Stone (2015). Weightlifting Pulling Derivatives: Rationale for Implementation and Application. Sports Med 45(6):823-839. → Mid-thigh pull and hang high pull match or exceed full-clean for peak force, peak power and RFD because the catch phase no longer caps load. Recommended load: 90–95% 1RM clean for force-bias, 80–90% for velocity-bias.",
      "DeWeese, Suchomel, Serrano, Burton, Scruggs, Taber (2016). The pull from the knee: Proper technique and application. NSCA SCJ 38(6):85-89. → Practical coaching cues for the pull from mid-thigh — emphasizes triple extension and shrug without catch.",
      "Comfort, Allen, Graham-Smith (2011). Comparisons of peak ground reaction force and rate of force development during variations of the power clean. J Strength Cond Res 25(5):1235-1239. → Confirms mid-thigh pull produces higher peak GRF than the catch versions, validating Suchomel's argument.",
      "Marshall, Bishop, Turner, Haff (2021). Optimal Training Sequences to Develop Lower Body Force, Velocity, Power, and Jump Height. Sports Med 51(6):1245-1271. → Pulling derivatives slot well into both heavy-strength and contrast sequences; cluster sets (1.5 min between reps) preserve bar velocity.",
    ],
  },

  // 14. Equipment-free maximal co-contraction (Lum, Comfort, Oranchuk 2026)
  {
    id: "cocontraction_equipment_free",
    titleIS: "Ísómetrískur samsamdráttur (án búnaðar)",
    titleEN: "Isometric Co-Contraction (Equipment-Free)",
    category: "performance",
    intensity: "maximal",
    isoMode: "push",
    goalIS:
      "Byggja hámarksstyrk og RFD án nokkurs búnaðar — með því að spenna quad og hamstring hámarks samtímis (co-contraction). Fyrir aðstæður þar sem enginn búnaður er til staðar.",
    goalEN:
      "Build maximal strength and RFD with zero equipment — by maximally co-contracting the quadriceps and hamstrings at the same time. For settings where no equipment is available.",
    audienceIS:
      "Lite / lítil-staða lið, heima-æfingar, snemma-endurhæfing, ferðalög — hvar sem lyftingabúnaður er ekki til staðar.",
    audienceEN:
      "Lite / small-staff clubs, at-home training, early-stage rehab, travel — anywhere weight-room equipment is unavailable.",
    rationaleIS:
      "Lum, Comfort, Oranchuk (2026): hámarks ísómetrískur samsamdráttur hnébeygju/réttivöðva (enginn búnaður) bætti IMTP peak force (g=1.80), TUG (g=2.73) og chair-stands (g=3.90) hjá óþjálfuðum fullorðnum. Vöðvi-gegn-vöðva sjálfsmótstaða skapar háa spennu án ytra álags.",
    rationaleEN:
      "Lum, Comfort, Oranchuk (2026): maximal isometric co-contraction of the knee flexors/extensors (no equipment) improved IMTP peak force (g=1.80), TUG (g=2.73) and chair-stands (g=3.90) in untrained adults. Muscle-against-muscle self-resistance produces high tension without external load.",
    phases: [
      {
        name: "Main session",
        frequency: "2–3× per week (keep it continuous, not an occasional block)",
        progression:
          "Once co-contraction is well controlled, layer in external-load isometrics or dynamic strength as equipment becomes available.",
        exercises: [
          {
            name: "Seated knee co-contraction (quad + hamstring)",
            setup:
              "Seated, knee ~90°. Drive the shin forward (quad) while simultaneously pulling the heel back (hamstring) — maximal effort, no movement. Push as hard as possible for the full hold.",
            sets: 4,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 60,
            jointAngle: "90° knee",
            target: "Quadriceps + hamstrings",
          },
          {
            name: "Split-stance wall co-contraction (long length)",
            setup:
              "Half-kneeling / split stance by a wall, front knee bent past 90°. Co-contract the front leg into the floor at a longer muscle length.",
            sets: 3,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 60,
            jointAngle: "Long-length quad / hip",
            target: "Quadriceps + hip",
          },
          {
            name: "Isometric hand-press (upper co-contraction)",
            setup:
              "Palms pressed together at chest height — press maximally (pec/triceps against pec/triceps).",
            sets: 3,
            holdSeconds: 5,
            reps: 1,
            mvcPercent: 100,
            restSeconds: 45,
            target: "Pec / triceps",
          },
        ],
      },
    ],
    cautionsIS:
      "Sönnunargögnin eru úr kyrrsetu-hópi (48,5 ára), ekki íþróttamönnum, og úr forprentun — bústu við minni áhrifum hjá þjálfuðum leikmönnum; nota sem viðhalds-/grunn-valkost, ekki í stað hleðslu með álagi. Snemma-endurhæfing: haltu verkjum ≤ 3/10. Hámarks samsamdráttur hækkar blóðþrýsting tímabundið — andaðu jafnt, ekki halda niðri í þér andanum. Ekki greining; verkir/rauð flögg → læknir/sjúkraþjálfari.",
    cautionsEN:
      "The evidence is from a sedentary population (48.5 y), not athletes, and from a preprint — expect smaller effects in trained players; use it as a capacity/maintenance option, not a replacement for loaded work. Early rehab: keep pain ≤ 3/10. Maximal co-contraction transiently raises blood pressure — breathe steadily, do not hold your breath. Not a diagnosis; pain / red flags → clinician.",
    references: [
      "Lum, Comfort, Oranchuk (2026). Getting Stronger Without Moving an Inch: A Randomized Controlled Trial Utilizing Maximal Isometric Co-Contraction. J Funct Morphol Kinesiol 11:221. DOI 10.3390/jfmk11020221 (open access). → 20 SEDENTARY adults (48.5 y), 4 wk × 3/wk, 3 sets × 5–10 maximal 3-s co-contractions: improved IMTP peak force (g=1.80), TUG (g=2.73), 30-s chair-stand (g=3.90). NB: preprint (SportRxiv) on an untrained population — treat these large effects as a ceiling, not a transfer estimate for trained athletes.",
      "Lum, Barbosa, Joseph, Balasekaran (2021). Effects of Two Isometric Strength Training Methods on Jump and Sprint Performances: A Randomized Controlled Trial. J Sci Sport Exerc 3:115-124. DOI 10.1007/s42978-020-00095-w. → The 3-s sustained method (SIST, ~75% MVC) drove the strength/sprint gains — dose the co-contraction as a full ~3-s effort, not a flick.",
      "Oranchuk, Storey, Nelson, Cronin (2019). Isometric training and long-term adaptations. Scand J Med Sci Sports 29(4):484-503. → Ballistic intent ('push as hard as possible') is the key driver of neural/RFD gains — the coaching cue for every co-contraction rep.",
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

/** Push (PIMA) vs Hold (HIMA) — label, colour and the plain "why" (Lum, Oranchuk,
 *  Chen, Kong 2026). Surfaced as a badge + one-liner on the protocol view so a
 *  coach can pick the mode by goal without reading the paper. */
export const ISO_MODE_LABELS: Record<
  IsoMode,
  { IS: string; EN: string; color: string; whyIS: string; whyEN: string }
> = {
  push: {
    IS: "Ýta (PIMA)",
    EN: "Push (PIMA)",
    color: "bg-indigo-100 text-indigo-700",
    whyIS: "Ýttu gegn óhreyfanlegri mótstöðu — betra fyrir hámarksstyrk og krafthraða (RFD).",
    whyEN: "Press against an immovable resistance — better for maximal strength and rate of force development.",
  },
  hold: {
    IS: "Halda (HIMA)",
    EN: "Hold (HIMA)",
    color: "bg-teal-100 text-teal-700",
    whyIS: "Haltu stöðu gegn álagi — betra fyrir vöðvavöxt (þykkt) og verkjastýrða vefjavinnu.",
    whyEN: "Hold a position against load — better for muscle thickness and pain-modulated tissue work.",
  },
  mixed: {
    IS: "Blandað",
    EN: "Mixed",
    color: "bg-gray-100 text-gray-600",
    whyIS: "Notar bæði ýta og halda eftir fasa prógrammsins.",
    whyEN: "Uses both push and hold across the programme's phases.",
  },
};

/** Shared citation for the push-vs-hold distinction (Study 7 of Lum's reading list). */
export const ISO_MODE_CITATION =
  "Lum, Oranchuk, Chen, Kong (2026). Comparing the Effects of Push and Hold Isometric Training on Strength and Musculotendinous Adaptations. J Strength Cond Res 40(9):1050-1058. → PIMA (push/overcoming) favoured strength; HIMA (hold/yielding) favoured morphological adaptation (muscle thickness, esp. rectus femoris). Both grew muscle.";

/** Format a hold duration or MVC range/single value */
export function formatRange(
  value: number | [number, number] | undefined,
  suffix = ""
): string {
  if (value === undefined) return "—";
  if (Array.isArray(value)) return `${value[0]}–${value[1]}${suffix}`;
  return `${value}${suffix}`;
}
