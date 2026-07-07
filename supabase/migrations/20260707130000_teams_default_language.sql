-- Club/team default UI language. Applied by applyTeamDefaultLanguage() when a
-- coach has NOT manually picked a language on their browser, so a club can
-- default to e.g. English regardless of the per-browser toggle. A manual toggle
-- still always wins.
alter table public.teams
  add column if not exists default_language text
  check (default_language in ('IS', 'EN'));

comment on column public.teams.default_language is
  'Club default UI language (IS/EN); applied when a coach has not manually chosen a language on their browser. NULL = no club default (browser toggle decides).';

-- The immediate need: Afturelding should default to English.
update public.teams set default_language = 'EN' where name ilike '%afturelding%';
