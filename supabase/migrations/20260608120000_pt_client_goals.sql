-- Trainer-recorded training goals for a PT client.
-- The trainer ticks the qualities the client wants (strength, power, speed,
-- agility, …) plus free-text from the client's own message; the goal-driven
-- recommender scores the trainer's programme library against these goals.
-- One row per client (the current goal set); history isn't needed yet.
create table if not exists public.pt_client_goals (
  client_id uuid primary key references public.players(id) on delete cascade,
  goals text[] not null default '{}',
  notes text,
  trainer_id uuid,
  updated_at timestamptz not null default now()
);

comment on table public.pt_client_goals is
  'Trainer-recorded training goals for a PT client (ticked quality tags + free-text). Drives the goal-driven programme recommender. One row per client = current goals.';

-- All access goes through the service-role trainer endpoints; block direct
-- client access.
alter table public.pt_client_goals enable row level security;
