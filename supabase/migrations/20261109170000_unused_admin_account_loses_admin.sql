-- The coach's second admin login is unused (last sign-in 2026-07-08) and has no two-step sign-in.
-- By the coach's decision on 2026-11-09 it loses admin and the elevated staff role; the coach keeps one admin login.
-- Its coach_teams rows are left in place on purpose (98 teams, sole coach on 87) pending a separate decision.
-- Rollback: set is_admin = true and re-insert the staff_users row with role = 'staff'.
update public.profiles set is_admin = false
where id = '60b93b68-94fa-43a9-bdab-78b51056a7fb';

delete from public.staff_users
where user_id = '60b93b68-94fa-43a9-bdab-78b51056a7fb' and role = 'staff';
