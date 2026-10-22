# Garmin → Terra → MicroPulse — setup checklist (owner)

Goal: get real resting-HR + sleep from a Garmin (you own an Approach S62) into MicroPulse, via Terra —
without buying a Whoop. Garmin needs **your own company developer app** (approval required), but — unlike
Whoop — **no device-ownership requirement**. The MicroPulse code side is already built (Terra Phase 2).

## 1. Apply to the Garmin Connect Developer Program  ⏳ (do first — approval takes time)
- https://developer.garmin.com/gc-developer-program/ → request access (or the Contact form).
- This is the **Health/Wellness API** program Terra integrates with (resting HR, sleep, HRV where the
  device supports it). Approval is a review step — can take days; start now.
- (Not the Connect IQ SDK, not the Health SDK for native apps — those are different.)

## 2. Create the Garmin app + get keys  (after approval)
- In the Garmin developer console, create a Connect API app.
- Copy the **Consumer Key + Consumer Secret** (OAuth).
- Set the **callback/redirect URL** to the one Terra gives you (on the subdomain in step 3) — this must
  match or Garmin rejects sign-in.

## 3. Terra dashboard → Garmin source → "Add Credentials"  (~10 min once you have the app)
- **Domain:** a subdomain you own + can edit DNS, e.g. `garmin.micropulse.is`. Terra gives you DNS
  (CNAME) records → add them at your DNS host for `micropulse.is` → wait for verification.
- **App keys:** paste the Garmin Consumer Key + Secret.
- **Go live.**
- Choose **"Your company's app"** (you set it up once; players just sign in to Garmin).

## 4. Connect your own Garmin (real-data test)
- In the MicroPulse player app → Settings → Connections → "Connect watch" → pick Garmin → sign in to
  **your own** Garmin Connect account → authorize. (No credential sharing; you sign in yourself.)
- Terra sends the `auth` webhook → a `wearable_connections` (terra) row is created, and sleep/daily start
  flowing. The S62 gives **resting HR + sleep** (golf watch → likely no HRV-status / recovery score).

## 5. Verify
- Ask Claude (here) to check Supabase: `wearable_connections`(terra) + `wearable_sleep_data` /
  `wearable_daily_data` rows for your player id. Boundary: this is recovery/sleep side-data — it never
  touches the readiness colour.

## Notes
- **Polar** showed as Terra-managed in your dashboard (no own-app needed) — if any players use Polar, that
  is the zero-setup option for real data.
- **Whoop** needs you to own a Whoop device to even create the dev app — skip unless you buy one.
- Apple Health / Samsung / Google Fit = "SDK Required" (native mobile SDK) — not viable for the PWA.
- The pipeline is already proven end-to-end with Terra synthetic test data (sleep landed for Arnór
  Tristan), so there's no rush — this is about real data.
