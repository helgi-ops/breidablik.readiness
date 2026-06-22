# Strategic options — continue, sell to Catapult, or sell to another buyer

> **Not financial/M&A advice** — a thinking aid. Numbers are illustrative orders
> of magnitude, not a valuation.

## Situation (June 2026)

- **3 clubs using MicroPulse, 6 weeks, on a free trial. ~2 weeks left.** Plus
  Breiðablik (your own). So this is NOT "one user" — it's real engagement from
  three external clubs.
- The three are **Þór Ak (Vector Core), Afturelding (Lengjudeild), Grindavík
  (Lengjudeild)** — i.e. **lower data tiers than Breiðablik (Pro S7)**. They do
  NOT get the full IMA Driver depth.
- All three are **men's teams**. So the "club = 2 teams (M+W)" reach in the GTM
  plan is **expansion potential, not automatic** — the proven adopter is the
  men's side. Treat each club's women's team as the natural **land-and-expand**
  upsell once the men's team pays (same contact, same setup): convert the men's
  subscription now, offer the women's team as an add-on.
- Still **zero paid** — but that is about to be tested, on a clear deadline.

This is better traction than a pure prototype. But usage ≠ willingness to pay.
The next two weeks resolve that.

### Why the lower-tier mix is a STRENGTH, not a problem

The worry ("they don't have Breiðablik's data access") is actually the most
valuable thing about this trial. The open question about the whole market was
whether MicroPulse delivers value **below Pro S7** — and Core + Lengjudeild is
**12 of the 16 target clubs**, the bulk of the market. These three engaging for
six weeks on lower tiers is live proof the "degrades gracefully" thesis holds.
For a Catapult acquisition this is exactly the breadth they care about (their
whole base, not just elite clubs).

### Implication for the conversion pitch (important)

Do NOT prove value to these three with the **Breiðablik** case study — it shows
IMA Driver depth (jumps, decel bands, the Anton story) they cannot get on their
tier. Showing them features they can't access can backfire ("we don't get that").
Anchor the conversion on **their own 6 weeks of usage** and the tier-appropriate
value they actually received: readiness / load management, ACWR, unfamiliar-load
on the GPS metrics they do have, and the plain-language triage. This is exactly
where the load-verdict + **confidence** work pays off — lower coverage shows lower
confidence honestly, which keeps the lower-tier product trustworthy.

## Trial status snapshot (verified from their own data, June 2026)

All three have **GPS external load (distance / HSR / player load) AND active
player readiness check-ins** — but **0% IMA, 0% max-velocity** on the Catapult
side (confirmed in data). So the product they actually use = GPS load + readiness
check-ins, minus the IMA Driver depth. Pitch BOTH the load management and the
readiness/check-in value (which they're actively using), not just GPS.

| Club | Tier | GPS last upload | Check-in last | Engagement | Status | Next step |
|------|------|-----------------|---------------|-----------|--------|-----------|
| **Grindavík** | Lengjudeild | 17 Jun ✅ | 21 Jun ✅ | both active | **Hot** | Paid offer + `Grindavik-thinar-6-vikur.pdf` |
| **Þór Ak** | Core | 14 Jun ✅ | 21 Jun ✅ | both active (826 check-ins, strongest) | **Warm/hot** | Paid offer + `Thor-thinar-vikur.pdf` (Ágúst hook) |
| **Afturelding** | Lengjudeild | **27 May** ⚠️ | **20 Jun** ✅ | check-ins active; GPS upload stopped | **Active, NOT churned** | Re-engage convo (`docs/afturelding-exit-interview.md`) |

**Afturelding is NOT churned (corrected).** Players are still checking in (172 in
June). What stopped is the **manual Catapult CSV export** — verified in
`external_load_uploads`: last upload 28 May (the 27 May Grindavík game, committed
cleanly, 0 errors), then zero upload *attempts*. Not a bug — nobody fed the
pipeline. The manual per-match export is the fragile link; the player check-in
habit survived on its own.

Conversion artifacts built from each club's OWN data:
- Grindavík: weekly load picture + top-load players + a data-quality catch
  (flagged an implausible ~6M m distance row).
- Þór: weekly load + Ágúst Hlynsson carrying ~37% more total load than the next
  player (a concrete "who needs managing" insight). Strongest check-in compliance.
- Afturelding: re-engage — "your GPS upload stopped after the 27 May game while
  your players kept checking in; want me to make the Catapult import automatic?"

**Two product notes that fell out of this (retention-critical):**
1. **Automate Catapult ingest (API sync)** — the #1 retention fix. GPS must not
   depend on a coach remembering to export a CSV after every match (the
   Afturelding pattern will repeat across clubs). This is upstream of everything.
2. **Data-freshness / pipeline-health alert** — "team X has no GPS in N days" /
   "no check-ins in N days." We had to SQL this manually to notice Afturelding's
   GPS went stale 3+ weeks ago; the system should surface it automatically.

**The single most valuable signal:** all three are the cheapest, biggest market
segment, and they cleared the *hard* adoption bar (20+ players checking in
mid-season). If Grindavík or Þór pays, it proves the low tier is monetizable —
the strongest possible validation result.

## The pivotal event — convert the 3 clubs (next 2 weeks)

Everything below depends on one thing: **do these 3 clubs pay when the free trial
ends?** That single outcome is worth more than any feature or analysis. It is
upstream of all three strategic options.

- **If 1–3 convert to paid** → you have proof of willingness-to-pay. You move from
  "talented coach with a prototype" to "early product with paying customers."
  This raises BOTH the independent-business case AND any acquisition price.
- **If 0 convert** → that is the most valuable thing you can learn right now.
  Either the value isn't worth money to them, the price/packaging is wrong, or the
  buyer (coach vs budget owner) is wrong. Find out *why* in an exit interview — it
  redirects everything.

Do not let the trial lapse silently. Two weeks out, put a clear paid offer in
front of each club (use `MicroPulse-borgud-prufa-tilbod.pdf`), anchored on what
they actually used: "over 6 weeks you opened it N times and it flagged X — here's
what continuing costs." Silence = a free extension by default, which teaches you
nothing.

## Option A — Continue independently

- **What it is:** keep MicroPulse as your own business serving Icelandic (and
  maybe Nordic) football.
- **Requires:** the 3 clubs converting, then working the GTM plan
  (`MicroPulse-utbreidsluplan-Catapult-Island.pdf`) — Pro S7 first, then Core,
  then Lengjudeild. Discipline on solo-founder time (you're also a coach).
- **Upside:** you own it; modest but real Iceland business; optionality to sell
  later from a stronger position.
- **Reality:** small market (17 clubs). A sustainable lifestyle/side business, not
  a venture-scale one — unless you take the core product international.

## Option B — Sell to Catapult

- **Why them:** you're built on their data and you fill a known weakness (OpenField
  is data-rich but coach-unfriendly; you're the decision/explainability layer).
  Classic platform-buys-its-ecosystem-app tuck-in.
- **Value today (≈0 paid):** acqui-hire territory — low hundreds of thousands to a
  few million USD, weighted toward retention/earnout (you join them), often with
  a real chance they just rebuild it instead (build-vs-buy is tempting at zero
  revenue).
- **What moves the number up an order of magnitude:** paying clubs + retention.
  Three converted, retained clubs change the story from "buy code" to "buy
  traction + the person who gets clubs to adopt." The 2-week conversion is the
  single biggest lever on this price.
- **Leverage:** the best negotiating position is "I'm fine continuing on my own."
  An independent business that doesn't need them is worth more to them.
- **Watch-outs:** confirm IP is clean (sole author; Catapult API terms OK); they
  hold platform leverage over you, so negotiate from traction, not dependency.

## Option C — Sell to another buyer

- **Who:** a Catapult competitor wanting a coach-facing layer (STATSports,
  Playermaker, etc.); a broader athlete-management platform (Smartabase/Teambuildr
  type); or a Nordic sports-tech consolidator.
- **Pros:** competitive tension can raise price; a buyer NOT named Catapult may
  value the "works on top of the incumbent's data" angle as a wedge into Catapult's
  base.
- **Cons:** most of your build is Catapult-specific, so a non-Catapult buyer must
  re-point it at their data — lowers the tech value, shifts it toward acqui-hire +
  domain expertise again.
- **Use:** mainly as leverage. Even a soft second conversation makes a Catapult
  deal more competitive.

## The throughline

All three options are worth materially more with paying customers. You don't have
to choose the path now — you have to **resolve the conversion**, because it
improves every path simultaneously:

```
Convert the 3 clubs (next 2 weeks)
        │
        ├─► A: proof you have a real business
        ├─► B: "buy traction" not "acqui-hire a prototype"
        └─► C: credible alternative → negotiating leverage
```

## Next 2 weeks — concrete

1. For each of the 3 clubs, build a **"your 6 weeks" one-pager from THEIR OWN
   data** (logins/usage + what the system flagged for them, in tier-appropriate
   terms). This — not the Breiðablik case study — is the proof that converts them.
   Keep the Breiðablik case study for the Pro S7 prospects (Stjarnan/HK/ÍA) later.
2. Anchor each conversion ask on that club's own usage and the value they actually
   received on their tier.
3. Present the **paid offer** to all three before the trial ends; ask for a yes/no
   with a start date, not "let's stay in touch."
4. For any "no", run a 15-minute **exit interview** (why not? price? who decides?
   what was missing?) — that's the real product/market signal.
5. Hold off on new features until the conversion resolves. Building more right now
   doesn't change the answer.

## After the deadline

- **≥1 paid** → you have leverage. Decide A vs B/C from strength; if exploring a
  sale, open a low-key Catapult conversation with the traction in hand.
- **0 paid** → don't panic-build. Use the exit interviews to fix price/buyer/
  packaging and re-test, or treat it as the signal to pivot toward the
  acqui-hire/IP-sale conversation with Catapult while the product is fresh.
