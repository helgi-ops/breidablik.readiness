"use client";

/**
 * LiteTierBanner — friendly explanation shown at the top of pages that
 * require Catapult B2-3 efforts data when the active team is on Lite tier.
 *
 * Mounted by /coach/decel-intelligence, /coach/indoor-load, /coach/quadrant.
 * The page underneath still renders so the coach can see the empty layout
 * and understand exactly what they're missing — better than redirecting
 * away (which feels like the link is broken).
 *
 * Auto-detects tier client-side via the get_catapult_data_tier RPC. Returns
 * null when tier is 'full' (or unknown — fail open here, the sidebar already
 * hides the link so anyone landing here directly is most likely a coach
 * checking what they'd unlock).
 */

import * as React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

type Props = {
  /** Short label of the page being gated, e.g. "Decel Intelligence". */
  feature: string;
  /** What the coach is missing — one short sentence in Icelandic. */
  reasonIs: string;
  /** Same in English (rendered when coach picks EN). */
  reasonEn: string;
};

export default function LiteTierBanner({ feature, reasonIs, reasonEn }: Props) {
  const [tier, setTier] = React.useState<"full" | "lite" | "unknown">("unknown");
  const [lang, setLang] = React.useState<"IS" | "EN">("IS");

  React.useEffect(() => {
    // Best-effort lang detection. The app uses a `lang` localStorage key
    // managed by useLang(), but we read it directly to avoid pulling the
    // hook into a server-component-friendly file.
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("micropulse.lang");
      if (stored === "EN" || stored === "IS") setLang(stored);
    }

    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data: auth } = await sb.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) return;
        const { data: prof } = await sb
          .from("profiles").select("team_id").eq("id", userId).maybeSingle();
        const teamId = (prof as { team_id?: string | null } | null)?.team_id ?? null;
        if (!teamId) return;
        const { data } = await sb.rpc("get_catapult_data_tier", { p_team_id: teamId });
        if (!alive) return;
        const t = String(data ?? "").toLowerCase();
        setTier(t === "full" ? "full" : t === "lite" ? "lite" : "unknown");
      } catch {
        if (alive) setTier("unknown");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (tier !== "lite") return null;

  const en = lang === "EN";

  return (
    <div className="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="text-2xl leading-none">⚠️</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-amber-900">
            {en
              ? `${feature} requires a higher Catapult plan`
              : `${feature} krefst hærri Catapult-pakka`}
          </div>
          <p className="mt-1 text-sm text-amber-900">
            {en ? reasonEn : reasonIs}
          </p>
          <p className="mt-2 text-xs text-amber-800">
            {en
              ? "Contact your Catapult account manager to enable B2-3 acceleration/deceleration efforts and full IMA bands. The page below stays empty until that data starts flowing."
              : "Hafðu samband við Catapult account manager til að virkja B2-3 acceleration/deceleration efforts og full IMA bönd. Síðan að neðan helst tóm þangað til þau gögn byrja að renna inn."}
          </p>
        </div>
      </div>
    </div>
  );
}
