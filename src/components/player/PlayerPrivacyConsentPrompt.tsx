"use client";

/**
 * PlayerPrivacyConsentPrompt — a soft, on-open consent prompt.
 *
 * If the player has NO active `data_processing` consent, this shows a modal at
 * app open explaining what data is processed and why, with an "I agree" button
 * that records the consent. It is deliberately NOT a hard gate: the player can
 * choose "Later" and keep using the app, but the prompt re-appears on the next
 * open until consent is given (no localStorage dismissal — consent is a legal
 * decision, not a nudge to be permanently silenced).
 *
 * It reuses the existing consent system (player_consents + its audit trigger)
 * rather than inventing a parallel "accepted" flag — accepting here is the same
 * record the self-service Privacy panel reads and lets the player revoke. Self-
 * contained: resolves the player from auth, so it drops into any player shell.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { DataProcessingSummary } from "@/components/legal/DataProcessingSummary";
import { CURRENT_POLICY_VERSION, policyVersionSatisfies } from "@/lib/legal/policyVersion";

type Status = "loading" | "needed" | "ok";

export default function PlayerPrivacyConsentPrompt() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [status, setStatus] = useState<Status>("loading");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) return; // not signed in yet — leave in "loading" (renders null)
        const { data: prof } = await supabase
          .from("profiles").select("player_id").eq("id", userId).maybeSingle();
        const pid = (prof as { player_id?: string | null } | null)?.player_id ?? null;
        if (!pid) { if (alive) setStatus("ok"); return; } // not a player (coach/staff) → nothing to prompt

        const { data: consents } = await supabase
          .from("player_consents")
          .select("valid_from, valid_to, revoked_at, policy_version")
          .eq("player_id", pid)
          .eq("consent_type", "data_processing")
          .is("revoked_at", null);
        const now = Date.now();
        // Satisfied only by an in-window consent to the CURRENT policy version —
        // a consent to an older version no longer counts (triggers re-consent).
        const active = (consents ?? []).some((c) => {
          const row = c as { valid_from: string | null; valid_to: string | null; policy_version: string | null };
          const vf = row.valid_from ? new Date(row.valid_from).getTime() : 0;
          const vt = row.valid_to ? new Date(row.valid_to).getTime() : Number.POSITIVE_INFINITY;
          return vf <= now && vt >= now && policyVersionSatisfies(row.policy_version);
        });

        let minor = false;
        try {
          const { data: m } = await supabase.rpc("is_minor", { p_player_id: pid });
          minor = m === true;
        } catch { /* minor check is optional */ }

        if (!alive) return;
        setPlayerId(pid);
        setIsMinor(minor);
        setStatus(active ? "ok" : "needed");
      } catch {
        // Never block the app on a check failure — fail open.
        if (alive) setStatus("ok");
      }
    })();
    return () => { alive = false; };
  }, []);

  const accept = useCallback(async () => {
    if (!playerId) return;
    setSaving(true); setErr(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;

      // Record the fresh consent at the current policy version.
      const { error } = await supabase.from("player_consents").insert({
        player_id: playerId,
        consent_type: "data_processing",
        granted_by_profile_id: userId,
        granted_by_relationship: "self",
        source: "app_prompt",
        policy_version: CURRENT_POLICY_VERSION,
      });
      if (error) throw error;

      // Supersede any prior active data_processing consent (an older version, or
      // a pre-versioning NULL one) so exactly one active row stands — the audit
      // log keeps the full history. Best-effort: never fail the accept on this.
      try {
        const { data: prior } = await supabase
          .from("player_consents")
          .select("id, policy_version")
          .eq("player_id", playerId)
          .eq("consent_type", "data_processing")
          .is("revoked_at", null);
        const staleIds = (prior ?? [])
          .filter((c) => !policyVersionSatisfies((c as { policy_version: string | null }).policy_version))
          .map((c) => (c as { id: string }).id);
        if (staleIds.length > 0) {
          await supabase.from("player_consents")
            .update({ revoked_at: new Date().toISOString() })
            .in("id", staleIds);
        }
      } catch { /* superseding is housekeeping — the new consent already stands */ }

      setStatus("ok");
    } catch {
      setErr(isIS ? "Gat ekki vistað samþykki. Reyndu aftur." : "Could not save consent. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [playerId, isIS]);

  if (status !== "needed" || dismissed) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-3 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {isIS ? "Friðhelgi" : "Privacy"}
        </div>
        <h2 className="mt-0.5 text-lg font-bold tracking-tight text-zinc-900">
          {isIS ? "Samþykki fyrir gagnavinnslu" : "Consent to data processing"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
          {isIS
            ? "Áður en þú notar appið biðjum við um samþykki þitt fyrir vinnslu gagnanna þinna. Þú ræður og getur afturkallað hvenær sem er."
            : "Before you use the app, we ask for your consent to process your data. You're in control and can revoke it at any time."}
        </p>

        <div className="mt-3">
          <DataProcessingSummary lang={isIS ? "IS" : "EN"} isMinor={isMinor} />
        </div>

        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-[13px] font-semibold text-[#2740e6] hover:underline"
        >
          {isIS ? "Sjá fulla útgáfu →" : "Read the full version →"}
        </a>

        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={accept}
            disabled={saving}
            className="flex-1 rounded-xl bg-[#1c7a4a] px-4 py-2.5 text-sm font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            {saving ? (isIS ? "Vista…" : "Saving…") : (isIS ? "Ég samþykki" : "I agree")}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 active:opacity-80"
          >
            {isIS ? "Seinna" : "Later"}
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400">
          {isIS ? "Þú getur haldið áfram án samþykkis, en við minnum þig á næst." : "You can continue without consenting, but we'll remind you next time."}
        </p>
      </div>
    </div>
  );
}
