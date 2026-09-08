-- Ground the Achilles protocol's citations: add Maffulli (terminology, midportion/
-- insertional distinction, pathology, rupture management) + the honest adjuncts
-- note. The loading base (Alfredson/Silbernagel/Kongsgaard-Beyer) + Baar are
-- already present. Weight landmark/consensus over sheer volume; adjuncts mixed →
-- clinician-decided. Idempotent: skips if Maffulli is already cited.
UPDATE public.recovery_protocols
SET
  citations = COALESCE(citations, '[]'::jsonb) || '[
    { "label": "Maffulli, Khan & Puddu 1998 - Overuse tendon conditions: time to change a confusing terminology (use tendinopathy, not tendinitis/tendinosis)", "source": "Arthroscopy" },
    { "label": "Maffulli et al. - midportion vs insertional Achilles tendinopathy + failed-healing pathology (reviews); Achilles rupture management (operative vs conservative, percutaneous repair) + functional rehabilitation", "source": "review / rupture-management body of work" },
    { "label": "Adjuncts (ESWT / PRP / high-volume / sclerosing): evidence mixed - clinician-decided, not core to loading rehab; Steffen/Baar 2023 - Achilles differs transcriptionally from patellar (keep it its own track)", "source": "mixed evidence / J Physiol" }
  ]'::jsonb,
  updated_at = now()
WHERE slug = 'achilles_tendinopathy_staged_loading'
AND citations::text NOT LIKE '%Maffulli%';
