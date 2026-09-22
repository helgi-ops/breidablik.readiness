-- Coaching Library — record uploaded media SIZE + DURATION so the library can show a
-- storage footprint and enforce a duration cap. Content/knowledge surface — no readiness coupling.
alter table public.coach_media add column if not exists bytes bigint;
alter table public.coach_media add column if not exists duration_s numeric;
