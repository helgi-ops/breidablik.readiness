-- Backfill the match-pace columns (20261110235000) on every row that has a ≥18 s reading.
-- Touching the row re-runs ima_fr_fill_tiers(); band values and edges are unchanged, so the edges are not
-- re-detected and the ≥18 s / ≥24 s tiers come out identical (checked before/after on 10 Nov 2026).
-- updated_at is left alone (the sync-freshness checks read it), so its trigger is paused for this update only.

alter table public.player_external_load_daily disable trigger trg_player_external_load_daily_set_updated_at;

update public.player_external_load_daily
   set ima_fr_ge18_mp_event_count = null
 where ima_fr_ge18_event_count is not null;

alter table public.player_external_load_daily enable trigger trg_player_external_load_daily_set_updated_at;
