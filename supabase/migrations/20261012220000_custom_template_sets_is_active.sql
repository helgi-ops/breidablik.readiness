-- Explicit "active programme" marker for team-level Custom Programme sets.
--
-- Problem: a team can have more than one team-level set (custom_template_sets with player_id IS NULL),
-- and both the player's Today resolution (PlayerClient.fetchStage4Plan) and the Standard-send helper
-- pick the NEWEST one. So creating a newer/partial set silently shadows the coach's intended programme.
--
-- Fix: an is_active flag the coach sets per programme. Resolution prefers is_active=true (newest among
-- active), falling back to the newest set when none is marked — backward-compatible (teams that never
-- mark one keep today's "newest wins" behaviour).
--
-- Scope: only meaningful for team-level sets (player_id IS NULL); per-player sets are windowed by dates.

alter table public.custom_template_sets
  add column if not exists is_active boolean not null default false;

comment on column public.custom_template_sets.is_active is
  'Team-level (player_id IS NULL) active-programme marker. Resolution prefers an active row, else the newest set. One active programme per team (all rows sharing the chosen table_name may be marked together).';

-- One-off data correction: Breiðablik (94b52a06…) had a newer partial "Lower body program" team set
-- silently shadowing the main "Breiðablik" programme (newest-wins). Mark the Breiðablik programme active.
-- No-op in environments without this team / these rows.
update public.custom_template_sets set is_active = false
where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and player_id is null;
update public.custom_template_sets set is_active = true
where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c' and player_id is null
  and table_name = 'breidablik_football_karlar_microdose_templates';
