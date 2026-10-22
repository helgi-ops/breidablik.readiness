# Bug brief — team strength-send forces the "PDF context" MD instead of Auto (week_plans)

## Symptom

The team "Send to player's app" pushed **MD-4** to players when today is **MD-1** (match tomorrow). The MD
logic and data are correct — `week_plans` for the team has today = TRAIN and tomorrow = GAME, so `fetchMdContext`
returns **MD-1**. The wrong value comes from an **override**, not from the auto-detection.

## Root cause

`src/app/coach/strength/page.tsx` uses **one control — the "PDF context" dropdown (`pdfMdContext`)** — to drive
**two** actions:

1. the PDF preview/export (its intended job), and
2. the **live team-send**: the send builds `md: mdParam` from `pdfMdContext` (page.tsx ~171–184) and POSTs it to
   `/api/coach/team/send-strength-sessions`, where a non-empty `md` becomes `mdContextOverride`. In
   `fetchMdContext`, **any override short-circuits the `week_plans` lookup** and is returned as-is.

So when the coach sets "PDF context" to MD-4 (e.g. to preview a PDF) and then clicks "Send to player's app",
the whole team is silently forced to **MD-4**, ignoring the correct **MD-1** from `week_plans`. `pdfMdContext`
defaults to `"AUTO"` (→ no override → correct), so this only triggers once the dropdown has been moved — which
is easy to do and gives no warning. The send button even reads "Push today's prescribed session (${pdfMdContext})",
showing the PDF control's value rather than the MD that will actually be sent.

## Immediate workaround (no code)

Set the "PDF context" dropdown back to **Auto** and re-send → `fetchMdContext` reads `week_plans` → correct MD-1.

## Fix

**Decouple the live team-send from the PDF-preview control.**

- The team-send must default to **Auto (week_plans via `fetchMdContext`)** — it should not inherit
  `pdfMdContext`. Send `md: undefined` unless the coach makes an explicit, separate override choice on the send
  action itself.
- If a per-send MD override is still wanted, give it its **own** control on the send flow, defaulting to
  **Auto**, clearly labelled as overriding the schedule — not the PDF dropdown.
- **Make the send honest:** the button/confirmation should show the **actual MD that will be sent** (the
  auto-detected value, e.g. "MD-1"), computed the same way `fetchMdContext` does, not `pdfMdContext`. Ideally
  confirm: "Send MD-1 session (from this week's plan) to N players?"
- Keep the PDF-context dropdown scoped to the **PDF** only.

Optional hardening: when an override is active and it disagrees with the `week_plans`-derived MD, surface a
warning ("You're overriding the schedule: plan says MD-1, you selected MD-4") before sending — the same
divergence-surfacing principle used elsewhere.

## Acceptance

- Team "Send to player's app" sends the **week_plans-derived MD** by default (MD-1 in this case); the PDF-context
  dropdown no longer affects the live send.
- Any send-time MD override is an explicit, separate, Auto-defaulted choice, and the send UI shows the real MD
  it will push (not the PDF control's value); a mismatch between an override and the schedule is warned before
  sending.
- No regression to the PDF export path. Lint + typecheck clean; a test covers "Auto send with a GAME tomorrow →
  MD-1 (override not leaked from PDF control)".

Ref: `src/app/coach/strength/page.tsx` (`pdfMdContext`, the send `fetch` ~171–184, button text ~695),
`src/app/api/coach/team/send-strength-sessions/route.ts` (`parseMdOverride`, `mdContextOverride`),
`src/lib/micropulse/strengthProgramming/loader.ts` (`fetchMdContext` — override short-circuits `week_plans`).
