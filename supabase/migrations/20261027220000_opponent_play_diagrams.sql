-- Set-play diagrams for basketball opponent scouting. One structured-JSON diagram per
-- play, keyed to the opponent (folded name, same folding as the scout route) scoped to the
-- coach's team. Descriptive scouting — never touches the readiness colour or a training action.
create table if not exists public.opponent_play_diagrams (
  id            uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  opponent_key  text not null,                  -- foldName(opponent)
  name          text not null,
  play_type     text,                           -- InStat play-type vocabulary
  diagram       jsonb not null,                 -- { court, players[], arrows[] } normalised 0-100
  source        text not null default 'manual', -- 'manual' | 'ai_draft'
  confidence    text,                           -- 'high' | 'medium' | 'low' (AI only)
  confirmed     boolean not null default false, -- AI drafts start false; coach confirms
  confirmed_by  uuid references auth.users(id),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists opponent_play_diagrams_key
  on public.opponent_play_diagrams(owner_team_id, opponent_key);

alter table public.opponent_play_diagrams enable row level security;

-- Coaches/staff/admin read + write their own team's diagrams. Mirrors the scouting tables'
-- team-scoped access (team_id resolved from the caller's profile).
drop policy if exists opponent_play_diagrams_rw on public.opponent_play_diagrams;
create policy opponent_play_diagrams_rw on public.opponent_play_diagrams
  for all to authenticated
  using (
    owner_team_id in (select p.team_id from public.profiles p where p.id = (select auth.uid()))
  )
  with check (
    owner_team_id in (select p.team_id from public.profiles p where p.id = (select auth.uid()))
  );
