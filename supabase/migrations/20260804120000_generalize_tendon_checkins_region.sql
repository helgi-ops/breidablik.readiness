-- Generalise the daily tendon check-in so it serves BOTH tendinopathy modules
-- (patellar / jumper's knee and Achilles). The provocation test differs by region
-- (decline-squat for knee, heel-raise for Achilles) but the shape is identical.
ALTER TABLE public.patellar_tendon_checkins RENAME TO tendon_checkins;
ALTER TABLE public.tendon_checkins RENAME COLUMN decline_squat_vas TO provocation_vas;
ALTER TABLE public.tendon_checkins ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'patellar';

-- One row per player per day PER REGION (a player could manage both).
ALTER TABLE public.tendon_checkins DROP CONSTRAINT IF EXISTS patellar_tendon_checkins_player_id_entry_date_key;
ALTER TABLE public.tendon_checkins ADD CONSTRAINT tendon_checkins_player_date_region_key UNIQUE (player_id, entry_date, region);
