-- player_external_load_daily.is_previous_club — the previous-club (pre-transfer) flag as a real column.
--
-- Team aggregations exclude previous-club rows with `EXCLUDE_PREV_CLUB_OR` (src/lib/micropulse/load/previousClub.ts).
-- It used to filter on `raw_payload_json->>'previous_club'`, which detoasts every row's raw_payload_json (~11 KB each
-- since the Nov 2026 Catapult re-sync): 4.5 s vs 46 ms for 200 days of Breiðablik, and statement timeouts in the
-- long-runs loader. A boolean column is read straight from the heap tuple, so the filter costs nothing.
--
-- Why a trigger-maintained column and not `GENERATED ALWAYS ... STORED`:
--  * ADD COLUMN ... NOT NULL DEFAULT false is metadata-only (no table rewrite, no long ACCESS EXCLUSIVE lock);
--    a stored generated column would rewrite and detoast all ~13k rows under that lock.
--  * A generated column can't be written, so any code that reads a row and upserts it back with all its columns
--    would start failing. A plain column is writable; the trigger just overwrites it from the payload.
--
-- raw_payload_json stays the source of truth: the trigger recomputes the flag on every insert/update.

set local lock_timeout = '5s';

alter table public.player_external_load_daily
  add column if not exists is_previous_club boolean not null default false;

comment on column public.player_external_load_daily.is_previous_club is
  'True when raw_payload_json->>''previous_club'' = ''true'' (GPS imported from the player''s previous club). '
  'Maintained by trg_pled_set_is_previous_club. Exclude from team aggregates only, never from per-player reads.';

create or replace function public.pled_set_is_previous_club()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.is_previous_club := coalesce((new.raw_payload_json ->> 'previous_club') = 'true', false);
  return new;
end;
$$;

drop trigger if exists trg_pled_set_is_previous_club on public.player_external_load_daily;
create trigger trg_pled_set_is_previous_club
  before insert or update on public.player_external_load_daily
  for each row execute function public.pled_set_is_previous_club();

-- Backfill the tagged rows (29 at time of writing) through the partial index idx_pled_previous_club_keys
-- (migration 20261107180000). Leave updated_at alone: this is a derived column, not a data change.
alter table public.player_external_load_daily disable trigger trg_player_external_load_daily_set_updated_at;
update public.player_external_load_daily
   set is_previous_club = true
 where (raw_payload_json ->> 'previous_club') = 'true';
alter table public.player_external_load_daily enable trigger trg_player_external_load_daily_set_updated_at;

notify pgrst, 'reload schema';
