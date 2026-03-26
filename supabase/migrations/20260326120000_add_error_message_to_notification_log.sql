-- Add error_message column to checkin_notification_log.
-- This column stores the error detail when status = 'failed' or 'skipped_no_token'.
-- The application code (completeNotificationLog) already writes to this field;
-- it was missing from the original table schema, causing an update error on every
-- failed or skipped notification attempt.

ALTER TABLE checkin_notification_log
  ADD COLUMN IF NOT EXISTS error_message text;
