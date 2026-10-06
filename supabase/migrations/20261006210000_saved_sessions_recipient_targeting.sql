-- Scope B: group / subset targeting for published pitch ("Build session") sessions.
--
-- Until now a published `saved_sessions` row was visible to the WHOLE team (the
-- player read policy only matched team_id). This adds an optional recipient list
-- so a coach can build one session and send it to a position group or a
-- hand-picked subset — the players in the group see it on their Today tab
-- ("Næsta æfing frá þjálfara"); everyone else does not.
--
-- Semantics: recipient_player_ids NULL or empty  = whole team (unchanged default).
--            otherwise = only these players.id values.
-- This is the pitch-session analogue of the strength send's `playerIds?` subset.
-- It is a parallel delivery artifact (NOT the strength `player_today_strength_override`
-- Today layer) — it never touches the readiness colour.

alter table public.saved_sessions
  add column if not exists recipient_player_ids uuid[] null;

comment on column public.saved_sessions.recipient_player_ids is
  'Null or empty = the whole team sees this published session. Otherwise only these players.id values see it (a coach-chosen position group or hand-picked subset). Targeting layer for Build Session -> player app.';

-- Drop the pre-existing BROAD team read policy. It granted every team member
-- (players included) SELECT on ALL non-deleted sessions — no published filter, no
-- recipient filter — which both leaked drafts to players and defeated the targeting
-- below. Staff keep full access via `saved_sessions_staff_all` (COACH/ADMIN/STAFF),
-- and players read through the published+recipient policy below. Verified: a coach
-- still sees drafts; a player sees only published sessions aimed at them.
drop policy if exists "Team members can view saved sessions" on public.saved_sessions;

-- Tighten the player read policy so a TARGETED session only reaches its recipients.
-- (The service-role server routes are the authoritative gate; this keeps direct /
-- user-context reads honest too — defense in depth.)
drop policy if exists saved_sessions_team_read_published on public.saved_sessions;
create policy saved_sessions_team_read_published on public.saved_sessions
  for select to public
  using (
    deleted_at is null
    and published_at is not null
    and team_id in (
      select profiles.team_id from profiles where profiles.id = auth.uid()
    )
    and (
      recipient_player_ids is null
      or cardinality(recipient_player_ids) = 0
      or exists (
        select 1
        from players pl
        where pl.user_id = auth.uid()
          and pl.id = any (saved_sessions.recipient_player_ids)
      )
    )
  );
