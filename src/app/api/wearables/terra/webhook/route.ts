/**
 * POST /api/wearables/terra/webhook
 *
 * Terra (tryterra.co) webhook receiver — Phase 1 (Whoop). This is the URL the
 * Terra dashboard Destination points at. It verifies the `terra-signature` HMAC,
 * then:
 *   - `auth`            → create/activate the player's Terra connection (storing the
 *                          Terra user_id), enforce one active wearable source
 *                          (incl. revoking a legacy direct-Whoop source), and fire a
 *                          REST backfill of recent sleep/daily.
 *   - `deauthentication`→ mark the connection inactive.
 *   - `sleep` / `daily` → map + upsert via the shared wearables sinks (Stack A).
 *   - anything else     → acknowledged and ignored.
 *
 * Terra needs a 200 to consider a webhook delivered; a bad/absent signature is
 * rejected with 401. Recovery/sleep/HRV are SIDE signals beside the check-in —
 * this route never writes the readiness colour.
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getWearableAdminClient,
  resolveProfilePlayerId,
  persistSleepNights,
  persistDailySummaries,
  deactivateOtherActiveWearables,
  syncConnection,
} from "@/lib/wearables/sync";
import {
  verifyTerraSignature,
  mapTerraSleep,
  mapTerraDaily,
  aggregateTerraActivitiesByDate,
  mergeActivityDaily,
  type TerraActivityDaily,
} from "@/lib/wearables/terra";

type TerraUser = { user_id?: string; reference_id?: string; provider?: string };
type TerraPayload = { type?: string; status?: string; user?: TerraUser; data?: unknown };

const ok = () => NextResponse.json({ ok: true });

async function findActiveTerraConnection(sb: SupabaseClient, terraUserId: string) {
  const { data } = await sb
    .from("wearable_connections")
    .select("id, profile_id")
    .eq("provider", "terra")
    .eq("provider_user_id", terraUserId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { id: string; profile_id: string } | null) ?? null;
}

/**
 * Dedupe across stacks: if the player had a legacy DIRECT Whoop link (Stack B,
 * `athlete_integrations`), revoke it so only the Terra source feeds this player.
 * Best-effort — that table may not exist in every environment.
 */
async function revokeLegacyDirectWhoop(sb: SupabaseClient, playerId: string): Promise<void> {
  try {
    await sb
      .from("athlete_integrations")
      .update({ status: "revoked" })
      .eq("athlete_id", playerId)
      .eq("provider", "whoop")
      .eq("status", "active");
  } catch {
    /* table absent / not provisioned here — nothing to dedupe */
  }
}

/**
 * Create or activate the player's Terra connection from a `reference_id` (profiles.id)
 * + Terra user_id. Enforces one active wearable source (deactivates other Stack-A
 * providers + revokes a legacy direct-Whoop). Used by the `auth` event AND as a
 * lazy fallback on data events — Terra's synthetic "Generate test data" streams
 * sleep/daily with a `reference_id` but no `auth`, so without this no connection
 * is ever created and the data is dropped.
 */
async function ensureTerraConnection(
  sb: SupabaseClient,
  profileId: string,
  terraUserId: string,
  provider?: string,
): Promise<{ id: string; profile_id: string } | null> {
  const deviceLabel = provider ? `${provider} via Terra` : "Terra";

  // The reference_id must be one of OUR profiles (wearable_connections.profile_id
  // FKs profiles.id). A synthetic/test user whose reference_id isn't a real profile
  // is dropped gracefully here rather than crashing on the FK.
  const { data: prof } = await sb.from("profiles").select("id").eq("id", profileId).maybeSingle();
  if (!prof) return null;

  await deactivateOtherActiveWearables(sb, profileId, "terra");
  const playerId = await resolveProfilePlayerId(sb, profileId);
  if (playerId) await revokeLegacyDirectWhoop(sb, playerId);

  const { data: existing } = await sb
    .from("wearable_connections")
    .select("id")
    .eq("profile_id", profileId)
    .eq("provider", "terra")
    .maybeSingle();

  if (existing) {
    const id = (existing as { id: string }).id;
    await sb
      .from("wearable_connections")
      .update({ provider_user_id: terraUserId, device_label: deviceLabel, is_active: true, last_sync_error: null })
      .eq("id", id);
    return { id, profile_id: profileId };
  }

  const { data: inserted } = await sb
    .from("wearable_connections")
    .insert({
      profile_id: profileId,
      provider: "terra",
      provider_user_id: terraUserId,
      access_token: "", // Terra pushes via webhook — no per-user token to store
      refresh_token: null,
      scopes: [],
      device_label: deviceLabel,
      is_active: true,
    })
    .select("id")
    .single();
  const id = (inserted as { id: string } | null)?.id ?? null;
  return id ? { id, profile_id: profileId } : null;
}

export async function POST(req: Request) {
  const secret = process.env.TERRA_SIGNING_SECRET ?? "";
  const rawBody = await req.text();

  // Verify signature. If no secret is configured: reject in production, but allow
  // unsigned in non-prod so local/dev testing works.
  if (secret) {
    if (!verifyTerraSignature(rawBody, req.headers.get("terra-signature"), secret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Terra webhook not configured" }, { status: 500 });
  }

  let payload: TerraPayload;
  try {
    payload = JSON.parse(rawBody) as TerraPayload;
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const type = String(payload.type ?? "").toLowerCase();
  const user = payload.user ?? {};
  const terraUserId = user.user_id ?? null;
  const sb = getWearableAdminClient();

  try {
    // ── Auth: a player connected a wearable through the Terra widget ──────────
    if (type === "auth") {
      const profileId = user.reference_id ?? null;
      if (!profileId || !terraUserId) return ok(); // can't map → acknowledge + ignore
      const conn = await ensureTerraConnection(sb, profileId, terraUserId, user.provider);
      // Backfill recent sleep/daily via REST (fire-and-forget).
      if (conn) void syncConnection(conn.id);
      return ok();
    }

    // ── Deauth: player disconnected on the provider/Terra side ───────────────
    if (type === "deauth" || type === "deauthentication" || type === "connection_error") {
      if (terraUserId) {
        await sb
          .from("wearable_connections")
          .update({ is_active: false })
          .eq("provider", "terra")
          .eq("provider_user_id", terraUserId);
      }
      return ok();
    }

    // ── Data: sleep / daily ──────────────────────────────────────────────────
    if (type === "sleep" || type === "daily") {
      if (!terraUserId) return ok();
      let conn = await findActiveTerraConnection(sb, terraUserId);
      // Lazy-create from reference_id when no auth event arrived first (synthetic
      // test data, or a data event that beat the auth webhook).
      if (!conn && user.reference_id) conn = await ensureTerraConnection(sb, user.reference_id, terraUserId, user.provider);
      if (!conn) return ok(); // no destination → ignore
      const playerId = await resolveProfilePlayerId(sb, conn.profile_id);
      if (!playerId) return ok(); // profile not linked to a player → nowhere to store
      const ctx = { playerId, connectionId: conn.id, provider: "terra" as const };

      if (type === "sleep") await persistSleepNights(sb, ctx, mapTerraSleep(payload.data));
      else await persistDailySummaries(sb, ctx, mapTerraDaily(payload.data));

      await sb.from("wearable_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
      return ok();
    }

    // ── Activity: workouts → player_external_load_daily (source='terra') ─────
    // A labelled session-load row (duration + HR, GPS distance when present; no
    // Catapult PlayerLoad from a watch). Stored + available; NOT swept into the
    // ACWR/load source filters (that's a separate opt-in).
    if (type === "activity") {
      if (!terraUserId) return ok();
      let conn = await findActiveTerraConnection(sb, terraUserId);
      if (!conn && user.reference_id) conn = await ensureTerraConnection(sb, user.reference_id, terraUserId, user.provider);
      if (!conn) return ok();
      const playerId = await resolveProfilePlayerId(sb, conn.profile_id);
      if (!playerId) return ok();
      const { data: p } = await sb.from("players").select("team_id").eq("id", playerId).maybeSingle();
      const teamId = (p as { team_id?: string } | null)?.team_id ?? null;
      if (!teamId) return ok();

      const byDate = aggregateTerraActivitiesByDate(payload.data);
      for (const [date, agg] of byDate) {
        // Merge with any existing terra row for this player+date (accumulate across
        // multiple workouts / separate webhooks on the same day).
        const { data: existing } = await sb
          .from("player_external_load_daily")
          .select("session_duration_minutes, total_distance, avg_heart_rate, max_heart_rate, hr_zone_4_time_s, hr_zone_5_time_s, raw_payload_json")
          .eq("player_id", playerId)
          .eq("date", date)
          .eq("source", "terra")
          .maybeSingle();

        let merged = agg;
        let priorRaws: unknown[] = [];
        if (existing) {
          const ex = existing as Record<string, unknown>;
          const rp = ex.raw_payload_json as { activities?: unknown[] } | null;
          priorRaws = Array.isArray(rp?.activities) ? rp!.activities! : [];
          const exDaily: TerraActivityDaily = {
            date,
            durationMin: (ex.session_duration_minutes as number | null) ?? null,
            distanceM: (ex.total_distance as number | null) ?? null,
            avgHr: (ex.avg_heart_rate as number | null) ?? null,
            maxHr: (ex.max_heart_rate as number | null) ?? null,
            hrZone4Sec: (ex.hr_zone_4_time_s as number | null) ?? null,
            hrZone5Sec: (ex.hr_zone_5_time_s as number | null) ?? null,
            raws: [],
          };
          merged = mergeActivityDaily(exDaily, agg);
        }

        const perMin = merged.durationMin && merged.durationMin > 0 && merged.distanceM != null
          ? Number((merged.distanceM / merged.durationMin).toFixed(3))
          : null;

        await sb.from("player_external_load_daily").upsert(
          {
            player_id: playerId,
            team_id: teamId,
            date,
            source: "terra",
            session_duration_minutes: merged.durationMin,
            total_distance: merged.distanceM,
            player_load: null, // no Catapult PlayerLoad from a watch
            total_player_load: null,
            player_load_per_minute: perMin,
            avg_heart_rate: merged.avgHr,
            max_heart_rate: merged.maxHr,
            hr_zone_4_time_s: merged.hrZone4Sec,
            hr_zone_5_time_s: merged.hrZone5Sec,
            raw_payload_json: { provider: "terra", activities: [...priorRaws, ...agg.raws] },
          },
          { onConflict: "player_id,date,source" }
        );
      }
      return ok();
    }

    // body / athlete / healthcheck / large_request_* → acknowledged.
    return ok();
  } catch (e) {
    // Surface a 500 (not a silent 200) so Terra retries and the payload history
    // shows the failure for debugging.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Terra webhook error" }, { status: 500 });
  }
}
