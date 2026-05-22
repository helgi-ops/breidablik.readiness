-- ─────────────────────────────────────────────────────────────────────────
-- Physical Assessment Battery — Phase 1: data model + event grouping
--
-- Breiðablik sends its afrekshópur (youth/academy talent group) for a full
-- strength + physical assessment roughly every 6 months. Testing is done by
-- an external party (Háskólinn í Reykjavík) using VALD and other equipment,
-- and the results arrive as CSV/PDF exports.
--
-- This migration adds the two tables that hold a periodic assessment:
--
--   physical_assessments         — one row per player per assessment event
--                                  (the ≈6-monthly "test day"). The grouping
--                                  unit that later interpretation hangs off.
--   physical_assessment_metrics  — generic key/value metric rows linked to an
--                                  assessment. One flexible table holds every
--                                  metric kind (sprint splits, jumps, body
--                                  composition) so the battery can evolve
--                                  without schema churn.
--
-- VALD force tests keep living in their own vald_* tables; a later phase
-- associates them with an assessment by date. Phase 1 is ingestion of the
-- non-VALD measurements (speed/sprint/jump + anthropometrics).
--
-- age_years_at_assessment is denormalised onto the assessment row on purpose:
-- the afrekshópur is youth, and a player's age changes between two 6-monthly
-- tests — the historical assessment must keep the age the player WAS at test
-- time so youth age-band interpretation stays correct.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── 1. Table DDL ───────────────────────────────────────────────────────
create table if not exists public.physical_assessments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete set null,
  player_id uuid not null references public.players(id) on delete cascade,
  assessment_date date not null,
  tester_source text,                       -- e.g. 'Háskólinn í Reykjavík'
  age_years_at_assessment numeric(4,1),     -- snapshot of player age on test day
  notes text,
  source text not null default 'csv',       -- csv | pdf | manual
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, player_id, assessment_date)
);

create table if not exists public.physical_assessment_metrics (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null
    references public.physical_assessments(id) on delete cascade,
  metric_code text not null,                -- catalog code, e.g. 'sprint_10m_s'
  metric_category text,                     -- speed | jump | anthropometric | force
  value numeric,
  unit text,
  side text not null default 'bilateral',   -- bilateral | left | right
  raw_label text,                           -- original CSV header, for audit
  created_at timestamptz not null default now(),
  unique (assessment_id, metric_code, side)
);


-- ─── 2. Indexes ─────────────────────────────────────────────────────────
create index if not exists physical_assessments_team_idx
  on public.physical_assessments (team_id);
create index if not exists physical_assessments_player_date_idx
  on public.physical_assessments (player_id, assessment_date desc);
create index if not exists physical_assessment_metrics_assessment_idx
  on public.physical_assessment_metrics (assessment_id);
create index if not exists physical_assessment_metrics_code_idx
  on public.physical_assessment_metrics (metric_code);


-- ─── 3. Grants ──────────────────────────────────────────────────────────
-- Pattern A: coach/staff read+write, no anon access. Writes happen via the
-- service_role admin client in the upload route; authenticated needs the
-- base permission so RLS-gated reads from coach pages work.
grant select, insert, update, delete on public.physical_assessments to authenticated;
grant select, insert, update, delete on public.physical_assessments to service_role;
grant select, insert, update, delete on public.physical_assessment_metrics to authenticated;
grant select, insert, update, delete on public.physical_assessment_metrics to service_role;


-- ─── 4. RLS + policies ──────────────────────────────────────────────────
alter table public.physical_assessments enable row level security;
alter table public.physical_assessment_metrics enable row level security;

-- physical_assessments — coaches see their team's assessments.
create policy "coaches_select_their_team"
  on public.physical_assessments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = physical_assessments.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = physical_assessments.team_id
          )
        )
    )
  );

-- physical_assessments — players see their own assessments.
create policy "players_select_own"
  on public.physical_assessments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.player_id = physical_assessments.player_id
    )
  );

-- physical_assessment_metrics — visibility follows the parent assessment.
create policy "coaches_select_their_team"
  on public.physical_assessment_metrics
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.physical_assessments a
      join public.profiles p on p.id = auth.uid()
      where a.id = physical_assessment_metrics.assessment_id
        and lower(coalesce(p.role, '')) in ('coach','admin','staff')
        and (
          p.team_id = a.team_id
          or exists (
            select 1 from public.coach_teams ct
            where ct.coach_id = auth.uid()
              and ct.team_id = a.team_id
          )
        )
    )
  );

create policy "players_select_own"
  on public.physical_assessment_metrics
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.physical_assessments a
      join public.profiles p on p.id = auth.uid()
      where a.id = physical_assessment_metrics.assessment_id
        and p.player_id = a.player_id
    )
  );


-- ─── 5. updated_at trigger on physical_assessments ──────────────────────
create or replace function public.physical_assessments_set_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists physical_assessments_set_updated_at on public.physical_assessments;
create trigger physical_assessments_set_updated_at
  before update on public.physical_assessments
  for each row execute function public.physical_assessments_set_updated_at();


-- ─── 6. Comments ────────────────────────────────────────────────────────
comment on table public.physical_assessments is
  'Periodic (≈6-monthly) physical/strength assessment events for the afrekshópur. One row per player per test day. Owned by the Physical Assessment Battery feature.';
comment on table public.physical_assessment_metrics is
  'Generic metric values for a physical_assessments event — sprint/jump/anthropometric measurements. metric_code references the TS catalog in src/lib/integrations/physical-assessment/metricCatalog.ts.';
comment on column public.physical_assessments.age_years_at_assessment is
  'Player age in years on the assessment date — denormalised snapshot so youth age-band interpretation stays correct across multiple assessments.';
