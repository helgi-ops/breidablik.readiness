-- Migration: Seed global training templates
-- These are system-level templates (team_id = NULL) available to all plans.
-- Free users can view and use these. Pro users can additionally create custom templates.

-- Ensure unique global templates don't duplicate on re-run
DELETE FROM workout_templates WHERE team_id IS NULL AND code IN (
  'GLOBAL_STRENGTH_A',
  'GLOBAL_STRENGTH_B',
  'GLOBAL_POWER',
  'GLOBAL_SPEED_AGILITY',
  'GLOBAL_RECOVERY_FULL',
  'GLOBAL_RECOVERY_LIGHT',
  'GLOBAL_ACTIVATION',
  'GLOBAL_MATCHDAY_MINUS1',
  'GLOBAL_MATCHDAY_PLUS1',
  'GLOBAL_PREHAB'
);

INSERT INTO workout_templates (team_id, code, title, description, is_active, category, intensity_level, md_relevance, structure)
VALUES

-- 1. Styrktarþjálfun A (Gæðastyrkur)
(NULL, 'GLOBAL_STRENGTH_A', 'Styrktarþjálfun A',
 'Gæðastyrkur – meginstyrkur neðri líkama og kjarna. Hentugur á þjálfunardögum með meðal eða miklu álagi.',
 true, 'strength', 'HIGH', 'MD-3 to MD-4',
 '{
   "duration_min": 55,
   "category": "strength",
   "intensity_level": "HIGH",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun",
       "duration_min": 10,
       "exercises": [
         {"name": "Líkamshlýjun (hjól/hlaup)", "duration_min": 5},
         {"name": "Hip mobility circuit", "sets": 1, "reps": "10 á hlið"},
         {"name": "Glute activation band", "sets": 2, "reps": 12}
       ]
     },
     {
       "type": "strength",
       "title": "Aðalblokk – neðri líkami",
       "exercises": [
         {"name": "Back Squat", "sets": 4, "reps": "4-5", "intensity": "82-87% 1RM"},
         {"name": "Romanian Deadlift", "sets": 3, "reps": 6, "intensity": "75% 1RM"},
         {"name": "Bulgarian Split Squat", "sets": 3, "reps": "8 á fót"}
       ]
     },
     {
       "type": "strength",
       "title": "Kjarnastyrking",
       "exercises": [
         {"name": "Copenhagen Plank", "sets": 3, "duration": "30 sek á hlið"},
         {"name": "Pallof Press", "sets": 3, "reps": "10 á hlið"},
         {"name": "Dead Bug", "sets": 2, "reps": 10}
       ]
     },
     {
       "type": "cooldown",
       "title": "Kólnun",
       "duration_min": 8,
       "exercises": [
         {"name": "Quad/hamstring teyging", "duration_min": 4},
         {"name": "Hip flexor teyging", "duration_min": 4}
       ]
     }
   ]
 }'::jsonb),

-- 2. Styrktarþjálfun B (Efri líkami + kjarni)
(NULL, 'GLOBAL_STRENGTH_B', 'Styrktarþjálfun B',
 'Efri líkami og kjarni – herðar, brjóst, bakþjálkar og neckur. Viðbót við neðri líkama þjálfun.',
 true, 'strength', 'MEDIUM', 'MD-3 to MD-4',
 '{
   "duration_min": 45,
   "category": "strength",
   "intensity_level": "MEDIUM",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun",
       "duration_min": 8,
       "exercises": [
         {"name": "Band pull-apart", "sets": 2, "reps": 15},
         {"name": "Thoracic rotation", "sets": 1, "reps": "8 á hlið"},
         {"name": "Wall slides", "sets": 2, "reps": 12}
       ]
     },
     {
       "type": "strength",
       "title": "Push / Pull",
       "exercises": [
         {"name": "DB Bench Press", "sets": 4, "reps": 8, "intensity": "75% 1RM"},
         {"name": "Bent-over Row", "sets": 4, "reps": 8, "intensity": "75% 1RM"},
         {"name": "DB Shoulder Press", "sets": 3, "reps": 10},
         {"name": "Cable Row", "sets": 3, "reps": 12}
       ]
     },
     {
       "type": "strength",
       "title": "Kjarni + forvarnir",
       "exercises": [
         {"name": "Nordic Curl", "sets": 3, "reps": 5, "note": "Excentric"},
         {"name": "Side Plank", "sets": 3, "duration": "30 sek á hlið"},
         {"name": "Pallof Press rotation", "sets": 2, "reps": "8 á hlið"}
       ]
     }
   ]
 }'::jsonb),

-- 3. Kraftþjálfun (Sprengikraftur)
(NULL, 'GLOBAL_POWER', 'Kraftþjálfun – Sprengikraftur',
 'Hraðstyrking og sprengikraftur. Líkaminn þarf að vera úthlýður. Notaðu á MD-3 eða MD-4.',
 true, 'power', 'HIGH', 'MD-3 to MD-4',
 '{
   "duration_min": 50,
   "category": "power",
   "intensity_level": "HIGH",
   "blocks": [
     {
       "type": "warmup",
       "title": "Hlýjun – hraðanetwork",
       "duration_min": 12,
       "exercises": [
         {"name": "Skip A + B", "sets": 2, "distance": "20m"},
         {"name": "Ankle hops", "sets": 3, "reps": 8},
         {"name": "Broad jump (lítið) – tækni", "sets": 3, "reps": 3}
       ]
     },
     {
       "type": "power",
       "title": "Spengikraftur – neðri líkami",
       "exercises": [
         {"name": "Jump Squat (bar 40% 1RM)", "sets": 5, "reps": 4},
         {"name": "Broad Jump", "sets": 4, "reps": 4, "rest": "90 sek"},
         {"name": "Hexagonal bar deadlift (sprengja)", "sets": 4, "reps": 3, "intensity": "60-70% 1RM"}
       ]
     },
     {
       "type": "power",
       "title": "Hraðastigi",
       "exercises": [
         {"name": "10m sprint x 6", "rest": "2 mín", "note": "Hámarks hraði"},
         {"name": "Reactive agility (pro agility)", "sets": 3, "rest": "90 sek"}
       ]
     }
   ]
 }'::jsonb),

-- 4. Hraða- og liprustjarfun
(NULL, 'GLOBAL_SPEED_AGILITY', 'Hraða- og liprustjálfun',
 'Hraði, breytingar á stefnu og hraðvitnamengi. Hentugur við góðar aðstæður á MD-4 eða MD-5.',
 true, 'power', 'HIGH', 'MD-4 to MD-5',
 '{
   "duration_min": 45,
   "category": "power",
   "intensity_level": "HIGH",
   "blocks": [
     {
       "type": "warmup",
       "title": "Dynamic hlýjun",
       "duration_min": 10,
       "exercises": [
         {"name": "Leg swings", "sets": 2, "reps": "12 á hlið"},
         {"name": "High knees", "distance": "20m x 3"},
         {"name": "Carioca", "distance": "20m x 3"}
       ]
     },
     {
       "type": "speed",
       "title": "Hraðaþjálfun",
       "exercises": [
         {"name": "Flying 10 (10m run-in + 10m max)", "sets": 6, "rest": "3 mín"},
         {"name": "40m hámarks sprint", "sets": 4, "rest": "3-4 mín"}
       ]
     },
     {
       "type": "agility",
       "title": "Liprustjálfun",
       "exercises": [
         {"name": "5-10-5 shuttle", "sets": 6, "rest": "90 sek"},
         {"name": "T-drill", "sets": 4, "rest": "2 mín"},
         {"name": "Reactive 1v1 skipti", "sets": 2, "duration": "5 mín"}
       ]
     }
   ]
 }'::jsonb),

-- 5. Full endurheimta (MD+1 eða erfið vika)
(NULL, 'GLOBAL_RECOVERY_FULL', 'Full endurheimta',
 'Endurheimta daginn eftir leik (MD+1) eða eftir mikla þjálfunarviku. Léttar hreyfingar, útbreiðsla og hreyfanleiki.',
 true, 'recovery', 'LOW', 'MD+1',
 '{
   "duration_min": 35,
   "category": "recovery",
   "intensity_level": "LOW",
   "blocks": [
     {
       "type": "activation",
       "title": "Létt virkjun",
       "duration_min": 8,
       "exercises": [
         {"name": "Hægur hjólreiðar eða ganga", "duration_min": 8, "intensity": "HR < 120"}
       ]
     },
     {
       "type": "mobility",
       "title": "Hreyfanleiki og útbreiðsla",
       "duration_min": 20,
       "exercises": [
         {"name": "Foam rolling – neðri líkami", "duration_min": 8},
         {"name": "Hip flexor teyging (sofa)", "sets": 2, "duration": "45 sek á hlið"},
         {"name": "Thoracic open book", "sets": 2, "reps": "8 á hlið"},
         {"name": "Child's pose + lat stretch", "duration_min": 4}
       ]
     },
     {
       "type": "recovery",
       "title": "Endurheimt",
       "duration_min": 7,
       "exercises": [
         {"name": "Andörun / hugsun (box breathing)", "duration_min": 4},
         {"name": "Létt kaldur pottur eða ísblær", "duration_min": 3, "note": "Ef tiltækt"}
       ]
     }
   ]
 }'::jsonb),

-- 6. Létt endurheimtaæfing
(NULL, 'GLOBAL_RECOVERY_LIGHT', 'Létt endurheimtaæfing',
 'Stutt og létt endurheimta á þjálfunardögum með lítið álag eða þegar leikmaður er flaggaður. 20-25 mín.',
 true, 'recovery', 'LOW', 'Any',
 '{
   "duration_min": 25,
   "category": "recovery",
   "intensity_level": "LOW",
   "blocks": [
     {
       "type": "mobility",
       "title": "Hreyfanleiki",
       "duration_min": 12,
       "exercises": [
         {"name": "Hip 90/90 stretch", "sets": 2, "duration": "45 sek á hlið"},
         {"name": "Hamstring teyging (stigi)", "sets": 2, "duration": "45 sek á fót"},
         {"name": "Quad teyging (liggjandi)", "sets": 2, "duration": "45 sek á fót"},
         {"name": "Shoulder cross-body", "sets": 2, "duration": "30 sek á hlið"}
       ]
     },
     {
       "type": "recovery",
       "title": "Mýkt og kjarni",
       "duration_min": 13,
       "exercises": [
         {"name": "Cat-cow", "sets": 2, "reps": 10},
         {"name": "Glute bridge", "sets": 2, "reps": 12},
         {"name": "Dead bug (létt)", "sets": 2, "reps": 8},
         {"name": "Andörun (4-7-8)", "duration_min": 3}
       ]
     }
   ]
 }'::jsonb),

-- 7. Virkjunarblokk (fyrir þjálfun eða leik)
(NULL, 'GLOBAL_ACTIVATION', 'Virkjunarblokk',
 'Líkamlegt og taugalegt upphlýjun. Notaðu 60-75 mín fyrir þjálfun eða leik. Heldur líkamanum tilbúnum án þreytu.',
 true, 'activation', 'MEDIUM', 'MD-1 to MD-2',
 '{
   "duration_min": 25,
   "category": "activation",
   "intensity_level": "MEDIUM",
   "blocks": [
     {
       "type": "activation",
       "title": "Virkjun – neðri líkami",
       "duration_min": 10,
       "exercises": [
         {"name": "Glute bridge", "sets": 2, "reps": 12},
         {"name": "Band lateral walk", "sets": 2, "reps": "12 á hlið"},
         {"name": "Step-up (léttur)", "sets": 2, "reps": "8 á fót"},
         {"name": "Single leg RDL (án þyngdar)", "sets": 2, "reps": "8 á fót"}
       ]
     },
     {
       "type": "activation",
       "title": "Taugar og hraði",
       "duration_min": 10,
       "exercises": [
         {"name": "Reactive hop – létt", "sets": 3, "reps": 5},
         {"name": "Plyometric skip", "distance": "20m x 3"},
         {"name": "Build-up sprint (40% → 80%)", "distance": "30m x 3"}
       ]
     },
     {
       "type": "mobility",
       "title": "Hreyfanleiki – keyrsla",
       "duration_min": 5,
       "exercises": [
         {"name": "Hip CARs", "sets": 1, "reps": "5 á hlið"},
         {"name": "Ankle circles + soleus", "sets": 1, "reps": "8 á hlið"}
       ]
     }
   ]
 }'::jsonb),

-- 8. Leikjadag -1 (Virkjun fyrir leik)
(NULL, 'GLOBAL_MATCHDAY_MINUS1', 'Leikjadag -1: Virkjunarþjálfun',
 'Daginn fyrir leik – létt virkjun, hnykkt taugakerfi og tæknileg athugun. Engin þreyta. 20-30 mín.',
 true, 'matchday', 'LOW', 'MD-1',
 '{
   "duration_min": 25,
   "category": "matchday",
   "intensity_level": "LOW",
   "md_relevance": "MD-1",
   "blocks": [
     {
       "type": "activation",
       "title": "Létt virkjun",
       "duration_min": 10,
       "exercises": [
         {"name": "Glute activation circuit", "sets": 1, "reps": 12},
         {"name": "Reactive hop (án ástands)", "sets": 3, "reps": 5},
         {"name": "Ramp sprint (30% → 70%)", "distance": "20m x 3"}
       ]
     },
     {
       "type": "technical",
       "title": "Tæknilegar hreyfingar",
       "duration_min": 10,
       "exercises": [
         {"name": "Set piece athugun", "duration_min": 8, "note": "Létt – engin tengsl"},
         {"name": "Hópsamtaka (stutt)", "duration_min": 5}
       ]
     },
     {
       "type": "mobility",
       "title": "Frágang",
       "duration_min": 5,
       "exercises": [
         {"name": "Quad/hip flexor teyging", "duration_min": 3},
         {"name": "Andörun", "duration_min": 2}
       ]
     }
   ]
 }'::jsonb),

-- 9. Leikjadag +1 (Eftir leik)
(NULL, 'GLOBAL_MATCHDAY_PLUS1', 'Leikjadag +1: Endurheimta eftir leik',
 'Daginn eftir leik – fullt fókus á líkamlegri og taugalegri endurheimtu. Engin þjálfunáreiti.',
 true, 'recovery', 'LOW', 'MD+1',
 '{
   "duration_min": 30,
   "category": "recovery",
   "intensity_level": "LOW",
   "md_relevance": "MD+1",
   "blocks": [
     {
       "type": "recovery",
       "title": "Pool / ísblær (ef tiltækt)",
       "duration_min": 10,
       "exercises": [
         {"name": "Kaldur/hlýr skiptipottur", "duration_min": 10, "note": "2 mín kalt / 1 mín hlýtt x 3"}
       ]
     },
     {
       "type": "mobility",
       "title": "Hreyfanleiki",
       "duration_min": 15,
       "exercises": [
         {"name": "Foam rolling – fullur líkami", "duration_min": 8},
         {"name": "Hamstring teyging", "sets": 2, "duration": "45 sek á fót"},
         {"name": "Hip flexor teyging", "sets": 2, "duration": "45 sek á hlið"},
         {"name": "Thoracic mobilization", "sets": 2, "reps": "8 á hlið"}
       ]
     },
     {
       "type": "recovery",
       "title": "Hugrænn hvíld",
       "duration_min": 5,
       "exercises": [
         {"name": "Andörun (box breathing)", "duration_min": 5}
       ]
     }
   ]
 }'::jsonb),

-- 10. Forvarnablokk
(NULL, 'GLOBAL_PREHAB', 'Forvarnablokk',
 'Forvarnir – mjóbak, hné og ökklar. Notaðu 2-3x á viku við hlið aðalþjálfunar. 20 mín.',
 true, 'prehab', 'LOW', 'Any',
 '{
   "duration_min": 20,
   "category": "prehab",
   "intensity_level": "LOW",
   "blocks": [
     {
       "type": "prehab",
       "title": "Hné og mjaðmir",
       "duration_min": 10,
       "exercises": [
         {"name": "Nordic Curl (excentric, létt)", "sets": 3, "reps": 4},
         {"name": "Single leg calf raise", "sets": 3, "reps": 15},
         {"name": "VMO squat", "sets": 2, "reps": 12}
       ]
     },
     {
       "type": "prehab",
       "title": "Ökklar og mjóbak",
       "duration_min": 10,
       "exercises": [
         {"name": "Ankle alphabet (setjandi)", "sets": 2, "reps": "1 stafur á hlið"},
         {"name": "Banded ankle dorsiflexion", "sets": 2, "reps": 12},
         {"name": "Bird-dog", "sets": 3, "reps": "8 á hlið"},
         {"name": "Cat-cow", "sets": 2, "reps": 10}
       ]
     }
   ]
 }'::jsonb);

-- Add is_global flag for easier filtering (optional, but useful)
ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT false;
UPDATE workout_templates SET is_global = true WHERE team_id IS NULL;
