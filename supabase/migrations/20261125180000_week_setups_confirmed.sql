-- Micro cycle: the coach confirms the week ("Confirm week → players"). The confirmation is when and by whom;
-- "changed since" is read by comparing it with the week's week_plans / coach_week_setup updated_at.
-- Additive only: existing rows stay unconfirmed (null). No notification is sent (user's call 2026-11-25).
alter table public.week_setups
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null;

comment on column public.week_setups.confirmed_at is 'When the coach confirmed the week in Micro (Confirm week → players). Null = not confirmed.';
comment on column public.week_setups.confirmed_by is 'The coach who confirmed the week.';
