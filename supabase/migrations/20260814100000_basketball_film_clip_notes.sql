-- Per-clip AI "film note" for basketball Opponent Analysis. A coach uploads a SHORT clip
-- (one possession / set); the browser samples frames and the POST route sends them to Claude
-- vision, which returns a structured description of the action, spacing, movement and
-- defensive scheme. Many notes per opponent (unlike the one-per-opponent ai_summary), so this
-- is INSERT-append, not upsert. Descriptive AI, labelled as such — never touches readiness.
-- Only the service-role server route reads/writes this, so RLS is enabled with no policy
-- (deny by default for anon/authenticated; service role bypasses).
create table if not exists public.basketball_film_clip_notes (
  id uuid primary key default gen_random_uuid(),
  owner_team_id uuid not null references public.teams(id) on delete cascade,
  opponent_name text,                                   -- nullable: an own-team clip may not name an opponent
  clip_label text not null,
  side text not null default 'opp' check (side in ('own', 'opp')),
  note jsonb not null,
  model text,
  frame_count int,
  duration_sec int,
  thumb text,                                           -- one small base64 JPEG (middle frame) for the list; nullable
  created_at timestamptz not null default now()
);
alter table public.basketball_film_clip_notes enable row level security;
create index if not exists basketball_film_clip_notes_team_opp_idx
  on public.basketball_film_clip_notes (owner_team_id, opponent_name, created_at desc);
