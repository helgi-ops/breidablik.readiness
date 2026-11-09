-- staff_users rows with no matching login grant nothing and only clutter the elevated-access list.
-- Matched two rows from 2026-01-29 on 2026-11-09, with no profile, team or player attached. Removed by the coach's decision.
delete from public.staff_users s
where not exists (select 1 from auth.users u where u.id = s.user_id);
