-- Add Icelandic description column + populate bilingual exercise explanations.
-- The full UPDATE payload (91 exercises × EN/IS detailed descriptions) was loaded
-- via execute_sql in batches; this records the schema change. Re-run safe.
alter table exercise_library add column if not exists description_is text;
-- Descriptions seeded separately (see exercise_descriptions data load).
