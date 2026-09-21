-- Coaching Library — Phase 1: video / media.
--
-- Drills carry video + extra media; a general coach_media table + a PRIVATE bucket
-- hold the coach's clips/images/docs (add-by-link or uploaded). Player-identifiable
-- video = minors → private bucket + signed URLs only, never a public bucket. Content/
-- knowledge surface — nothing here touches the readiness colour or the daily decision.

-- 1. Drills carry a video link + a media list ------------------------------------
alter table public.drill_library add column if not exists video_url text;
alter table public.drill_library add column if not exists media jsonb;  -- [{kind,url|path,title}]

-- 2. coach_media — the coach's clips / images / docs ------------------------------
create table if not exists public.coach_media (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('coach','team')),
  owner_coach_id uuid null,
  team_id uuid null references public.teams(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('video','image','doc')),
  external_url text,            -- YouTube / Vimeo / link
  storage_path text,            -- coach-library-media object (uploaded, private)
  tags text[] not null default '{}',
  drill_id uuid null references public.drill_library(id) on delete set null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  -- ownership consistency (mirror drill_library)
  constraint coach_media_owner_ck check (
    (owner_type = 'coach' and owner_coach_id is not null and team_id is null)
    or (owner_type = 'team' and team_id is not null and owner_coach_id is null)
  ),
  -- must carry a link OR an uploaded object
  constraint coach_media_source_ck check (external_url is not null or storage_path is not null)
);

create index if not exists coach_media_owner_idx on public.coach_media (owner_type) where deleted_at is null;
create index if not exists coach_media_team_idx on public.coach_media (team_id) where deleted_at is null;
create index if not exists coach_media_coach_idx on public.coach_media (owner_coach_id) where deleted_at is null;
create index if not exists coach_media_drill_idx on public.coach_media (drill_id) where deleted_at is null;

alter table public.coach_media enable row level security;

-- RLS mirrors drill_library_*_v2 EXACTLY (minus public — player media is never public).
create policy coach_media_select on public.coach_media for select using (
  deleted_at is null and (
    (owner_type = 'coach' and owner_coach_id = auth.uid())
    or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_media.team_id and ct.coach_id = auth.uid()))
    or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
  )
);
create policy coach_media_insert on public.coach_media for insert with check (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_media.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);
create policy coach_media_update on public.coach_media for update using (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_media.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);
create policy coach_media_delete on public.coach_media for delete using (
  (owner_type = 'coach' and owner_coach_id = auth.uid())
  or (owner_type = 'team' and exists (select 1 from public.coach_teams ct where ct.team_id = coach_media.team_id and ct.coach_id = auth.uid()))
  or exists (select 1 from public.staff_users su where su.user_id = auth.uid())
);

drop trigger if exists trg_coach_media_set_updated_at on public.coach_media;
create trigger trg_coach_media_set_updated_at before update on public.coach_media
  for each row execute function public.set_updated_at();

-- 3. Private bucket for uploaded library media (signed URLs only, like movement-screen).
insert into storage.buckets (id, name, public)
  values ('coach-library-media', 'coach-library-media', false)
  on conflict (id) do nothing;
