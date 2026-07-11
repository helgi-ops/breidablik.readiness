-- player_today_strength_override
--
-- Makes "what the coach SENDS = what the player SEES on Today" real.
--
-- Model (locked with the user 2026-07-10):
--   • DEFAULT  — the authored team `microdose_templates` session is what a player
--                sees on Today (stable, S&C-authored). Unchanged.
--   • OVERRIDE — when a coach opens /coach/strength (buildStrengthSession:
--                per-player, tuned to today's signals) and MANUALLY sends it, the
--                sent session becomes THAT player's Today card for THAT date.
--
-- The player Today fetch (PlayerClient.fetchStage4Plan) checks this table FIRST;
-- if a row exists for (player_id, entry_date) it renders as the session, labelled
-- "Sent by coach". Otherwise the existing microdose_templates chain runs untouched
-- — so this is purely additive and cannot break the default flow.
--
-- `structure` is the same card shape the renderer already consumes:
--   [{ block: string, items: [{ name, sets, reps, rest, method, note }] }]
-- (produced by strengthSessionToTodayStructure() from a built StrengthSession).

create table if not exists public.player_today_strength_override (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.players(id) on delete cascade,
  team_id       uuid not null,
  entry_date    date not null,
  md_context    text,
  readiness_level text,
  title         text,
  description   text,
  structure     jsonb not null,
  summary       text,
  duration_min  integer,
  source        text not null default 'coach_sent',
  coach_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (player_id, entry_date)
);

create index if not exists idx_player_today_strength_override_lookup
  on public.player_today_strength_override (player_id, entry_date);

alter table public.player_today_strength_override enable row level security;

-- Player reads their own override; coach/staff reads their team's.
-- Mirrors the SELECT pattern already used by custom_template_sets.
drop policy if exists "player_today_strength_override_read" on public.player_today_strength_override;
create policy "player_today_strength_override_read"
  on public.player_today_strength_override
  for select
  to authenticated
  using (
    (player_id in (select id from public.players where user_id = auth.uid()))
    or (team_id in (
      select team_id from public.profiles where id = auth.uid()
      union
      select team_id from public.coach_teams where coach_id = auth.uid()
    ))
  );

-- Coach/staff of the team may write (server routes use the service role and
-- bypass RLS, but this keeps direct coach writes well-formed).
drop policy if exists "player_today_strength_override_write" on public.player_today_strength_override;
create policy "player_today_strength_override_write"
  on public.player_today_strength_override
  for all
  to authenticated
  using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
      union
      select team_id from public.coach_teams where coach_id = auth.uid()
    )
  )
  with check (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
      union
      select team_id from public.coach_teams where coach_id = auth.uid()
    )
  );
