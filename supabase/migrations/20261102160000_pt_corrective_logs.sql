-- A PT client's finished corrective session: one row per client per day, with
-- the pain answer. Deliberately separate from set logs and session RPE so light
-- corrective work never enters load (ACWR / Foster).
create table if not exists public.pt_corrective_logs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid,
  log_date date not null,
  items_done int not null default 0,
  items_total int not null default 0,
  pain text not null check (pain in ('none', 'little', 'yes')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, log_date)
);

comment on table public.pt_corrective_logs is
  'PT client corrective completion + pain answer, per day. Written by /api/client/corrective. Never feeds load.';

create index if not exists pt_corrective_logs_player_date_idx
  on public.pt_corrective_logs (player_id, log_date desc);

alter table public.pt_corrective_logs enable row level security;

drop policy if exists pt_corr_log_player_read on public.pt_corrective_logs;
create policy pt_corr_log_player_read on public.pt_corrective_logs
  for select using (
    exists (
      select 1 from public.players p
      where p.id = pt_corrective_logs.player_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists pt_corr_log_coach_read on public.pt_corrective_logs;
create policy pt_corr_log_coach_read on public.pt_corrective_logs
  for select using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and (
          upper(coalesce(pr.role, '')) = 'ADMIN'
          or (
            upper(coalesce(pr.role, '')) in ('COACH', 'STAFF')
            and (
              pr.team_id = pt_corrective_logs.team_id
              or exists (
                select 1 from public.coach_teams ct
                where ct.coach_id = pr.id and ct.team_id = pt_corrective_logs.team_id
              )
            )
          )
        )
    )
  );
