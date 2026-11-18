-- The language the player uses the app in (2026-11-18, review item D). See docs/session-delivery-model.md.
--
-- Strength sessions are stored in one language (player_today_strength_override.structure). Until now that was the
-- coach's UI language for a hand send and always English for the 09:00 automatic send, so an Icelandic player got
-- English exercise names. The player's app reports its language here (PUT /api/player/language, written only when
-- it changes); every send builds the stored session in it. Null = not known yet → the send's own fallback.
-- Written only by the server (service role). Not a setting the coach changes.

alter table public.players
  add column if not exists app_language text check (app_language in ('EN', 'IS'));

comment on column public.players.app_language is
  'Language the player uses the app in (EN/IS), reported by the player app. Sends build the stored session in it.';
