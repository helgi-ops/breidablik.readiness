-- Migration: Add team_id and id to microdose_templates
-- Purpose: Support multi-team access + global FREE templates
--
-- After this migration:
--   team_id = NULL                                   → Global FREE template (all teams can use)
--   team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' → Breiðablik custom template
--   team_id = <other team id>                        → Future: other team's custom templates

-- ─── Step 1: Add id (primary key) and team_id ──────────────────────────────
ALTER TABLE microdose_templates
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Add primary key if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'microdose_templates'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE microdose_templates ADD PRIMARY KEY (id);
  END IF;
END $$;

-- ─── Step 2: Tag all existing rows as Breiðablik ───────────────────────────
UPDATE microdose_templates
SET team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'
WHERE team_id IS NULL;

-- ─── Step 3: Add unique constraint so global templates don't duplicate ──────
-- Global templates are unique on (team_id, md_day, readiness_level, variant)
-- Since team_id can be NULL we use a partial index
CREATE UNIQUE INDEX IF NOT EXISTS uniq_global_microdose_templates
  ON microdose_templates (md_day, readiness_level, variant)
  WHERE team_id IS NULL;

-- ─── Step 4: Insert FREE global microdose templates ─────────────────────────
-- Simpler, research-backed sessions for every team.
-- Based on: Cuthbert et al. (2024), Vretaros (2022), Comer & Serrano (2022)
-- Covers: MD-4, MD-3, MD-2, MD-1, MD, MD+1, MD+2, GENERIC
-- Readiness levels: GREEN (god líðan), YELLOW (miðlungs), RED (þreyttur)

INSERT INTO microdose_templates (team_id, md_day, readiness_level, variant, title, description, structure)
VALUES

-- ════════════════════════════════════════
-- MD-4 — Styrktarviðhald (4 dögum fyrir leik)
-- ════════════════════════════════════════
(NULL, 'MD-4', 'GREEN', 'A',
 '🟢 MD-4 — Styrktarviðhald (FREE)',
 'Hámarksstyrkur í minni skammti. Lítið rúmmál, há þróun (85-90% 1RM). Viðheldur styrktarresídúum í þéttu keppnistímabili.',
 '{
   "duration_min": 20,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 5,
      "exercises": [
        {"name": "Líkamshlýjun (hjól)", "duration_min": 3},
        {"name": "Glute bridge", "sets": 2, "reps": 10}
      ]},
     {"type": "strength", "title": "Aðalblokk", "duration_min": 12,
      "notes": "Lítið rúmmál, há þróun. 2-3 mín hvíld milli seta.",
      "exercises": [
        {"name": "Back Squat eða Trap Bar Deadlift", "sets": 4, "reps": "3-4", "intensity": "85-90% 1RM"},
        {"name": "Romanian Deadlift", "sets": 3, "reps": 5, "intensity": "78-82% 1RM"}
      ]},
     {"type": "core", "title": "Lok", "duration_min": 3,
      "exercises": [
        {"name": "Pallof Press", "sets": 2, "reps": "8 á hlið"}
      ]}
   ]
 }'),

(NULL, 'MD-4', 'YELLOW', 'A',
 '🟡 MD-4 — Minnkaður styrkur (FREE)',
 'Minnkað rúmmál (1-2 sett) á háum þróun. Viðheldur styrkt án þreytu.',
 '{
   "duration_min": 15,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3},
        {"name": "Hip circle", "sets": 1, "reps": 8}
      ]},
     {"type": "strength", "title": "Minnkaður styrkur", "duration_min": 10,
      "notes": "1-2 sett á hverja æfingu. Hámark þróun, lágmark rúmmál.",
      "exercises": [
        {"name": "Goblet Squat eða Romanian Deadlift", "sets": 2, "reps": 4, "intensity": "80% 1RM"},
        {"name": "Pull-ups eða Lat pulldown", "sets": 2, "reps": 5}
      ]}
   ]
 }'),

(NULL, 'MD-4', 'RED', 'A',
 '🔴 MD-4 — Virk endurnýjun (FREE)',
 'Þreyttur líkami – notaðu isometric æfingar og léttar hreyfingar. Engin þróun yfir 70%.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Virk endurnýjun", "duration_min": 12,
      "exercises": [
        {"name": "Isometric wall sit", "sets": 3, "reps": "20-30 sek", "note": "Engar hreyfilegar þungar hreyfingar"},
        {"name": "Glute bridge isometric hold", "sets": 3, "reps": "20 sek"},
        {"name": "Foam roller – lær og grind", "duration_min": 4}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD-3 — Neural hraði (3 dögum fyrir leik)
-- ════════════════════════════════════════
(NULL, 'MD-3', 'GREEN', 'A',
 '🟢 MD-3 — Neural hraðavirkjun (FREE)',
 'Contrast sett: þungt samlið → sprengikraftur. PAPE áhrif: 3-10 mín milli CA og sprengikrafts.',
 '{
   "duration_min": 18,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 5,
      "exercises": [
        {"name": "Létt hjól", "duration_min": 3},
        {"name": "Banded squat walk", "sets": 2, "reps": "10 m"}
      ]},
     {"type": "power", "title": "PAP Contrast", "duration_min": 12,
      "notes": "CA (þungt) → 3-5 mín hvíld → PAPE (sprengikraftur). 3 lota.",
      "exercises": [
        {"name": "Trap Bar Deadlift (CA)", "sets": 3, "reps": 3, "intensity": "78-82% 1RM", "note": "Hámarkshraði upp"},
        {"name": "CMJ eða Box Jump (PAPE)", "sets": 3, "reps": 3, "note": "3-5 mín eftir CA"}
      ]},
     {"type": "accessory", "title": "Lok", "duration_min": 3,
      "exercises": [
        {"name": "Nordic Hamstring Curl", "sets": 2, "reps": 4, "note": "Hægt niður – 3 sek excentric"}
      ]}
   ]
 }'),

(NULL, 'MD-3', 'YELLOW', 'A',
 '🟡 MD-3 — Minnkaður contrast (FREE)',
 'Minnkað contrast – léttara þungar æfing, sama sprengikraftur. Minni þreyta.',
 '{
   "duration_min": 15,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3}
      ]},
     {"type": "power", "title": "Léttur contrast", "duration_min": 10,
      "exercises": [
        {"name": "Romanian Deadlift (CA)", "sets": 2, "reps": 4, "intensity": "72-75% 1RM"},
        {"name": "Box Jump (PAPE)", "sets": 2, "reps": 3, "note": "3 mín eftir CA"}
      ]}
   ]
 }'),

(NULL, 'MD-3', 'RED', 'A',
 '🔴 MD-3 — Neural Reset (FREE)',
 'Þreyttur – aðeins isometric og létt virkjun. Engin þreyta.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Neural reset", "duration_min": 12,
      "exercises": [
        {"name": "Isometric squat hold (70° hnébeygja)", "sets": 3, "reps": "20-25 sek"},
        {"name": "Hip flexor stretch", "sets": 1, "reps": "45 sek á hlið"},
        {"name": "Dead bug", "sets": 2, "reps": "5 á hlið"}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD-2 — Sprengikraftur (2 dögum fyrir leik)
-- ════════════════════════════════════════
(NULL, 'MD-2', 'GREEN', 'A',
 '🟢 MD-2 — Sprengikraftur (FREE)',
 'Plyometric og sprengikraftur. Lítið rúmmál, hámarkshraði. Viðheldur hraðaresídúum.',
 '{
   "duration_min": 15,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3},
        {"name": "Banded hip activation", "sets": 1, "reps": "8 á hlið"}
      ]},
     {"type": "power", "title": "Sprengikraftur", "duration_min": 10,
      "notes": "Fullt hvíld milli seta. Hámarkshraði á hverri endurtekningu.",
      "exercises": [
        {"name": "Clean High Pull eða Hang Power Clean", "sets": 3, "reps": 3, "intensity": "75-80% 1RM"},
        {"name": "Squat Jump eða CMJ", "sets": 3, "reps": 3, "note": "Hámarks hæð"},
        {"name": "Nordic Hamstring Curl", "sets": 2, "reps": 4}
      ]}
   ]
 }'),

(NULL, 'MD-2', 'YELLOW', 'A',
 '🟡 MD-2 — Léttur sprengikraftur (FREE)',
 'Minnkað rúmmál á MD-2. Sprengikraftur heldur, þungi lækkar.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [{"name": "Líkamshlýjun", "duration_min": 3}]},
     {"type": "power", "title": "Léttur sprengikraftur", "duration_min": 8,
      "exercises": [
        {"name": "Box Jump", "sets": 2, "reps": 3, "note": "Hámarks hæð"},
        {"name": "Split Squat", "sets": 2, "reps": "5 á fót", "intensity": "50% 1RM"}
      ]}
   ]
 }'),

(NULL, 'MD-2', 'RED', 'A',
 '🔴 MD-2 — Virkur bati (FREE)',
 'Létt blóðflæðisæfing og teygjur. Engin þróun yfir 60%.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Virkur bati", "duration_min": 12,
      "exercises": [
        {"name": "Kyrrstætt hjól", "duration_min": 5, "note": "HR < 120"},
        {"name": "Hip flexor + quad stretch", "sets": 1, "reps": "45 sek á hlið"},
        {"name": "Foam roller – lær", "duration_min": 3}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD-1 — Þreytuaus kveikjun (daginn fyrir leik)
-- ════════════════════════════════════════
(NULL, 'MD-1', 'GREEN', 'A',
 '🟢 MD-1 — Explosive Primer (FREE)',
 '1 sett af þungu samliði + sprengikraftur. Kveikir á CNS daginn fyrir leik. 12-15 mín.',
 '{
   "duration_min": 14,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 5,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3},
        {"name": "Mini-band hip circuit", "sets": 1, "reps": "8 á æfingu"}
      ]},
     {"type": "priming", "title": "CNS-virkjun", "duration_min": 8,
      "notes": "1 sett CA → 5-8 mín hvíld → 3 sprengihlaup. Engin þreyta.",
      "exercises": [
        {"name": "Clean High Pull (CA)", "sets": 1, "reps": 3, "intensity": "~85% 1RM", "note": "Eitt sett"},
        {"name": "10m Sprint eða CMJ (PAPE)", "sets": 3, "reps": 1, "note": "5-8 mín eftir CA"}
      ]}
   ]
 }'),

(NULL, 'MD-1', 'YELLOW', 'A',
 '🟡 MD-1 — Léttur Primer (FREE)',
 'Léttur kveikjur – aðeins plyometrics og virkjun. Engin þungar hreyfingar.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [{"name": "Líkamshlýjun", "duration_min": 3}]},
     {"type": "activation", "title": "Virkjun", "duration_min": 8,
      "exercises": [
        {"name": "CMJ", "sets": 2, "reps": 3, "note": "75% af hámarki"},
        {"name": "10m hlaup", "sets": 2, "reps": 1, "note": "80% hraði"},
        {"name": "Banded clamshell", "sets": 2, "reps": 10}
      ]}
   ]
 }'),

(NULL, 'MD-1', 'RED', 'A',
 '🔴 MD-1 — Recovery Primer (FREE)',
 'Mjög létt – aðeins blóðflæði og teygjur. Hvíldu þig.',
 '{
   "duration_min": 10,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Létt virkjun", "duration_min": 10,
      "exercises": [
        {"name": "Létt ganga eða hjól", "duration_min": 5, "note": "HR < 110"},
        {"name": "Hip og quad teygjur", "sets": 1, "reps": "30 sek á hlið"}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD — Leikdagur morgunvirkjun
-- ════════════════════════════════════════
(NULL, 'MD', 'GREEN', 'A',
 '🟢 MD — Leikdagur virkjun (FREE)',
 'Tauga-virkjun leikmorguninn. 10 mín. Engar þungar hreyfingar – aðeins CNS readiness.',
 '{
   "duration_min": 10,
   "microdose": true,
   "blocks": [
     {"type": "activation", "title": "Neural virkjun", "duration_min": 10,
      "notes": "Allt með líkamsþyngd. Fljótt og sprungulegt.",
      "exercises": [
        {"name": "Banded clamshell", "sets": 2, "reps": "10 á hlið"},
        {"name": "CMJ", "sets": 2, "reps": 3, "note": "75% – ekki fara í 100%"},
        {"name": "Med ball slam (3-4 kg)", "sets": 2, "reps": 4},
        {"name": "10m sprint", "sets": 2, "reps": 1, "note": "80% hraði"},
        {"name": "Dead bug", "sets": 1, "reps": "5 á hlið"}
      ]}
   ]
 }'),

(NULL, 'MD', 'YELLOW', 'A',
 '🟡 MD — Léttur leikdagur primer (FREE)',
 'Minnkaður leikdagur primer – aðeins band og létt virkjun.',
 '{
   "duration_min": 8,
   "microdose": true,
   "blocks": [
     {"type": "activation", "title": "Létt virkjun", "duration_min": 8,
      "exercises": [
        {"name": "Banded hip activation", "sets": 2, "reps": "8 á hlið"},
        {"name": "Sub-maximal CMJ", "sets": 2, "reps": 2, "note": "60-70%"},
        {"name": "Dead bug", "sets": 1, "reps": "5 á hlið"}
      ]}
   ]
 }'),

(NULL, 'MD', 'RED', 'A',
 '🔴 MD — Minimal activation (FREE)',
 'Þreyttur leikdagur – aðeins teygjur og mjög létt virkjun.',
 '{
   "duration_min": 8,
   "microdose": true,
   "blocks": [
     {"type": "activation", "title": "Minimal virkjun", "duration_min": 8,
      "exercises": [
        {"name": "Hip flexor stretch", "sets": 1, "reps": "30 sek á hlið"},
        {"name": "Glute bridge", "sets": 2, "reps": 8, "note": "Létt"},
        {"name": "Ankle mobility", "sets": 1, "reps": "10 á hlið"}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD+1 — Virkur bati daginn eftir leik
-- ════════════════════════════════════════
(NULL, 'MD+1', 'GREEN', 'A',
 '🟢 MD+1 — Virkur bati (FREE)',
 'Virkur bati daginn eftir leik. Létt blóðflæðisæfing og uppbygging. 15 mín.',
 '{
   "duration_min": 15,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Virkur bati", "duration_min": 15,
      "exercises": [
        {"name": "Kyrrstætt hjól", "duration_min": 6, "note": "HR < 120"},
        {"name": "Hamstring stretch", "sets": 1, "reps": "45 sek á hlið"},
        {"name": "Foam roller – lær og grind", "duration_min": 4},
        {"name": "Goblet Squat (mjög létt)", "sets": 2, "reps": 10, "intensity": "~25-30% 1RM"}
      ]}
   ]
 }'),

(NULL, 'MD+1', 'YELLOW', 'A',
 '🟡 MD+1 — Létt endurnýjun (FREE)',
 'Létt endurnýjun – aðeins blóðflæði og teygjur.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Létt endurnýjun", "duration_min": 12,
      "exercises": [
        {"name": "Ganga eða létt hjól", "duration_min": 6},
        {"name": "Full body stretch", "duration_min": 5}
      ]}
   ]
 }'),

(NULL, 'MD+1', 'RED', 'A',
 '🔴 MD+1 — Hvíld og teygjur (FREE)',
 'Mjög þreyttur – hvíld er best. Eina sem er leyfilegt er teygjur og léttar gönguferðir.',
 '{
   "duration_min": 10,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Passív endurnýjun", "duration_min": 10,
      "exercises": [
        {"name": "Létt ganga", "duration_min": 5, "note": "Utandyra ef hægt"},
        {"name": "Full body stretch", "duration_min": 5}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- MD+2 — Uppbygging (2 dögum eftir leik)
-- ════════════════════════════════════════
(NULL, 'MD+2', 'GREEN', 'A',
 '🟢 MD+2 — Uppbygging (FREE)',
 'Uppbygging eftir leik. Byrjar að byggja aftur upp styrkt og kraftþol.',
 '{
   "duration_min": 20,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 5,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3},
        {"name": "Hip activation", "sets": 2, "reps": 10}
      ]},
     {"type": "strength", "title": "Uppbygging", "duration_min": 13,
      "exercises": [
        {"name": "Romanian Deadlift", "sets": 3, "reps": 6, "intensity": "70-75% 1RM"},
        {"name": "Hip Thrust", "sets": 3, "reps": 8, "intensity": "65-70% 1RM"},
        {"name": "Pull-ups", "sets": 3, "reps": 6}
      ]}
   ]
 }'),

(NULL, 'MD+2', 'YELLOW', 'A',
 '🟡 MD+2 — Létt uppbygging (FREE)',
 'Minnkað rúmmál á MD+2. Létt en með einhverri þróun.',
 '{
   "duration_min": 15,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 4,
      "exercises": [{"name": "Líkamshlýjun", "duration_min": 3}]},
     {"type": "strength", "title": "Létt uppbygging", "duration_min": 10,
      "exercises": [
        {"name": "Goblet Squat", "sets": 2, "reps": 8, "intensity": "60% 1RM"},
        {"name": "Hip Thrust", "sets": 2, "reps": 8, "intensity": "60% 1RM"}
      ]}
   ]
 }'),

(NULL, 'MD+2', 'RED', 'A',
 '🔴 MD+2 — Enn í bata (FREE)',
 'Ennþá þreyttur – virkur bati heldur áfram.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Virkur bati", "duration_min": 12,
      "exercises": [
        {"name": "Kyrrstætt hjól", "duration_min": 6, "note": "HR < 115"},
        {"name": "Teygjur og foam roller", "duration_min": 6}
      ]}
   ]
 }'),

-- ════════════════════════════════════════
-- GENERIC — Almenn microdose (tveir leikir/vika)
-- ════════════════════════════════════════
(NULL, 'GENERIC', 'GREEN', 'A',
 '🟢 Almenn Microdose — Styrkur (FREE)',
 'Almenn microdose styrktarþjálfun. Hentugur þegar tveir leikir eru í sömu viku og ekki er nákvæmlega vitað hvenær næsti leikur er.',
 '{
   "duration_min": 18,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 5,
      "exercises": [
        {"name": "Líkamshlýjun", "duration_min": 3},
        {"name": "Glute bridge", "sets": 2, "reps": 10}
      ]},
     {"type": "strength", "title": "Almenn styrkur", "duration_min": 12,
      "exercises": [
        {"name": "Trap Bar Deadlift", "sets": 3, "reps": 4, "intensity": "80-85% 1RM"},
        {"name": "Barbell Strict Press", "sets": 2, "reps": 5, "intensity": "75% 1RM"},
        {"name": "Nordic Hamstring Curl", "sets": 2, "reps": 4}
      ]}
   ]
 }'),

(NULL, 'GENERIC', 'YELLOW', 'A',
 '🟡 Almenn Microdose — Minnkað (FREE)',
 'Mjög lítið rúmmál – aðeins eitt sett á hverja stærstu vöðvahópa.',
 '{
   "duration_min": 12,
   "microdose": true,
   "blocks": [
     {"type": "warmup", "title": "Hlýjun", "duration_min": 3,
      "exercises": [{"name": "Líkamshlýjun", "duration_min": 3}]},
     {"type": "strength", "title": "Lágmarksstimulus", "duration_min": 8,
      "notes": "Eitt sett á hvert. Há þróun, engin þreyta.",
      "exercises": [
        {"name": "Squat eða Deadlift", "sets": 1, "reps": 3, "intensity": "80% 1RM"},
        {"name": "Press", "sets": 1, "reps": 4, "intensity": "75% 1RM"},
        {"name": "Nordic Hamstring Curl", "sets": 1, "reps": 4}
      ]}
   ]
 }'),

(NULL, 'GENERIC', 'RED', 'A',
 '🔴 Almenn Microdose — Isometric (FREE)',
 'Þreyttur – isometric æfingar eru eina val. Engin þróun yfir 70%.',
 '{
   "duration_min": 10,
   "microdose": true,
   "blocks": [
     {"type": "recovery", "title": "Isometric stimulus", "duration_min": 10,
      "exercises": [
        {"name": "Isometric squat hold (70°)", "sets": 3, "reps": "20-25 sek"},
        {"name": "Isometric hip thrust hold", "sets": 2, "reps": "20 sek"},
        {"name": "Dead bug", "sets": 2, "reps": "5 á hlið"}
      ]}
   ]
 }');
