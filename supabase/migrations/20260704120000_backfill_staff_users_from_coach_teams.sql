-- Backfill staff_users from coach_teams.
--
-- Bug: coach_week_setup (and ~40 other coach-surface tables) gate writes on
-- is_staff() = EXISTS(SELECT 1 FROM staff_users WHERE user_id = auth.uid()).
-- Coach provisioning added coaches to coach_teams + profiles(role) but NOT to
-- staff_users, so 33 of 35 coaches hit "new row violates row-level security
-- policy for table coach_week_setup" when saving a week (direct client insert
-- in src/app/coach/week-setup/page.tsx).
--
-- This syncs the RLS gate table to the already-decided coach roster. It does
-- not change who is a coach — coach_teams is the source of truth for that.
-- The recurrence fix (add coaches to staff_users at invite-accept / via trigger)
-- is tracked separately in docs/tasks/staff-users-provisioning-claude-code-brief.md

insert into staff_users (user_id, role)
select distinct ct.coach_id, 'coach'
from coach_teams ct
left join staff_users su on su.user_id = ct.coach_id
where su.user_id is null
  and ct.coach_id is not null
on conflict (user_id) do nothing;
