-- A player login must not hold staff_users.role = 'staff': is_elevated_staff() opens other teams to it.
-- Matches one row on 2026-11-09: the coach's own walkthrough player account, used to see the player app.
-- Rows with role = 'coach' and admins are left alone. Rollback: re-insert the row with role = 'staff'.
delete from public.staff_users s
using public.profiles p
where p.id = s.user_id
  and s.role = 'staff'
  and upper(coalesce(p.role, '')) = 'PLAYER'
  and coalesce(p.is_admin, false) = false;
