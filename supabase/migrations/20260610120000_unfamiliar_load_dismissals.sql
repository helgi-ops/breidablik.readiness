-- Audit trail for coach dismissals of an Unfamiliar Load (movement-drift) flag.
-- A dismissal suppresses that player's flag for the specific reference date it
-- was raised on; new data (a later ref_date) can re-surface it. This is the
-- manifesto's "override is an audited dialogue" principle for the Driver layer.
create table if not exists public.unfamiliar_load_dismissals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  ref_date date not null,
  reason text,
  dismissed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (player_id, ref_date)
);

create index if not exists unfamiliar_load_dismissals_team_idx
  on public.unfamiliar_load_dismissals (team_id, ref_date);

comment on table public.unfamiliar_load_dismissals is
  'Coach dismissals of Unfamiliar Load / movement-drift flags. Suppresses a player flag for its ref_date; logged with reason + dismisser for audit (manifesto principle #6).';

alter table public.unfamiliar_load_dismissals enable row level security;
