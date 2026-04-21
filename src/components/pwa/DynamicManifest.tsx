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
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function DynamicManifest() {
  const pathname = usePathname();

  useEffect(() => {
    async function updateManifest() {
      try {
        const supabase = getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        const params = new URLSearchParams();

        // Detect if we're on the coach page → use coach-specific manifest
        if (window.location.pathname.startsWith("/coach")) {
          params.set("role", "coach");
        }

        let teamLogoUrl: string | null = null;

        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("team_id")
            .eq("id", user.id)
            .maybeSingle();

          if (profile?.team_id) {
            params.set("team_id", profile.team_id);

            // Fetch club logo for apple-touch-icon / favicon override
            const { data: team } = await supabase
              .from("teams")
              .select("plan_tier, club_logo_url")
              .eq("id", profile.team_id)
              .maybeSingle();

            if (team?.plan_tier === "ELITE" && team.club_logo_url) {
              teamLogoUrl = team.club_logo_url;
            }
          }
        }

        const manifestUrl = `/api/manifest${params.toString() ? `?${params.toString()}` : ""}`;

        // Find or create the <link rel="manifest"> tag and point it to the
        // dynamic URL so the browser picks up the correct branding on install.
        let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "manifest";
          document.head.appendChild(link);
        }
        link.href = manifestUrl;

        // Also update apple-touch-icon and favicon if team has a custom logo.
        // iOS Safari uses apple-touch-icon for "Add to Home Screen", not the manifest.
        if (teamLogoUrl) {
          let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
          if (!appleIcon) {
            appleIcon = document.createElement("link");
            appleIcon.rel = "apple-touch-icon";
            document.head.appendChild(appleIcon);
          }
          appleIcon.href = teamLogoUrl;

          let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
          if (!favicon) {
            favicon = document.createElement("link");
            favicon.rel = "icon";
            document.head.appendChild(favicon);
          }
          favicon.href = teamLogoUrl;
        }
      } catch {
        // Non-critical — keep whatever static manifest the server rendered
      }
    }

    void updateManifest();
  }, [pathname]);

  return null;
}
