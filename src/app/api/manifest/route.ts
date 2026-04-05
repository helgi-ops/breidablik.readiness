export const runtime = "nodejs";

/**
 * Dynamic PWA manifest endpoint.
 *
 * PRO plan:  Returns MicroPulse branding (name, logo, theme colour).
 * ELITE plan: Returns the club's own branding (club_short_name, club_logo_url,
 *              club_theme_color) — makes it feel like the club's own native app.
 *
 * The manifest is served at /api/manifest and referenced from layout.tsx.
 * It is cached for 60 s (stale-while-revalidate 300 s) so installs update quickly
 * without hammering Supabase on every page load.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ── Supabase (service role — read-only query, no auth cookie needed) ──────────
function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Default MicroPulse branding (PRO + FREE fallback) ─────────────────────────
const MICROPULSE_MANIFEST = {
  id: "/player",
  name: "MicroPulse",
  short_name: "MicroPulse",
  start_url: "/player",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#ffffff",
  theme_color: "#005a2b",
  lang: "is",
  description: "Dagleg líðansskráning og þjálfanaálag.",
  categories: ["sports", "health", "fitness"],
  icons: [
    { src: "/icons/icon-192.png",        sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png",        sizes: "512x512", type: "image/png" },
    { src: "/icons/icon-512.png",        sizes: "512x512", type: "image/png", purpose: "maskable" },
    { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  ],
  shortcuts: [
    {
      name: "Check-in",
      short_name: "Check-in",
      description: "Skrá líðan dagsins",
      url: "/player/checkin",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
    },
    {
      name: "RPE skráning",
      short_name: "RPE",
      description: "Skrá æfingaálag eftir æfingu",
      url: "/player?tab=rpe",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
    },
    {
      name: "Þjálfari",
      short_name: "Coach",
      description: "Stjórnstöð þjálfara",
      url: "/coach",
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
    },
  ],
};

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // team_id may be passed as a query param by the client (injected in layout.tsx
  // via a small client component). Falls back to MicroPulse branding if absent.
  const teamId = req.nextUrl.searchParams.get("team_id")?.trim() ?? null;
  // role=coach → coach-specific start_url and id for independent PWA install
  const role = req.nextUrl.searchParams.get("role")?.trim() ?? null;

  let manifest = { ...MICROPULSE_MANIFEST };

  // Coach PWA: separate identity so it can be installed alongside the player PWA
  if (role === "coach") {
    manifest = {
      ...manifest,
      id: "/coach",
      name: "MicroPulse Coach",
      short_name: "MP Coach",
      start_url: "/coach",
      description: "Stjórnstöð þjálfara — álag, greind og ákvörðunartugi.",
    };
  }

  if (teamId) {
    try {
      const supabase = getSupabase();
      const { data: team } = await supabase
        .from("teams")
        .select("name, plan_tier, club_short_name, club_logo_url, club_theme_color")
        .eq("id", teamId)
        .maybeSingle();

      if (team && team.plan_tier === "ELITE") {
        const name       = team.club_short_name || team.name || "MicroPulse";
        const themeColor = team.club_theme_color || "#005a2b";
        const logoUrl    = team.club_logo_url;

        // Build icons: use club logo if available, fall back to MicroPulse icons
        const icons = logoUrl
          ? [
              { src: logoUrl, sizes: "192x192", type: "image/png" },
              { src: logoUrl, sizes: "512x512", type: "image/png" },
              { src: logoUrl, sizes: "512x512", type: "image/png", purpose: "maskable" },
              { src: logoUrl, sizes: "180x180", type: "image/png" },
            ]
          : MICROPULSE_MANIFEST.icons;

        manifest = {
          ...MICROPULSE_MANIFEST,
          name,
          short_name: name,
          theme_color: themeColor,
          description: `${name} — dagleg líðansskráning og þjálfanaálag.`,
          icons,
          shortcuts: MICROPULSE_MANIFEST.shortcuts.map((s) => ({
            ...s,
            icons: logoUrl ? [{ src: logoUrl, sizes: "192x192" }] : s.icons,
          })),
        };
      }
    } catch {
      // Silently fall back to default — better a working install than a broken one
    }
  }

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
