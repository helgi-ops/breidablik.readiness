# Afturelding — re-engagement conversation (NOT an exit)

> **Corrected June 2026.** Afturelding did **not** churn. Players are still
> checking in (172 check-ins in June, last 20 Jun). What stopped is the **manual
> Catapult GPS export** — last upload 28 May (the 27 May Grindavík game),
> committed cleanly, then zero upload attempts since (verified in
> `external_load_uploads`). Not a bug — nobody fed the GPS pipeline. So this is a
> re-engagement / friction-fix conversation, not a goodbye.

## What the data actually says

- **Check-ins:** Apr 50 · May 430 · **Jun 172** (last 20 Jun). Healthy, ongoing.
- **GPS uploads:** Apr 191 rows · May 125 (last 27 May) · **Jun 0**. Stopped.
- The GPS uploads were per-match CSVs ("ctr-report-leikur-…", "md2",
  "leiknir-vs-afturelding") — a manual export after each game. High friction;
  once they stopped bothering after the 27 May game, it just ended.

So the player habit (app check-in) is sticky; the coach habit (manual Catapult
export after every match) is fragile. That's the whole lesson.

## The conversation — friction fix, not a sale pitch

> "Hæ — leikmennirnir ykkar eru enn að checka inn (flott!), en ég tók eftir að
> GPS-gögnin hafa ekki komið inn síðan eftir Grindavíkur-leikinn 27. maí. Mig
> grunar að það sé bara af því að það þarf að flytja út úr Catapult handvirkt
> eftir hvern leik. Viljið þið að ég geri það sjálfvirkt svo þið þurfið ekki að
> hugsa um það?"

Lead with helping, not selling. They're already engaged; remove the friction and
they likely continue — and that becomes a paying conversion.

## Questions to ask

1. Did the manual Catapult export just become a hassle, or was there another
   reason it stopped? (Listen — this confirms friction vs something deeper.)
2. Are the players' check-ins useful to you on their own? (They liked it — find
   out what specifically.)
3. If GPS came in automatically (no manual export), would you keep using both?
4. Who exports the Catapult data — and do they have time for it during the season?
5. Honest question: would you pay to keep this going? What would it need to be
   worth it?

## What each answer means

- "Just a hassle to export" → **friction (fixable).** This is the expected answer.
  Fix = automate the Catapult ingest → strong conversion candidate.
- "We rely on the check-ins, GPS was secondary" → readiness is the value for them;
  sell that, GPS is a bonus when automated.
- "We wouldn't pay" → a clean no on the GPS side, but check whether they'd pay for
  the readiness/check-in layer alone.

## The product takeaway (bigger than Afturelding)

This is the case study for **automating the Catapult import (API sync)** — the #1
retention fix. If GPS depends on a coach manually exporting a CSV after every
match, the Afturelding pattern repeats at every club. Also add a **data-freshness
alert** ("no GPS in N days") so a stalled pipeline surfaces automatically instead
of being found by hand. Both are in `docs/strategic-options.md` → product notes.
