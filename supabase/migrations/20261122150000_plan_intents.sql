-- Plan intent: what the coach wants from a block (meso) or a week (micro), in their own words, and the goals the
-- text was read into. One row per team, scope and start date (the block's or week's Monday). See
-- src/lib/micropulse/planIntent/.
--
-- Advice only: the recommendations are computed from this row by rules every time they are shown and are never
-- stored or applied. Nothing here touches the readiness colour or what a player is sent.
--
-- Access: writes only through the server (/api/coach/plan-intent, service role, after requireCoachAccessForTeam and
-- validation against the fixed goal list). The browser may only READ its own team's rows (coaches of the team and
-- admins), via can_read_team_coach_prefs from 20261114170000_team_quality_plan_prefs.sql.

-- ─── 1. Table ──────────────────────────────────────────────────────────────
create table if not exists public.plan_intents (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  scope text not null check (scope in ('block', 'week')),
  start_date date not null,
  text text not null default '' check (char_length(text) <= 2000),
  -- [{ goal, mode, quote }] — goals from the fixed list (vocabulary.ts), after the coach's corrections.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  -- Parts of the text that asked for something the list can't hold.
  unclear jsonb not null default '[]'::jsonb check (jsonb_typeof(unclear) = 'array'),
  -- Who read the text into items last: the AI, the keyword reader, or the coach by hand.
  read_source text not null default 'keywords' check (read_source in ('ai', 'keywords', 'coach')),
  -- The AI's own read before any correction (audit: what the AI said vs what the coach kept).
  ai_items jsonb check (ai_items is null or jsonb_typeof(ai_items) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, scope, start_date)
);

-- ─── 2. Grants: read-only for logged-in users, writes only from the server ──
revoke all on public.plan_intents from public, anon, authenticated;
grant select on public.plan_intents to authenticated;
grant select, insert, update, delete on public.plan_intents to service_role;

-- ─── 3. RLS ────────────────────────────────────────────────────────────────
alter table public.plan_intents enable row level security;

drop policy if exists plan_intents_read on public.plan_intents;
create policy plan_intents_read on public.plan_intents
  for select to authenticated
  using (public.can_read_team_coach_prefs(team_id));
