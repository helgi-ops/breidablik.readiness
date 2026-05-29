-- Trainer-entered competition/game dates for PT clients.
-- Drives automatic pre-game tapering on the client surface. Athletes don't
-- edit this — the trainer enters it from the schedule the athlete sends.
create table if not exists public.pt_client_games (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  trainer_id uuid,
  team_id uuid,
  game_date date not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists pt_client_games_player_date_idx
  on public.pt_client_games (player_id, game_date);

comment on table public.pt_client_games is
  'Trainer-entered competition/game dates for a PT client. Drives automatic pre-game tapering on the client surface. Athletes do not edit this — the trainer sets it up from the schedule the athlete sends.';

-- All access goes through the service-role trainer endpoints; block direct
-- client access.
alter table public.pt_client_games enable row level security;
