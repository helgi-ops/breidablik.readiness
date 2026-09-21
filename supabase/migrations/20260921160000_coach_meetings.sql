-- Coaching Library — Phase 2: meetings.
--
-- A coach keeps staff / team / 1-to-1 / video-review meetings here, each with an agenda,
-- minutes, attendees, and attached drills / media / files. Content/knowledge surface —
-- nothing here touches the readiness colour, the load target, or the daily decision.

create table if not exists public.coach_meetings (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('coach','team')),
  owner_coach_id uuid null,
  team_id uuid null references public.teams(id) on delete cascade,
  title text not null,
  meeting_date date not null,
  meeting_type text null check (meeting_type is null or meeting_type in ('staff','team','1to1','video-review','other')),
  agenda text,
  minutes text,
  attendees text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint coach_meetings_owner_ck check (
    (owner_type = 'coach' and owner_coach_id is not null and team_id is null)
    or (owner_type = 'team' and team_id is not null and owner_coach_id is null)
  )
);

create index if not exists coach_meetings_team_idx on public.coach_meetings (team_id, meeting_date desc) where deleted_at is null;
create index if not exists coach_meetings_coach_idx on public.coach_meetings (owner_coach_id, meeting_date desc) where deleted_at is null;

create table if not exists public.coach_meeting_attachments (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.coach_meetings(id) on delete cascade,
  kind text not null check (kind in ('drill','media','file','note')),
  drill_id uuid null references public.drill_library(id) on delete set null,
  media_id uuid null references public.coach_media(id) on delete set null,
  external_url text,
  note text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists coach_meeting_attachments_meeting_idx on public.coach_meeting_attachments (meeting_id, position);

alter table public.coach_meetings enable row level security;
alter table public.coach_meeting_attachments enable row level security;

-- coach_meetings RLS mirrors drill_library ownership (coach|team; no public).
create policy coach_meetings_select on public.coach_meetings for select using (
  deleted_at is null and (
    (owner_type = 'coach' and owner_coach_id = auth.uid())
    or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_meetings.team_id and ct.coach_id = auth.uid()))
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  )
);
create policy coach_meetings_insert on public.coach_meetings for insert with check (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_meetings.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);
create policy coach_meetings_update on public.coach_meetings for update using (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_meetings.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);
create policy coach_meetings_delete on public.coach_meetings for delete using (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_meetings.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);

-- Attachments inherit the parent meeting's visibility.
create policy coach_meeting_attachments_all on public.coach_meeting_attachments for all using (
  exists (select 1 from public.coach_meetings m where m.id = coach_meeting_attachments.meeting_id and (
    (m.owner_type = 'coach' and m.owner_coach_id = auth.uid())
    or (m.owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = m.team_id and ct.coach_id = auth.uid()))
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  ))
) with check (
  exists (select 1 from public.coach_meetings m where m.id = coach_meeting_attachments.meeting_id and (
    (m.owner_type = 'coach' and m.owner_coach_id = auth.uid())
    or (m.owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = m.team_id and ct.coach_id = auth.uid()))
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  ))
);

drop trigger if exists trg_coach_meetings_set_updated_at on public.coach_meetings;
create trigger trg_coach_meetings_set_updated_at before update on public.coach_meetings
  for each row execute function public.set_updated_at();
