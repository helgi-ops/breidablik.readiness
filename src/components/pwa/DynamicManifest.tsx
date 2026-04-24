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
        // SAFE DOM mutation strategy:
        // - Next.js / React track the icon link tags they inject (favicon.ico,
        //   metadata.icons.icon). If we removeChild() those out from under the
        //   reconciler, HMR / re-render crashes with
        //   "can't access property removeChild, finishedRoot.parentNode is null".
        // - Solution: never remove third-party-managed tags. Mutate their href
        //   in place (with cache-buster) AND append our own data-mp-icon=1
        //   tagged tags at the END of <head> so browser spec picks them last
        //   (last-defined link wins for icon resolution).
        // - On re-run (HMR / path change) we only remove tags WE added.
        if (teamLogoUrl) {
          const cb = Date.now() % 1_000_000;
          const finalHref = teamLogoUrl + (teamLogoUrl.includes("?") ? "&" : "?") + `_cb=${cb}`;

          // 1. Mutate href on ALL existing icon-class tags (whoever owns them).
          //    Browser will refetch because the URL changed.
          document
            .querySelectorAll<HTMLLinkElement>(
              'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
            )
            .forEach((el) => { el.href = finalHref; });

          // 2. Remove ONLY tags we previously appended in this effect, so a
          //    second run doesn't pile up duplicates.
          document
            .querySelectorAll<HTMLLinkElement>('link[data-mp-icon="1"]')
            .forEach((el) => el.parentNode?.removeChild(el));

          // 3. Append fresh tags at the end of <head>. Last-defined wins for
          //    favicon resolution in Chromium/Firefox/Safari, so this overrides
          //    any earlier static link Next.js injected.
          const mkLink = (rel: string, type?: string) => {
            const el = document.createElement("link");
            el.rel = rel;
            el.href = finalHref;
            if (type) el.type = type;
            el.setAttribute("data-mp-icon", "1");
            return el;
          };

          let mimeType: string | undefined;
          if (/\.png(\?|$)/i.test(teamLogoUrl))      mimeType = "image/png";
          else if (/\.jpe?g(\?|$)/i.test(teamLogoUrl)) mimeType = "image/jpeg";
          else if (/\.svg(\?|$)/i.test(teamLogoUrl))   mimeType = "image/svg+xml";

          document.head.appendChild(mkLink("apple-touch-icon"));
          document.head.appendChild(mkLink("icon", mimeType));
          document.head.appendChild(mkLink("shortcut icon"));
        }
      } catch {
        // Non-critical — keep whatever static manifest the server rendered
      }
    }

    void updateManifest();
  }, [pathname]);

  return null;
}
