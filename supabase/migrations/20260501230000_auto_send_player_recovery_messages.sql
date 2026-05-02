-- A.Stig 2 — Auto-send opt-in for AI player recovery messages.
--
-- Adds:
--   * team_settings.auto_send_player_recovery_messages — when TRUE on an
--     ELITE team, the auto-send orchestrator generates + delivers the AI
--     recovery message immediately after a notification fires (skipping
--     coach review). Defaults FALSE so existing teams stay on Stig 1's
--     coach-review flow until they explicitly opt in.
--   * coach_notifications.auto_sent — flips TRUE when the auto-send path
--     (vs. the manual coach-draft path) was the sender. Used by the
--     coach UI to render "🤖 Auto-sent" instead of "✓ AI sent" so the
--     coach knows it bypassed their inbox.
--
-- Both columns are nullable-default-false rather than NOT NULL so the
-- migration is safe on existing rows without a backfill window.

ALTER TABLE public.team_settings
  ADD COLUMN IF NOT EXISTS auto_send_player_recovery_messages boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.team_settings.auto_send_player_recovery_messages IS
  'ELITE-only: when TRUE, threshold-crossing notifications are answered by an auto-generated AI player message without coach review.';

ALTER TABLE public.coach_notifications
  ADD COLUMN IF NOT EXISTS auto_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coach_notifications.auto_sent IS
  'TRUE when the player_message_id was created by the auto-send orchestrator (Stig 2) rather than a coach drafting manually (Stig 1).';

-- Quick lookup of auto-sent notifications for stats / dashboards.
CREATE INDEX IF NOT EXISTS coach_notifications_auto_sent_team_idx
  ON public.coach_notifications (team_id, auto_sent)
  WHERE auto_sent = true;
