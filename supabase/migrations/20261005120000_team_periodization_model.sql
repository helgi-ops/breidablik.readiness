-- Session Builder MD-fit guardrails: the coach's own periodization principles.
--
-- team_periodization_model: one row per team. `source` picks a built-in model (default_md /
-- tactical_periodization) or 'custom', in which case `model` holds the per-MD-day specs
-- (PeriodizationModel.days as JSON). Descriptive planning layer — never writes a readiness colour.
--
-- session_fit_override_log: append-only audit when a coach sends/keeps a session the advisory
-- flagged (verdict='review'). Mirrors the microdose_overrides reason pattern. Advisory only; the
-- override never blocked anything — this just records that the coach decided, with an optional reason.

create table if not exists public.team_periodization_model (
  team_id uuid primary key references public.teams(id) on delete cascade,
  source text not null default 'default_md'
    check (source in ('default_md','tactical_periodization','custom')),
  model jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.team_periodization_model enable row level security;

-- Coach/admin/staff of the team: read + write (mirrors team_load_factors).
create policy team_periodization_model_coach_read on public.team_periodization_model for select using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_periodization_model.team_id
         or team_periodization_model.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
create policy team_periodization_model_coach_write on public.team_periodization_model for all using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_periodization_model.team_id
         or team_periodization_model.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))))
  with check (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = team_periodization_model.team_id
         or team_periodization_model.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

drop trigger if exists trg_team_periodization_model_set_updated_at on public.team_periodization_model;
create trigger trg_team_periodization_model_set_updated_at
  before update on public.team_periodization_model
  for each row execute function public.set_updated_at();


create table if not exists public.session_fit_override_log (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  session_date date,
  md_day text,
  model_source text,
  verdict text,                 -- the advisory verdict at override time ('review')
  warnings jsonb,               -- snapshot: [{ kind, level }]
  reason text,                  -- optional free-text coach reason
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.session_fit_override_log enable row level security;

create index if not exists idx_session_fit_override_log_team_date
  on public.session_fit_override_log (team_id, session_date desc);

create policy session_fit_override_log_coach_read on public.session_fit_override_log for select using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = session_fit_override_log.team_id
         or session_fit_override_log.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
create policy session_fit_override_log_coach_insert on public.session_fit_override_log for insert with check (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = session_fit_override_log.team_id
         or session_fit_override_log.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
