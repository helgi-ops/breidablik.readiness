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
import { verifyTerraSignature, mapTerraSleep, mapTerraDaily } from "@/lib/wearables/terra";

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
      const deviceLabel = user.provider ? `${user.provider} via Terra` : "Terra";

      // One active wearable source per player: drop other active Stack-A providers…
      await deactivateOtherActiveWearables(sb, profileId, "terra");
      // …and revoke a legacy direct-Whoop (Stack B) link, if any.
      const playerId = await resolveProfilePlayerId(sb, profileId);
      if (playerId) await revokeLegacyDirectWhoop(sb, playerId);

      const { data: existing } = await sb
        .from("wearable_connections")
        .select("id")
        .eq("profile_id", profileId)
        .eq("provider", "terra")
        .maybeSingle();

      let connectionId: string | null = (existing as { id: string } | null)?.id ?? null;
      if (connectionId) {
        await sb
          .from("wearable_connections")
          .update({ provider_user_id: terraUserId, device_label: deviceLabel, is_active: true, last_sync_error: null })
          .eq("id", connectionId);
      } else {
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
        connectionId = (inserted as { id: string } | null)?.id ?? null;
      }

      // Backfill recent sleep/daily via REST (fire-and-forget).
      if (connectionId) void syncConnection(connectionId);
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
      const conn = await findActiveTerraConnection(sb, terraUserId);
      if (!conn) return ok(); // no destination (not yet authed / inactive) → ignore
      const playerId = await resolveProfilePlayerId(sb, conn.profile_id);
      if (!playerId) return ok(); // profile not linked to a player → nowhere to store
      const ctx = { playerId, connectionId: conn.id, provider: "terra" as const };

      if (type === "sleep") await persistSleepNights(sb, ctx, mapTerraSleep(payload.data));
      else await persistDailySummaries(sb, ctx, mapTerraDaily(payload.data));

      await sb.from("wearable_connections").update({ last_synced_at: new Date().toISOString() }).eq("id", conn.id);
      return ok();
    }

    // activity / body / athlete / healthcheck / large_request_* → acknowledged.
    return ok();
  } catch (e) {
    // Surface a 500 (not a silent 200) so Terra retries and the payload history
    // shows the failure for debugging.
    return NextResponse.json({ error: e instanceof Error ? e.message : "Terra webhook error" }, { status: 500 });
  }
}
