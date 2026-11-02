-- Per-client corrective-exercise prescription for a PT client (System A, /client).
-- Trainer-authored (AI-proposed, trainer-confirmed) corrective/prehab work that
-- appears as a "morning" session on chosen weekdays, alongside the assigned
-- strength programme. PT-only: read solely by /api/client/today; never feeds the
-- club coach auto-plan. See src/lib/trainer/correctiveFromInjury.ts.
create table if not exists public.pt_corrective_prescriptions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid,
  trainer_id uuid,
  injury_text text,
  extracted jsonb,                         -- AI-read injuries (provenance)
  structure jsonb not null default '{}'::jsonb,  -- { block, items:[CorrectiveItem] }
  weekdays int[] not null default '{}',    -- ISO 1=Mon..7=Sun the corrective shows
  duration_min int,
  status text not null default 'active',   -- 'active' | 'archived'
  model text,                              -- AI model used (provenance)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id)
);

comment on table public.pt_corrective_prescriptions is
  'PT client corrective/prehab prescription (System A /client). AI-proposed, trainer-confirmed. Shown as a morning session on chosen weekdays beside the strength programme. PT-only; never the club coach auto-plan.';

alter table public.pt_corrective_prescriptions enable row level security;

-- Player may read their own prescription.
drop policy if exists pt_corr_player_read on public.pt_corrective_prescriptions;
create policy pt_corr_player_read on public.pt_corrective_prescriptions
  for select using (
    exists (
      select 1 from public.players p
      where p.id = pt_corrective_prescriptions.player_id
        and p.user_id = (select auth.uid())
    )
  );

-- Coach / staff / admin of the client's team: full access (admin = any team).
drop policy if exists pt_corr_coach_all on public.pt_corrective_prescriptions;
create policy pt_corr_coach_all on public.pt_corrective_prescriptions
  for all using (
    exists (
      select 1 from public.profiles pr
      where pr.id = (select auth.uid())
        and (
          upper(coalesce(pr.role, '')) = 'ADMIN'
          or (
            upper(coalesce(pr.role, '')) in ('COACH', 'STAFF')
            and (
              pr.team_id = pt_corrective_prescriptions.team_id
              or exists (
                select 1 from public.coach_teams ct
                where ct.coach_id = pr.id and ct.team_id = pt_corrective_prescriptions.team_id
              )
            )
          )
        )
    )
  ) with check (true);
