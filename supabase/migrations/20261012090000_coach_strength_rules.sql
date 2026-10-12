-- Coach-authored strength build rules: the strength coach sets HOW the build is structured —
-- the scheme per meso block × season phase (quality / %1RM zone / set×rep / velocity-loss cap / cite)
-- and the phase config (intensity / verdict). One sparse JSONB override map per team; the engine merges
-- it OVER the evidence-based defaults in seasonPhaseStrength.ts, so a team with no row behaves exactly as
-- today. Descriptive planning layer — never writes a readiness colour or the daily decision.
--
--   rules = { "block": { "accum:preseason": { pct1rm:{en,is}, scheme:{en,is}, quality?:{en,is}, cite? }, … },
--             "phase": { "competitive": { intensity:{en,is}, verdict?:{en,is} }, … } }

create table if not exists public.coach_strength_rules (
  team_id uuid primary key references public.teams(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);

alter table public.coach_strength_rules enable row level security;

-- Coach/admin/staff of the team: read + write (mirrors team_periodization_model).
create policy coach_strength_rules_coach_read on public.coach_strength_rules for select using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = coach_strength_rules.team_id
         or coach_strength_rules.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));
create policy coach_strength_rules_coach_write on public.coach_strength_rules for all using (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = coach_strength_rules.team_id
         or coach_strength_rules.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))))
  with check (
  exists (select 1 from profiles pr where pr.id = auth.uid()
    and lower(coalesce(pr.role, '')) = any (array['coach','admin','staff'])
    and (lower(coalesce(pr.role, '')) = 'admin' or pr.team_id = coach_strength_rules.team_id
         or coach_strength_rules.team_id in (select ct.team_id from coach_teams ct where ct.coach_id = auth.uid()))));

drop trigger if exists trg_coach_strength_rules_set_updated_at on public.coach_strength_rules;
create trigger trg_coach_strength_rules_set_updated_at
  before update on public.coach_strength_rules
  for each row execute function public.set_updated_at();
