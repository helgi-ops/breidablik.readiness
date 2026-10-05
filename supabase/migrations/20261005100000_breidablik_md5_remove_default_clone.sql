-- Revert the default-table MD-5 clone: MD-5 already exists (the lighter version) in the Breidablik
-- custom set, so the MD-4→MD-5 clones added to the default microdose_templates were redundant. Remove
-- only those clones (identified by the title prefix set when they were inserted).
delete from microdose_templates
where team_id = '94b52a06-0b83-48da-8664-639ec3486a0c'
  and md_day = 'MD-5'
  and title like 'MD-5 (snemma í viku) ·%';
