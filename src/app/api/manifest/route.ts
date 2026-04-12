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
  start_url: "/auth/redirect",
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

  // Step 1 — ELITE club branding (applies to both player and coach PWAs)
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
          ...manifest,
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

  // Step 2 — Coach PWA overrides. Must run AFTER ELITE branding so the coach
  // identity (id, start_url, shortcuts) wins. Keeps club name/logo/theme.
  if (role === "coach") {
    const baseName = manifest.name;
    const coachName =
      baseName === "MicroPulse" ? "MicroPulse Coach" : `${baseName} — Þjálfari`;
    const coachShortName =
      manifest.short_name === "MicroPulse" ? "MP Coach" : `${manifest.short_name}`;

    manifest = {
      ...manifest,
      id: "/coach",
      name: coachName,
      short_name: coachShortName,
      start_url: "/coach",
      description: "Stjórnstöð þjálfara — álag, greind og ákvarðanir.",
      shortcuts: [
        {
          name: "Yfirlit",
          short_name: "Yfirlit",
          description: "Dashboard þjálfara",
          url: "/coach",
          icons: manifest.icons.slice(0, 1).map((i) => ({ src: i.src, sizes: "192x192" })),
        },
        {
          name: "Vika",
          short_name: "Vika",
          description: "Week setup og dagsáætlun",
          url: "/coach/week-setup",
          icons: manifest.icons.slice(0, 1).map((i) => ({ src: i.src, sizes: "192x192" })),
        },
        {
          name: "Samskipti",
          short_name: "Samskipti",
          description: "Samtöl við leikmenn",
          url: "/coach/conversations",
          icons: manifest.icons.slice(0, 1).map((i) => ({ src: i.src, sizes: "192x192" })),
        },
        {
          name: "Liðið",
          short_name: "Lið",
          description: "Team snapshot",
          url: "/team",
          icons: manifest.icons.slice(0, 1).map((i) => ({ src: i.src, sizes: "192x192" })),
        },
      ],
    };
  }

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
