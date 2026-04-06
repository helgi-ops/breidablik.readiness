-- Migration: Seed global Microdose training templates
-- Based on peer-reviewed research on microdosing resistance training in team sports:
--   Cuthbert et al. (2024) – Conceptual Framework, Strength & Conditioning Journal
--   Vretaros (2022) – Microdosing in Basketball, Academia Letters
--   Comer, Lesher, Puls & Serrano (2022) – Practical Approach, Chicago Bulls
-- Principles: short duration (15-25 min), low volume, HIGH intensity,
--   minimum effective dose to maintain training residuals during congested schedules.
-- Category: 'microdose' — suitable for GD-3 to MD, between games, post-match.

DELETE FROM workout_templates WHERE team_id IS NULL AND code IN (
  'MICRO_STYRK_MAX',
  'MICRO_KRAFT_NEÐRI',
  'MICRO_PAPE_SPRENGI',
  'MICRO_VIRKJUN_MD',
  'MICRO_AFTARI_KEÐJA',
  'MICRO_EFRI_STYRKUR',
  'MICRO_ENDURHEIMTAN',
  'MICRO_TVEIR_LEIKIR'
);

INSERT INTO workout_templates (team_id, code, title, description, is_active, category, intensity_level, md_relevance, structure)
VALUES

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. MICRO_STYRK_MAX — Maximal Strength Microdose
--    GD-3 / GD-4 · 20 min · 85-90% 1RM · Low volume, high intensity
--    Source: Cuthbert et al. (2024) – ≥4 sets/muscle group @ 85% 1RM, 4-6 rep range
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_STYRK_MAX', 'Microdose – Hámarksstyrkur',
 'Viðhald styrktarresídúa í þéttu keppnistímabili. Lítið rúmmál, há þróun (85-90% 1RM). 2-3 samtengt æfingar, 4-5 set × 3-5 endurtekningar. GD-3 eða GD-4.',
 true, 'microdose', 'HIGH', 'GD-3 to GD-4',
 '{
   "duration_min": 20,
   "category": "microdose",
   "intensity_level": "HIGH",
   "microdose": true,
   "session_type": "maximal_strength",
   "timing_note": "GD-3 eða GD-4 – lengst frá leik. Forðastu GD-1/GD-2.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Stutt hlýjun",
       "duration_min": 5,
       "exercises": [
         {"name": "Líkamshlýjun", "duration_min": 3, "note": "Hjól eða létt jóga"},
         {"name": "Glute bridge", "sets": 1, "reps": 10},
         {"name": "Hip 90/90 stretch", "sets": 1, "reps": "30 sek á hlið"}
       ]
     },
     {
       "type": "strength",
       "title": "Aðalstimulus – lægri líkami",
       "duration_min": 12,
       "notes": "Lítið rúmmál, há þróun. Hvíld 2-3 mín milli seta.",
       "exercises": [
         {"name": "Back Squat eða Trap Bar Deadlift", "sets": 4, "reps": "3-4", "intensity": "85-90% 1RM", "note": "Há þróun, hratt upp"},
         {"name": "Romanian Deadlift", "sets": 3, "reps": "4-5", "intensity": "78-82% 1RM"}
       ]
     },
     {
       "type": "core",
       "title": "Kjarni – lokablokk",
       "duration_min": 3,
       "exercises": [
         {"name": "Pallof Press", "sets": 2, "reps": "8 á hlið"},
         {"name": "Dead Bug", "sets": 2, "reps": "6 á hlið"}
       ]
     }
   ],
   "research_notes": "Cuthbert et al. (2024): ≥4 sets/muscle group, 4-6 rep range at ~85% 1RM maintains maximal strength over 12-week season. Volume reduced 33-66% vs normal training."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MICRO_KRAFT_NEÐRI — Lower Body Power / PAP Complex
--    GD-2 · 15-20 min · Contrast sets: heavy compound → explosive
--    Source: Cuthbert et al. (2024) – PAPE: CA then explosive 3-10 min later
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_KRAFT_NEÐRI', 'Microdose – Sprengiþjálfun neðri líkama (PAP)',
 'Contrastsett: þungt samlið → sprengikraft. Notar Post-Activation Performance Enhancement (PAPE) til að kveikja á taugakerfinu. GD-2. 15-20 mín.',
 true, 'microdose', 'HIGH', 'GD-2',
 '{
   "duration_min": 18,
   "category": "microdose",
   "intensity_level": "HIGH",
   "microdose": true,
   "session_type": "lower_power_pap",
   "timing_note": "GD-2. PAPE gluggi: 3-10 mín milli þungra seta og sprengikrafts.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun og virkjun",
       "duration_min": 5,
       "exercises": [
         {"name": "Líkamshlýjun", "duration_min": 3},
         {"name": "Banded squat walks", "sets": 2, "reps": "10 m"},
         {"name": "Leg swing", "sets": 1, "reps": "10 á hlið"}
       ]
     },
     {
       "type": "power",
       "title": "PAP Contrastsett",
       "duration_min": 12,
       "notes": "Þungt samlið (CA) → hvíld 3-5 mín → sprengikraft (PAPE áhrif). Endurtaka 3x.",
       "exercises": [
         {
           "name": "Trap Bar Deadlift (CA)",
           "sets": 3, "reps": "3", "intensity": "78-82% 1RM",
           "note": "Örvur upp – hámarkshraði"
         },
         {
           "name": "Countermovement Jump (PAPE)",
           "sets": 3, "reps": "3",
           "note": "3-5 mín eftir CA. Hámarks hæð, mjög lítil þreyta.",
           "rest_after_ca_min": "3-5"
         }
       ]
     },
     {
       "type": "accessory",
       "title": "Stutt lok",
       "duration_min": 3,
       "exercises": [
         {"name": "Nordic Hamstring Curl", "sets": 2, "reps": 4, "note": "Hægt niður, 3-4 sek excentric"}
       ]
     }
   ],
   "research_notes": "Cuthbert et al. (2024): PAPE effect optimal 3-10 min after CA for well-trained athletes. Rapid force production is most sensitive to fatigue – benefits most from reduced volume."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MICRO_PAPE_SPRENGI — Pre-Match Priming / PAPE Warm-up
--    GD-1 · 12-15 min · Neural prime, zero metabolic fatigue
--    Source: Cuthbert et al. (2024) Fig 5 – AM CA before pitch session
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_PAPE_SPRENGI', 'Microdose – Þreytuaus þjálfun fyrir leik (GD-1)',
 'Tauga-virkjun daginn fyrir leik. 1 set af þungu samliði + sprengikraft. Engin þreyta – aðeins kveikja á CNS. 12-15 mín.',
 true, 'microdose', 'MODERATE', 'GD-1',
 '{
   "duration_min": 14,
   "category": "microdose",
   "intensity_level": "MODERATE",
   "microdose": true,
   "session_type": "priming_gd1",
   "timing_note": "GD-1 morgun, fyrir tækniþjálfun. Hámarkshraði, mjög lítið rúmmál.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun og virkjun",
       "duration_min": 5,
       "exercises": [
         {"name": "Hjól", "duration_min": 3, "note": "Lág þróun"},
         {"name": "Mini-band hip circuit", "sets": 1, "reps": "10 á æfingu"},
         {"name": "Box step-up með líkamsþyngd", "sets": 1, "reps": "6 á fót"}
       ]
     },
     {
       "type": "priming",
       "title": "CNS-virkjun (PAPE)",
       "duration_min": 8,
       "notes": "1 sett af þungu samliði (CA) → hvíld 5-8 mín → 3 sprengihlaup. Engin þreyta. Ef þreyttur er – sleppa þungu setinu.",
       "exercises": [
         {
           "name": "Clean High Pull (CA)",
           "sets": 1, "reps": "3", "intensity": "~85% 1RM",
           "note": "Eitt sett – hámarkshraði. CA = conditioning activity."
         },
         {
           "name": "10m Sprint eða CMJ",
           "sets": 3, "reps": "1",
           "note": "5-8 mín eftir CA. Fullur hvíld. Hámarks sprengikraftur.",
           "rest_after_ca_min": "5-8"
         }
       ]
     },
     {
       "type": "mobility",
       "title": "Hreyfanleiki – lok",
       "duration_min": 3,
       "exercises": [
         {"name": "Hip flexor stretch", "sets": 1, "reps": "45 sek á hlið"},
         {"name": "Ankle mobility", "sets": 1, "reps": "10 á hlið"}
       ]
     }
   ],
   "research_notes": "Cuthbert et al. (2024): 1 set of 3 reps at ~90% 1RM as CA can prime CNS for subsequent technical session. For GD-1, sessions should be front-loaded and minimal in fatigue."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MICRO_VIRKJUN_MD — Matchday Neural Activation
--    MD morning · 10 min · Zero fatigue, pure CNS readiness
--    Source: Vretaros (2022) – microdosing in warm-up on matchday
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_VIRKJUN_MD', 'Microdose – Leikdagur virkjun (MD morgun)',
 'Tauga-virkjun leikmorguninn. 10 mín. Engar þungar hreyfingar – aðeins kveikja á vöðvum og taugakerfi áður en þjálfun eða hlýjun hefst.',
 true, 'microdose', 'LOW', 'MD',
 '{
   "duration_min": 10,
   "category": "microdose",
   "intensity_level": "LOW",
   "microdose": true,
   "session_type": "matchday_activation",
   "timing_note": "MD morgun – 4-6 klst fyrir leik. Engin þreyta. Ef maður líður illa – sleppa.",
   "blocks": [
     {
       "type": "activation",
       "title": "Neural virkjun",
       "duration_min": 10,
       "notes": "Allt með líkamsþyngd eða mjög léttu viðnámi. Fljótt, sprungulegt.",
       "exercises": [
         {"name": "Banded clamshell", "sets": 2, "reps": "10 á hlið", "note": "Glute virkjun"},
         {"name": "Countermovement Jump", "sets": 2, "reps": "3", "note": "Sub-maximal (~75%) – ekki fara í 100%"},
         {"name": "Med ball slam", "sets": 2, "reps": "4", "note": "Létt kúla (3-4 kg), sprengikraftur"},
         {"name": "10m sprint acceleration", "sets": 2, "reps": "1", "note": "80% hraða – gangsetning"},
         {"name": "Dead bug", "sets": 1, "reps": "6 á hlið", "note": "Kjarni virkjun til loka"}
       ]
     }
   ],
   "research_notes": "Vretaros (2022): Microdosing in warm-up acts as a stimulating component of force manifestations. Cuthbert (2024): Short-term residuals (aerobic capacity, strength) maintained with competition stimulus alone."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MICRO_AFTARI_KEÐJA — Posterior Chain Strength Microdose
--    GD-2 / GD-3 · 20 min · Hamstrings, glutes, hip hinge focus
--    Injury prevention + strength residuals for sprint-specific demands
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_AFTARI_KEÐJA', 'Microdose – Afturkeðja (hamstrings/glutes)',
 'Styrktarviðhald aftanverðrar keðju – hamstrings, sétuvöðvar og hryggur. Meiðslavar uppbygging + hraðastyrkur. GD-2 eða GD-3. 20 mín.',
 true, 'microdose', 'HIGH', 'GD-2 to GD-3',
 '{
   "duration_min": 20,
   "category": "microdose",
   "intensity_level": "HIGH",
   "microdose": true,
   "session_type": "posterior_chain",
   "timing_note": "GD-2 eða GD-3. Hamstrings þurfa 48+ klst til bata eftir Nordic.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun",
       "duration_min": 5,
       "exercises": [
         {"name": "Leg curl (létt)", "sets": 2, "reps": 10, "note": "Virkja hamstrings"},
         {"name": "Glute bridge", "sets": 2, "reps": 10},
         {"name": "Hip 90/90", "sets": 1, "reps": "30 sek á hlið"}
       ]
     },
     {
       "type": "strength",
       "title": "Afturkeðja – aðalblokk",
       "duration_min": 14,
       "notes": "Lítið rúmmál, há þróun. Hæg excentric á Nordic.",
       "exercises": [
         {
           "name": "Nordic Hamstring Curl",
           "sets": 3, "reps": "4-5",
           "note": "3-4 sek niður (excentric). Vel þekkt meiðslavar."
         },
         {
           "name": "Romanian Deadlift",
           "sets": 3, "reps": "5", "intensity": "75-80% 1RM",
           "note": "Beina við hnéin, fletja á mjöðm"
         },
         {
           "name": "Hip Thrust",
           "sets": 3, "reps": "6", "intensity": "70-75% 1RM",
           "note": "Sprengi upp, haldið 1 sek efst"
         }
       ]
     },
     {
       "type": "core",
       "title": "Lok",
       "duration_min": 3,
       "exercises": [
         {"name": "Side plank", "sets": 2, "reps": "20 sek á hlið"}
       ]
     }
   ],
   "research_notes": "Nordic Hamstring Curl reduces hamstring injury risk by ~51% (van Dyk et al.). Microdose context: maintain posterior chain residuals throughout congested schedule."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. MICRO_EFRI_STYRKUR — Upper Body Strength Microdose
--    GD-2 / GD-3 · 15 min · Push + pull compound only
--    Source: Chicago Bulls microdosing table – Press + Row pattern
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_EFRI_STYRKUR', 'Microdose – Efri líkami (press + row)',
 'Styrktarviðhald efri líkama. Einfalt: þrýstiæfing + togæfing. 15 mín. Chicago Bulls microdose uppbygging (Comer et al. 2022).',
 true, 'microdose', 'HIGH', 'GD-2 to GD-3',
 '{
   "duration_min": 15,
   "category": "microdose",
   "intensity_level": "HIGH",
   "microdose": true,
   "session_type": "upper_body",
   "timing_note": "GD-2 eða GD-3. Gott að para við neðri líkama á sama degi ef tími.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun",
       "duration_min": 4,
       "exercises": [
         {"name": "Band pull-apart", "sets": 2, "reps": 12},
         {"name": "Face pull", "sets": 2, "reps": 12},
         {"name": "Arm circle", "sets": 1, "reps": "10 á hlið"}
       ]
     },
     {
       "type": "strength",
       "title": "Efri líkami – aðalblokk",
       "duration_min": 10,
       "notes": "Þrýsti + tog í hverju setti. Lítið rúmmál.",
       "exercises": [
         {
           "name": "Barbell Strict Press eða DB Overhead Press",
           "sets": 3, "reps": "5-6", "intensity": "75-80% 1RM",
           "note": "Þrýstingur – beint yfir höfuð"
         },
         {
           "name": "Pendley Row eða Bent-over DB Row",
           "sets": 3, "reps": "6", "intensity": "70-75% 1RM",
           "note": "Toglið – baksstyrkur og stöðugleiki"
         },
         {
           "name": "Pull-ups eða Lat Pulldown",
           "sets": 2, "reps": "5-6",
           "note": "Loka efri líkama. Þyngd ef hægt."
         }
       ]
     },
     {
       "type": "core",
       "title": "Lok",
       "duration_min": 2,
       "exercises": [
         {"name": "Pallof Press", "sets": 2, "reps": "8 á hlið"}
       ]
     }
   ],
   "research_notes": "Comer, Lesher, Puls & Serrano (2022): In-season microdosing table includes Barbell Strict Press 3x6 @75%, Pendley Row 4x8 @75%. Focus on 15-25 min sessions, high frequency."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MICRO_ENDURHEIMTAN — Post-Match Active Recovery Microdose
--    MD+1 · 15 min · Low intensity, metabolic clearance, low-minute players
--    Source: Vretaros (2022) – microdosing after match as active recovery
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_ENDURHEIMTAN', 'Microdose – Virkur bati eftir leik (MD+1)',
 'Virkur bati daginn eftir leik. Létt æfing til að hreinsa efnaskiptaúrgang og viðhalda stirðleika í lágmarki. Sérstaklega fyrir leikmenn með litla leiktíma. 15 mín.',
 true, 'microdose', 'LOW', 'MD+1',
 '{
   "duration_min": 15,
   "category": "microdose",
   "intensity_level": "LOW",
   "microdose": true,
   "session_type": "active_recovery",
   "timing_note": "MD+1 – daginn eftir leik. Lágmarks þreyta. Hjól eða gangan. Ef mjög þreyttur – bara teygjur.",
   "blocks": [
     {
       "type": "recovery",
       "title": "Virkur bati",
       "duration_min": 15,
       "notes": "Allt á lágum hraða. Markmið: blóðflæði og efnaskiptahreinsun – ekki þjálfun.",
       "exercises": [
         {"name": "Kyrrstætt hjól eða létt ganga", "duration_min": 6, "note": "Mjög lágur hraði – HR < 120"},
         {"name": "Hip flexor + quad stretch", "sets": 1, "reps": "60 sek á hlið"},
         {"name": "Hamstring stretch (liggjandi)", "sets": 1, "reps": "45 sek á hlið"},
         {"name": "Foam roller – lær, grind og kálfar", "duration_min": 4, "note": "Létt þrýstingur, ekki sársaukafull"},
         {"name": "DB Goblet Squat (mjög létt)", "sets": 2, "reps": "10", "intensity": "~30% 1RM", "note": "Blóðflæði í fótleggjum – ekki styrkur"}
       ]
     }
   ],
   "research_notes": "Vretaros (2022): After match, microdosing as active recovery removes metabolic waste from muscles (reduced DOMS). Comer et al. (2022): Active recovery reduces soreness, keeps athletes moving 3-4 days/week."
 }'),

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. MICRO_TVEIR_LEIKIR — Double Game Week Microdose (≤72h turnaround)
--    Between games · 12-15 min · Ultra-minimal stimulus, pure readiness
--    Source: Vretaros (2022) – Spanish women's basketball: <72h between games
-- ─────────────────────────────────────────────────────────────────────────────
(NULL, 'MICRO_TVEIR_LEIKIR', 'Microdose – Tveir leikir í viku (≤72 klst)',
 'Þegar tveir leikir eru ≤72 klst í sundur. Lágmarksstimulus – eitt sett á hverja stærstu vöðvahópa. Markmið: viðhald, ekki þróun. 12-15 mín.',
 true, 'microdose', 'MODERATE', 'Between games (≤72h)',
 '{
   "duration_min": 13,
   "category": "microdose",
   "intensity_level": "MODERATE",
   "microdose": true,
   "session_type": "double_game_week",
   "timing_note": "Milli leikja þegar ≤72 klst. Gera ASAP eftir leik 1, a.m.k. 36 klst fyrir leik 2.",
   "blocks": [
     {
       "type": "warmup",
       "title": "Stuð hlýjun",
       "duration_min": 4,
       "exercises": [
         {"name": "Létt hjól", "duration_min": 3},
         {"name": "Band hip activation", "sets": 1, "reps": "8 á hlið"}
       ]
     },
     {
       "type": "strength",
       "title": "Eitt sett á hóp – lágmarksstimulus",
       "duration_min": 8,
       "notes": "Eitt sett á hverja stærstu vöðvahópa. Há þróun en mjög lítið rúmmál. Þetta er VIÐHALD – ekki þróun.",
       "exercises": [
         {
           "name": "Trap Bar Deadlift eða Squat",
           "sets": 1, "reps": "3-4", "intensity": "80-85% 1RM",
           "note": "1 sett – neðri líkami. Hámarkshraði upp."
         },
         {
           "name": "Barbell Strict Press",
           "sets": 1, "reps": "4-5", "intensity": "75-80% 1RM",
           "note": "1 sett – efri líkami þrýstingur."
         },
         {
           "name": "Pendley Row",
           "sets": 1, "reps": "5", "intensity": "72-78% 1RM",
           "note": "1 sett – efri líkami tog."
         },
         {
           "name": "Nordic Hamstring Curl",
           "sets": 1, "reps": "4",
           "note": "1 sett – hamstrings viðhald og meiðslavar."
         }
       ]
     },
     {
       "type": "recovery",
       "title": "Lok – bati",
       "duration_min": 3,
       "exercises": [
         {"name": "Foam roller – lær og grind", "duration_min": 3}
       ]
     }
   ],
   "research_notes": "Vretaros (2022): Spanish women''s basketball league – games <72h apart require ultra-minimal microdose. Spiering et al.: Volume reductions of 33-66% maintain strength while keeping intensity high."
 }');
