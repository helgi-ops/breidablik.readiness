-- Per-client (player) declared vacation / break for PT clients.
-- During it: reminders suppressed, no streak/compliance penalty, return ease-in
-- afterwards. The trainer declares it per client (not team-wide).
create table if not exists public.client_breaks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  trainer_id uuid,
  start_date date not null,
  end_date date not null,
  label text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists client_breaks_player_dates_idx
  on public.client_breaks (player_id, start_date, end_date);

comment on table public.client_breaks is
  'Per-client (player) declared vacation / break. During it: reminders suppressed, no streak/compliance penalty, return ease-in afterwards. The trainer declares it per client.';

alter table public.client_breaks enable row level security;
