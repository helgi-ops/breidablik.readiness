-- Opponent set-play VIDEOS for basketball scouting: a coach pastes a YouTube (or other) link per set
-- play, keyed to the opponent (folded name) scoped to the coach's team. The simple alternative to
-- drawn diagrams. Descriptive scouting — never touches the readiness colour or a training action.
create table if not exists public.opponent_set_videos (
  id            uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  opponent_key  text not null,                  -- foldName(opponent)
  label         text not null,                  -- e.g. "Horns", "Opposite Roll"
  url           text not null,                  -- the video link (YouTube or other)
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists opponent_set_videos_key
  on public.opponent_set_videos(owner_team_id, opponent_key);

alter table public.opponent_set_videos enable row level security;

drop policy if exists opponent_set_videos_rw on public.opponent_set_videos;
create policy opponent_set_videos_rw on public.opponent_set_videos
  for all to authenticated
  using (
    owner_team_id in (select p.team_id from public.profiles p where p.id = (select auth.uid()))
  )
  with check (
    owner_team_id in (select p.team_id from public.profiles p where p.id = (select auth.uid()))
  );
