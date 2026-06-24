-- Game model for the per-player training-emphasis engine ("How to train this
-- player", docs/train-like-you-play-individual.md). A team-level enum the coach
-- sets, with an optional per-position override (jsonb: { "<position>": "<model>" }).
-- Maps to a demand profile in src/lib/micropulse/trainingRead/catalogue.ts.

alter table public.team_settings
  add column if not exists game_model text not null default 'balanced',
  add column if not exists game_model_by_position jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_settings_game_model_chk') then
    alter table public.team_settings add constraint team_settings_game_model_chk
      check (game_model in ('high_press', 'possession', 'direct_transition', 'low_block_counter', 'balanced'));
  end if;
end $$;
