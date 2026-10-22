# MicroPulse — Pricing strategy (competitive benchmark + recommendation, June 2026)

Companion to `docs/micropulse-product-audit-2026-06.md` §1. Grounds the audit's "four tiers is too
many / Elite needs a narrative / stop competing with Catapult" points in **real competitor prices**,
then gives a concrete new pricing architecture.

> Honesty note: firm public prices exist for TeamBuildr, TrueCoach, Catapult One, VALD and the
> Smartabase floor. Elite AMS (Smartabase, Kitman) and the GPS "team" tiers are mostly quote-based;
> those are ranges. All FX at ≈ €1 = $1.09 = 150 ISK (check spot before quoting).

---

## 1. The competitive landscape (what comparable services charge)

| Category | Company | Public price | What it tells us |
|---|---|---|---|
| **Elite AMS (the ceiling)** | Smartabase (Teamworks) | **$5,000+/month** (~€55k/yr) | Elite/pro & federations only; this is the top of the market |
| | Kitman Labs | Quote-only, enterprise | Elite; opaque |
| **Athlete monitoring (the floor)** | AthleteMonitoring (FITSTATS) | Per-athlete/month, volume discounts, free tier (quote) | Cheap, scalable "monitoring" baseline |
| | Metrifit | Team platform quote; Lifestyle module €99/yr | Consumer-ish add-on cheap; team = custom |
| **Team GPS (already-paid hardware)** | Catapult One – Team | **$180 / player / year** (2-yr, min 10) | A 25-man squad ≈ **$4,500/yr just for Catapult** |
| | STATSports Apex | ~£180/athlete hardware; Coach app free | Hardware-led; software thrown in |
| **Force plates** | VALD ForceDecks | **$2,900/yr** (all-in, 3-yr) | The "all-inclusive subscription" benchmark coaches accept |
| **S&C coaching software** | TeamBuildr | **$90–$280/mo → $900–$2,800/yr** (by athlete count); AMS add-on $50/mo | The direct comp for MicroPulse **Lite/Club** |
| | TrueCoach (1-on-1 PT) | **$26 (5) / $64 (20) / $129 (50) per month** | The comp for MicroPulse **solo-coach** |

**Two anchors to remember:**
- The **S&C-software band is ~$900–$2,800/yr** (TeamBuildr). That's the reference for the Lite/PT side.
- A club on Catapult **already spends ~$4,500/yr** on a 25-man squad. That reframes the Pro price:
  MicroPulse is a % on top of a spend they've already justified — and it's a rounding error next to
  Smartabase's $55k/yr.

---

## 2. Where MicroPulse sits today (honest read)

Current: **Free €0 / Lite €129 / Pro €349 / Elite €1250 per month** (+ a €70 line).

| Tier | €/yr | Verdict vs market |
|---|---|---|
| **Lite €129/mo** | ~€1,550/yr | Mid-to-upper in the TeamBuildr band. Defensible **because you do more** (readiness + sRPE load + LV/VBT + PR engine). But there's **no cheaper on-ramp** for a solo coach — you lose the TrueCoach-$26 buyer entirely. |
| **Pro €349/mo** | ~€4,200/yr | Well below Smartabase; roughly one squad's Catapult spend. Defensible for a pro/academy club **if you sell the decision layer**, not parallel dashboards. |
| **Elite €1250/mo** | ~€15,000/yr | Too big as a flat number with no story. Only rational as **multi-team / academy / federation**. Still far under Smartabase — so the number can work, but only with the right buyer named. |

The pricing itself isn't wildly wrong. The problems are **structure and story**: four tiers, invisible
gating, a scary flat Elite, and value gated on Catapult-mirror dashboards instead of on your moat.

---

## 3. Recommended architecture — two products, ~two paid tiers each

Collapse the ladder into **two products that match your two buyers**, each with a clear on-ramp and a
clear ceiling. Stop selling a single 4-rung ladder.

### Product A — **MicroPulse Coach** (the Lite / PT / small-club strength product)
Value metric: **athlete-count band** (the category norm — matches TeamBuildr/TrueCoach, easy to grok).

| Tier | Who | Suggested price | Anchored to |
|---|---|---|---|
| **Free / 30-day trial** | Solo coach trying it | €0 | Acquisition only — not a permanent 15-player free tier |
| **Coach** | Solo PT / S&C, ≤ ~20 athletes | **€39–49/mo** (annual ≈ €390–490/yr) | Above TrueCoach ($64) because you add readiness + load science |
| **Club** | One squad, unlimited athletes | **€99–129/mo** (annual ≈ €990–1,290/yr) | At TeamBuildr's top ($2,800/yr) but with the science layer — keep your €129 here |

### Product B — **MicroPulse Team** (the Pro club product, on top of Catapult)
Value metric: **per squad, annual, flat** (clubs hate a second per-athlete meter stacked on Catapult).

| Tier | Who | Suggested price | Anchored to |
|---|---|---|---|
| **Team** | One senior squad on Catapult | **€299–349/mo** (~€3,600–4,200/yr) | A modest % of their Catapult spend; keep €349 |
| **Academy / Federation** | Multi-team club, academy, or a federation (KSÍ-style) | **from ~€899/mo or €12–18k/yr, quote-based** — base team + per-additional-team | Replaces the flat "Elite €1250"; far below Smartabase's $55k |

This gives the **Elite/Academy tier its narrative** (the audit's ask): the buyer is a *federation or a
multi-team academy*, the outcome is *every team on one explainable standard + league/association
reporting*, and the price is *a fraction of Smartabase*.

---

## 4. Packaging — gate the moat, not the Catapult mirrors

The audit's biggest pricing insight: **don't paywall the Catapult-mirror dashboards** (Decel/IMA/HSR/
Indoor). Those are undifferentiated; hiding them just confuses Lite clubs. Instead, **bundle the
analytics by default and gate the differentiated value**: the explainable verdict, the RPE/readiness
engine, week-planning/periodization, and multi-team/federation reporting.

| Capability | Coach | Club | Team (Pro) | Academy/Fed |
|---|---|---|---|---|
| Readiness verdict + explainability | ✓ | ✓ | ✓ | ✓ |
| sRPE load, ACWR, Foster, quadrant | ✓ | ✓ | ✓ | ✓ |
| Strength: PlanBuilder, LV/VBT, PR engine | ✓ | ✓ | ✓ | ✓ |
| Catapult GPS + FMP/IMA analytics (all of it) | — | — | ✓ | ✓ |
| Week Setup / load plan / periodization | basic | ✓ | ✓ | ✓ |
| Indoor IMU mode | — | ✓ | ✓ | ✓ |
| Multi-team dashboards + federation/KSÍ reporting | — | — | — | ✓ |
| Per-team tunable thresholds (see audit §1) | — | ✓ | ✓ | ✓ |

Every locked item shows **"Included in Plan X — here's what it does"** (fixes the invisible-gating
problem from the audit).

---

## 5. Positioning line (use this in sales)

> "You already invest ~€4–5k a year in Catapult hardware and data. MicroPulse adds the layer Catapult
> doesn't: the **explainable daily verdict** — who's ready and why, in plain language, traceable to the
> data — for a fraction of that spend, and a fraction of a Smartabase licence."

That single sentence justifies the Pro price and kills the "why not just use OpenField?" objection.

---

## 6. Localisation, terms & mechanics

- **Currency:** show **ISK to Icelandic clubs** (your beachhead), **EUR internationally**. €349 ≈
  52,000 ISK/mo. Consider a **slightly lower ISK price to seed the home market** (reference customers
  > margin, early on).
- **Annual over monthly:** bill annual by default (2 months free, à la TeamBuildr); it stabilises cash
  and cuts churn. Offer 2–3-yr terms with a discount (VALD/TeamBuildr both do).
- **Value metric discipline:** Coach = athlete bands; Team = per-squad flat. Don't mix — mixed meters
  are the #1 reason SaaS pricing pages confuse buyers.
- **No permanent free tier** beyond a thin solo/trial — it complicated the current ladder for little
  acquisition gain.
- **Founder/pilot pricing:** for the first ~10 clubs, a named "pilot" rate (e.g. −40% for a
  testimonial + case study) is worth more than list price — you need reference logos, not margin, now.

---

## 7. Migration from the current 4 tiers

1. Map existing customers: current Lite → **Club**; current Pro → **Team**; current Elite → **Academy**.
2. **Grandfather** existing prices for 12 months; move new sign-ups to the new structure immediately.
3. Rebuild `src/app/pricing/page.tsx` as **two product columns** (Coach / Team), each with 2 tiers +
   "talk to us" for Academy. Delete the €70 orphan line.
4. Ship the "what unlocks this" banners on gated surfaces (ties to audit §3 tier-gating UX).

---

## 8. What to validate before locking prices (be skeptical)

- **Willingness to pay:** interview 5 target clubs — would they pay €349/mo *on top of* Catapult? The
  answer sets whether Team is €299 or €399.
- **Your real cost-to-serve** per club (support + hosting) — I can't see this; it sets the floor.
- **The Academy/Federation buyer exists in Iceland** (KSÍ, academies) — confirm one warm lead before
  building that tier's story.
- Elite AMS and GPS "team" numbers here are ranges from public sources; get one real Catapult club
  invoice to sharpen the "% of Catapult spend" pitch.
