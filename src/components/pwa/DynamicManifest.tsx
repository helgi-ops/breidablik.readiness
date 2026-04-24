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
        //
        // Implementation notes:
        // - Next.js auto-injects MULTIPLE <link rel="icon"> tags (one for the
        //   src/app/favicon.ico file, another from metadata.icons.icon). If we
        //   only update the first one, the browser may still pick the other
        //   for the tab favicon. So we remove ALL existing icon-related links
        //   and add fresh ones pointing to the team logo.
        // - Browsers cache favicons aggressively and often ignore href changes
        //   on existing <link> tags. Removing+recreating the tag (and adding a
        //   cache-buster query param) forces a refetch.
        if (teamLogoUrl) {
          const cacheBuster = `?v=${encodeURIComponent(teamLogoUrl).slice(-12)}`;
          const hrefWithBust = teamLogoUrl + (teamLogoUrl.includes("?") ? "&" : "") + `t=${cacheBuster.slice(3)}`;

          // Remove every favicon-class link tag the page may have inherited
          // from Next.js auto-injection or from a previous run of this effect.
          document
            .querySelectorAll<HTMLLinkElement>(
              'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"], link[rel~="icon"]'
            )
            .forEach((el) => el.parentNode?.removeChild(el));

          // Add fresh tags. Apple-touch-icon for iOS, generic icon for desktop.
          const apple = document.createElement("link");
          apple.rel = "apple-touch-icon";
          apple.href = hrefWithBust;
          document.head.appendChild(apple);

          const icon = document.createElement("link");
          icon.rel = "icon";
          icon.href = hrefWithBust;
          // type hint helps Chromium pick this over its cached default
          if (/\.png(\?|$)/i.test(teamLogoUrl)) icon.type = "image/png";
          else if (/\.jpe?g(\?|$)/i.test(teamLogoUrl)) icon.type = "image/jpeg";
          else if (/\.svg(\?|$)/i.test(teamLogoUrl)) icon.type = "image/svg+xml";
          document.head.appendChild(icon);

          // Some browsers honor a separate "shortcut icon" tag — add for legacy
          // safety so older Chromium / Edge installs also pick up the new icon.
          const shortcut = document.createElement("link");
          shortcut.rel = "shortcut icon";
          shortcut.href = hrefWithBust;
          document.head.appendChild(shortcut);
        }
      } catch {
        // Non-critical — keep whatever static manifest the server rendered
      }
    }

    void updateManifest();
  }, [pathname]);

  return null;
}
