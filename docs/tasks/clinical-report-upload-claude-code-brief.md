# Claude Code task — upload a physio/clinical report and have the system read it

Paste to Claude Code (or `@docs/tasks/clinical-report-upload-claude-code-brief.md`).

## Goal
A coach/medical user uploads a physiotherapy report (PDF) for a player. The system **reads it**,
extracts the clinically meaningful structure, shows it for human confirmation, and — once approved —
files it into the player's data so it drives the injury log, a risk/asymmetry watch-list, the
return-to-training plan, and the IMA left/right cross-check. Real example this is modelled on:
"Sjúkraþjálfaraskýrsla – HFK.pdf" (Hlynur Freyr Karlsson, Breiðablik, by a licensed physio) —
sections: prior injury history, current status, clinical assessment, summary + individualized
prevention program + "match fitness" return-to-play note.

## Governance (read first — this is health data + AI extraction)
- **Human-in-the-loop, always.** AI proposes the extraction; a coach/medical user reviews and edits
  every field before anything is committed. Clinical data is NEVER auto-written from AI output.
- **AI labelled as AI, cites its source.** Each extracted field links back to the sentence/section
  it came from, and the record is stamped "extracted by AI from <file>, confirmed by <user> on <date>".
  Rules/clinicians decide; AI only reads and suggests (manifesto principle #1 + #5).
- **The clinician's note is authoritative.** The system surfaces and monitors against it; it must
  never override or "recompute over" a licensed physio's assessment. Store clinician name, licence,
  clinic, and report date as provenance.
- **Sensitive data.** Treat as health/PHI: restrict access to medical/coach staff for that team
  (reuse `coaches_team()`), store the PDF in a private bucket (not public Logos), and keep it out of
  any player-facing surface unless explicitly shared.

## Flow
1. **Upload** — on the player profile (and/or a "Clinical reports" panel in the Integrations/medical
   area). Accept PDF. Store the file in a private Supabase Storage bucket; record an
   `clinical_reports` row (see schema below).
2. **Read** — extract text from the PDF (these reports have a real text layer — use a text
   extractor, not OCR; fall back to OCR only if no text layer). Runtime `nodejs`.
3. **Extract (AI)** — send the text to an LLM with a strict JSON schema (below). The prompt must
   handle **Icelandic** medical language and preserve **side** (hægri/vinstri → right/left).
4. **Review** — show the parsed structure in an editable form next to the original text; user
   confirms/edits. Nothing is written to injury/risk tables until confirm.
5. **Commit** — on confirm: insert injury-history rows, risk/asymmetry flags, prevention targets,
   and a return-to-play/match-fitness note; link the stored PDF as provenance.
6. **Surface** — a "Physio note" card on the player profile (verdict-style: one-line status +
   the prevention focus + "view full report"), and feed the return-to-training plan
   (`docs/tasks/return-to-training-plan-claude-code-brief.md`) and the IMA L/R balance view.

## Upload-before-player-exists (needed now)
Hlynur isn't in the system yet (arriving in a day or two). Allow uploading a report **unlinked**:
store it with `player_name_raw` + `team_id` and `player_id = null`; when a matching player is
created, auto-suggest linking (match on name within team, confirm). So the physio note is ready the
moment his profile exists.

## Extraction schema (target JSON)
```json
{
  "player_name": "Hlynur Freyr Karlsson",
  "report_date": "2026-07-07",
  "clinician": { "name": "Særún Jónsdóttir", "licence": "löggiltur sjúkraþjálfari",
                 "clinic": "Sjúkraþjálfunin Sporthúsinu", "email": "…" },
  "injury_history": [
    { "body_part": "Groin / pubic bone", "side": "right", "type": "Bone edema (lífbein)",
      "approx_duration": "~4 months out", "status": "returned ~end Feb, occasional mild symptoms" },
    { "body_part": "Achilles", "side": "right", "type": "Chronic tendon pain",
      "duration": "~2 years", "status": "ongoing; left Achilles emerging ~6 months, milder" },
    { "body_part": "Hamstring", "side": "right", "type": "Old mild strain (~2y ago)", "status": "resolved-ish, symmetric strength" }
  ],
  "current_status": "Largely symptom-free; regular training last weeks; no match load yet",
  "clinical_findings": [
    { "finding": "Reduced ankle dorsiflexion (knee-to-wall)", "side": "right" },
    { "finding": "Weaker calf", "side": "right" },
    { "finding": "Valgus tendency, single-leg & landings", "side": "right", "location": "knee" },
    { "finding": "Poorer hop distance & landing control (Triple/Crossover Hop)", "side": "right" }
  ],
  "prevention_targets": ["ankle ROM (R)", "calf strength (R)", "push-off / big-toe function",
                          "single-leg knee control / landings / COD", "ongoing load management"],
  "return_to_play": { "status": "cleared for full football, monitor groin/Achilles",
                       "match_fitness": "needs sensible progression into match minutes — long since regular match play" }
}
```
Keep the raw extracted text and the model's per-field source spans for the "cite the source" UI.

## Data model (suggested)
- `clinical_reports` (id, team_id, player_id nullable, player_name_raw, report_date, clinician_name,
  clinician_licence, clinic, file_path, raw_text, extracted_json jsonb, status
  enum('uploaded','extracted','confirmed'), uploaded_by, confirmed_by, created_at). Migration under
  `supabase/migrations/` + `apply_migration`.
- On confirm, write into existing `injury_events` / `player_injuries` (reuse them; the injury-type
  vocabulary should include head/soft-tissue/bone types — coordinate with
  `docs/tasks/add-concussion-injury-type-claude-code-brief.md`). Store `side` and link
  `source_clinical_report_id`.
- Risk/asymmetry flags: either a small `player_risk_flags` table (player_id, flag, side, source_report_id,
  created_at) or a jsonb on the report surfaced on the profile. Keep it simple.

## API / files (suggested)
- `POST /api/coach/clinical-reports` (multipart) — store PDF + create row; `nodejs` runtime.
- `POST /api/coach/clinical-reports/[id]/extract` — text-extract + LLM → `extracted_json`.
- `POST /api/coach/clinical-reports/[id]/confirm` — write confirmed rows to injury/risk tables + link.
- `src/lib/clinical/extractReport.ts` — PDF text extraction + LLM call + schema validation (zod).
- `src/components/clinical/ClinicalReportUpload.tsx` + `PhysioNoteCard.tsx` (profile surface).

## The high-value payoff (build the hook, even if v1 is just display)
The physio flags **right-side** deficits (ankle ROM, calf, knee valgus, hop). MicroPulse already
tracks IMA **left/right balance** (the V/H axis in Match Movement) and directional signatures. On
the physio-note card, show the clinical asymmetry next to his actual on-pitch L/R IMA split:
"Physio: right-side deficit → his IMA shows X% more load on the left." Either it corroborates the
assessment or flags a mismatch worth a look. This is the explainability loop and the reason to
structure the extraction rather than just attach a PDF.

## Acceptance criteria
- Uploading the sample report produces a correctly-parsed, Icelandic-aware extraction (right vs left
  preserved; groin/pubic-bone, right Achilles chronic, right-side clinical findings, match-fitness note).
- Nothing is written to injury/risk tables until a human confirms; every committed field cites its
  source text and is stamped AI-extracted + confirmed-by.
- A report can be uploaded before the player exists and auto-links on player creation.
- The physio note appears on the player profile with provenance and feeds the return-to-training plan;
  the IMA L/R comparison renders (even if read-only in v1).
- PDF stored privately, access team-scoped to medical/coach staff; `npx tsc`/`eslint` clean; migration
  saved under `supabase/migrations/`; stage specific files (no `git add -A`).
