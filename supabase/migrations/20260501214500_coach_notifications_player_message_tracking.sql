-- Track AI-drafted player recovery messages sent in response to a
-- notification. When a coach clicks "Draft AI message" on a flagged
-- notification, the resulting player_coach_messages row is linked back
-- here so:
--   (a) coach UI can show "✓ Message sent at HH:MM" instead of the
--       draft button
--   (b) we don't accidentally double-send (UNIQUE on player_message_id)
--   (c) admin can audit which notifications triggered AI outreach

ALTER TABLE public.coach_notifications
  ADD COLUMN IF NOT EXISTS player_message_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS player_message_id uuid
    REFERENCES public.player_coach_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coach_notifications_player_message_id_uniq
  ON public.coach_notifications(player_message_id)
  WHERE player_message_id IS NOT NULL;

COMMENT ON COLUMN public.coach_notifications.player_message_sent_at IS
  'Set when the coach sends an AI-drafted recovery message to the flagged '
  'player via /coach/notifications. ELITE feature — null on FREE/PRO.';

COMMENT ON COLUMN public.coach_notifications.player_message_id IS
  'FK to the player_coach_messages row created when the coach approved '
  'and sent an AI-drafted recovery message. Null until the coach sends.';
