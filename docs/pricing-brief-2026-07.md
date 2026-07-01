# MicroPulse — Pricing Brief (working template, July 2026)

> Purpose: gather the **real market inputs** so pricing is *grounded, not guessed*.
> The green rows are verified from the product/code. The **`____` blanks are yours
> to fill** (from sales conversations, your costs, competitor data). Take the
> filled-in version to Cowork / a pricing advisor / the clubs — do **not** ask any
> AI for the numbers with the blanks empty; it will confidently guess, which is the
> exact failure mode to avoid.

---

## 0. The one structural fact to fix first (verified in code)

MicroPulse has **two independent axes**, but today one tier ladder conflates them:

| Axis | Values | What it controls |
|---|---|---|
| **Plan / access** | FREE · PRO · ELITE | which *features* you may use (subscription) |
| **Catapult data tier** | Lite (Core: sRPE + efforts) · Full (Pro/Vector: IMA) | what data your hardware *physically sends* |

The word **"Lite" is used for both** — a price *and* a data shape. That is why the
gating feels invisible. **Any pricing story must separate these two axes** (price
follows *access*; data richness is explained separately, not baked into the price
name). This is the highest-confidence recommendation in this brief.

---

## 1. Segments (verified) — who are we pricing for?

| Segment | What they have | Size / note | Willingness to pay (fill) |
|---|---|---|---|
| **PT / personal trainers** | sRPE + client app, no full Catapult | (Lite is the **biggest** Iceland segment) | €`____` /mo |
| **Lite / Core clubs** | Catapult Core (sRPE + efforts + HSR, **no IMA**) | ~12 Iceland clubs | €`____` /mo |
| **Pro clubs** | Full Catapult GPS + IMA | fewer, higher value | €`____` /mo |
| **Elite / serious S&C dept.** | Pro + want LV/VBT + per-client depth | needs a **named buyer** | €`____` /mo |

Beachhead: **Iceland / KSÍ**. Anchor pricing to what *this* market pays, not US/UK.

---

## 2. Cost model — the price FLOOR (fill these in)

Price can't go below what a team costs to serve. Per active team, per month:

| Cost line | €/team/mo |
|---|---|
| Catapult API / integration cost | `____` |
| LLM (Anthropic) — AI summaries, narratives, ask | `____` |
| Hosting / Supabase / infra (per team share) | `____` |
| Support time (your hours × rate ÷ teams) | `____` |
| **≈ Floor per team** | **`____`** |

> Rule of thumb: a healthy SaaS gross margin wants price ≥ ~4–5× the direct serve
> cost. If a Lite club costs €X to serve, €129 only works if X is well under ~€30.

---

## 3. Competitor / anchor prices (fill from research)

| Reference | Price | Notes |
|---|---|---|
| Catapult subscription (what the club already pays for hardware/OpenField) | `____` | MicroPulse sits *on top* — so it's an add-on to an existing spend |
| What Iceland clubs pay now for S&C tooling (if anything) | `____` | |
| Nearest alternative (spreadsheet / other analytics / nothing) | `____` | "nothing" is the real competitor for most |
| A serious S&C dept's tooling budget (VALD, etc.) | `____` | anchors the Elite number |

---

## 4. Current pricing (baseline to react to)

Free €0 · Lite €129 · Pro €349 · Elite €1250 — **4 tiers.** The audit called this
"too many for the stage" and the gating "invisible." Both are addressable without
necessarily cutting to two — the real issue is §0 (clarity), not the count.

---

## 5. Structure options — pick one, then fill the numbers

**Option A — Two products + Elite add-on (my recommended shape):**
- **MicroPulse PT/Lite** (€`____`) — trainers + Core/Lite clubs. Volume play.
- **MicroPulse Pro** (€`____`) — full-Catapult clubs. The verdict + explanation layer on rich data.
- **Elite = add-on on Pro** (€`____`) — LV/VBT + per-client S&C depth, with a *named outcome*. Not a mysterious top tier.
- **Free = trial/demo** (Sýnisliðið), a funnel, not a permanent product.
- *Pro:* honest, matches the two products that already exist. *Con:* need to make the "Lite data ≠ Lite plan" distinction crisp in the UI (already started: LiteTierBanner + UpgradeWall).

**Option B — Keep 4 tiers, fix the story:**
- Same Free/Lite/Pro/Elite, but every locked surface says *why* it's locked (plan vs data) and Elite gets a named buyer + outcome.
- *Pro:* least disruption. *Con:* still conflates the two axes in the tier names.

**Option C — Usage/seat-based:**
- Price per active player or per coach seat.
- *Pro:* scales with value delivered. *Con:* harder to sell to small clubs; needs the usage data (now accruing) to model.

---

## 6. Decision questions (answer these before setting numbers)

1. Is the goal **land-and-expand** (cheap Lite to win the ~12 clubs, upsell later) or **value-capture** (charge Pro clubs what the insight is worth)?
2. What is the **named outcome** that justifies Elite (€1250-ish)? Who is the exact buyer?
3. Is MicroPulse an **add-on to Catapult spend** (so it competes with "nothing extra") or a **standalone** value?
4. Do you want price to follow **access** (features) or **data richness** — and how do you keep those visibly separate (§0)?
5. What does the **usage data** (now collecting at `/coach/usage-analytics`) say people actually use? Revisit in ~4–6 weeks before locking tiers.

---

## 7. How to use this

1. Fill every `____` from real inputs (sales calls, your costs, competitor research).
2. *Then* hand the filled brief to Cowork / a pricing advisor and ask for **structure + trade-offs**, not "tell me the price."
3. Compare their framing with Option A above — don't trust either blindly.
4. Sanity-check against the cost floor (§2) and the usage data (§6.5).

*The numbers are a market decision and yours to own. This brief just makes sure
whoever helps is working from real inputs, not guesses.*
