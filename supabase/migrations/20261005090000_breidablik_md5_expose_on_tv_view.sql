-- The MD-5 strength templates were seeded into breidablik_football_karlar_microdose_templates
-- (MD-4 FORCE minus one set) but the owning custom_template_sets rows never listed 'MD-5' in md_days,
-- so the locker-room TV view (DisplayClient) — which builds its MD-day dropdown from md_days — never
-- showed them. Append 'MD-5' so the already-seeded rows become selectable. Idempotent.
update custom_template_sets
set md_days = array_append(md_days, 'MD-5')
where table_name = 'breidablik_football_karlar_microdose_templates'
  and not ('MD-5' = any(md_days));
