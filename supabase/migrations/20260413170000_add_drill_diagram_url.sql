-- Add diagram_url column to drill_library for storing drill diagram/image paths
ALTER TABLE drill_library ADD COLUMN IF NOT EXISTS diagram_url text;
