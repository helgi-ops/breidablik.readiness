# Date of birth → age-gated consent

**Status:** proposed. Small, but it touches child-data protection, so precision matters
more than speed.

## Why this is not just "add a field"

The coach has made accepting the privacy policy a requirement for players. But **a minor
cannot give valid consent to the processing of health / biometric data themselves** — a
guardian must. Right now the app records the player's own acceptance and has no way to
tell who is under 18. So for any minor in a squad, the consent on file is likely invalid,
and nothing surfaces that.

**Date of birth is the field that reveals who is a minor.** Without it the age-gate cannot
run at all. The risk is not collecting DOB — it is *not* collecting it, because then the
guardian-consent machinery that already exists never fires for the players it was built for.

The infrastructure is already in place (added 2026-07-15). `player_consents` has:
`granted_by_relationship`, `granted_by_full_name`, `granted_by_contact`,
`granted_by_profile_id`, `policy_version`. This is a guardian-consent system waiting for
a trigger. DOB is the trigger.

**Not legal advice.** The exact age threshold and what counts as valid consent depend on
Icelandic law + GDPR. Confirm with a qualified person / DPO before relying on it. The
standard in sport is: under 18 → guardian consent for health/biometric data. Build the
mechanism; let the club set the threshold.

## Schema

Add to `players`:

```
date_of_birth date null    -- nullable: existing players have none yet
```

Migration must be saved as a timestamped `.sql` under `supabase/migrations/` (CLAUDE.md).
Treat DOB as sensitive personal data — it is minimised (one field, used only to derive age)
and should never appear in logs, URLs, or analytics.

Derive age in one shared helper, never inline:

```
CONSENT_MAJORITY_AGE = 18   // single named constant; the club can change it

ageYears(dob, asOf = today): number | null
isMinor(dob, asOf = today): boolean | null   // null = DOB unknown
```

`null` (DOB unknown) must be treated as **"cannot confirm adult"** — i.e. do NOT let an
unknown-DOB player self-consent as if adult. Unknown age blocks self-consent and asks for
DOB first. Absence of data is not permission — same discipline as the rest of the system.

## The consent gate

At the point a player accepts the policy:

1. **DOB missing** → require DOB before consent can be recorded. "We need your date of
   birth to know who must confirm this — you or a parent/guardian."
2. **Age ≥ 18** → self-consent, as today. Record `granted_by_relationship = 'self'`.
3. **Age < 18** → self-acceptance is NOT sufficient. Route to guardian consent: capture
   `granted_by_full_name`, `granted_by_contact`, `granted_by_relationship = 'guardian'`
   (or 'parent'), and record who granted it. The minor may still acknowledge in-app, but
   the VALID consent record is the guardian's.

Store `policy_version` on every consent so a later policy change can require re-consent.

## What must NOT happen

- **Do not let an under-18 self-consent silently.** That is the exact failure this exists
  to prevent. If age < 18 and only a self-consent exists, the player's data-processing
  consent is **incomplete** — surface it, do not treat it as granted.
- **Do not block training-load capture retroactively** without a decision from the club —
  flag incomplete consent to the coach/operator rather than deleting data. Whether to pause
  processing for a minor without guardian consent is the club's call, not an automatic one.
- **Do not compute or store age band anywhere it leaks** (URLs, third-party analytics).

## Bonus (secondary, do not let it drive the design)

Once DOB exists it can auto-fill the age tier the goal recommender already uses
(`pt_client_goals.age`), and later feed maturation-aware load (adolescent growth-spurt
injury window). Useful — but the age-gated consent is the reason to build it. Ship the
consent gate first; the training-science uses can follow.

## Surface it in data-quality

Add a check to the data-quality surface (`dataQuality.ts` family): players with **DOB
unknown** or **under-18 with only self-consent** are a compliance gap, not a training gap.
Report them to the coach/operator the same way missing feeds are — the system should tell
you where consent is incomplete, on day one, not when someone asks.
