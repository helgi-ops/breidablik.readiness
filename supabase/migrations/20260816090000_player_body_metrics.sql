-- Player anthropometry (body mass / height) — the sparse input the memo names for per-kg
-- metrics. Coaches record it here; the resolver prefers the latest manual entry, then falls
-- back to the VALD CMJ payload weight, then null (never fabricated). Descriptive context —
-- it never touches the readiness colour, the load target, or the daily decision.
create table if not exists public.player_body_metrics (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  mass_kg numeric not null check (mass_kg > 20 and mass_kg < 200),
  height_cm numeric null check (height_cm is null or (height_cm > 100 and height_cm < 230)),
  measured_on date not null default current_date,
  source text not null default 'coach',   -- coach | vald | import
  note text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);
create index if not exists player_body_metrics_player_idx on public.player_body_metrics (player_id, measured_on desc);

alter table public.player_body_metrics enable row level security;

create policy player_body_metrics_coach_read on public.player_body_metrics
  for select using (
    exists (select 1 from public.profiles pr where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin' or pr.team_id = player_body_metrics.team_id
        or player_body_metrics.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()))));
create policy player_body_metrics_coach_write on public.player_body_metrics
  for insert with check (
    exists (select 1 from public.profiles pr where pr.id = auth.uid()
      and lower(coalesce(pr.role,'')) = any (array['coach','admin','staff'])
      and (lower(coalesce(pr.role,'')) = 'admin' or pr.team_id = player_body_metrics.team_id
        or player_body_metrics.team_id in (select ct.team_id from public.coach_teams ct where ct.coach_id = auth.uid()))));

create policy player_body_metrics_player_read on public.player_body_metrics
  for select using (
    exists (select 1 from public.players p where p.id = player_body_metrics.player_id and p.user_id = auth.uid())
    or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.player_id = player_body_metrics.player_id));
