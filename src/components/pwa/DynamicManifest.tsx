"use client";

/**
 * DynamicManifest
 *
 * Replaces the static <link rel="manifest"> with a dynamic URL that includes
 * the team_id so the /api/manifest route can return club-specific branding for
 * ELITE teams.
 *
 * Must be rendered inside a client boundary. Placed in RootLayout alongside
 * RegisterServiceWorker.
 */

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function DynamicManifest() {
  useEffect(() => {
    async function updateManifest() {
      try {
        const supabase = getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        let manifestUrl = "/api/manifest";

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("team_id")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.team_id) {
            manifestUrl = `/api/manifest?team_id=${encodeURIComponent(profile.team_id)}`;
          }
        }

        // Find or create the <link rel="manifest"> tag and point it to the
        // dynamic URL so the browser picks up the correct branding on install.
        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "manifest";
          document.head.appendChild(link);
        }
        link.href = manifestUrl;
      } catch {
        // Non-critical — keep whatever static manifest the server rendered
      }
    }

    void updateManifest();
  }, []);

  return null;
}
