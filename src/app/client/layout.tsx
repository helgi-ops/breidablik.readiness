import type { Metadata } from "next";
import type { ReactNode } from "react";
import ClientShell from "./ClientShell";

/**
 * Server layout for the PT-client PWA (/client subtree).
 *
 * Owns the PWA install identity so "Add to Home Screen" gives the MicroPulse PT
 * app — not the default team identity:
 *   - manifest points at /api/manifest?role=client (server-rendered, so there's
 *     no race with the client-side DynamicManifest swap, and Chromium installs
 *     get id "/client" + start_url "/client").
 *   - apple-mobile-web-app-title = "MicroPulse PT" — iOS Safari uses THIS (not
 *     the manifest) for the home-screen name on Add to Home Screen.
 *
 * DynamicManifest still runs on top to layer in ELITE club branding (team_id),
 * keeping the same "/client" identity.
 */
export const metadata: Metadata = {
  title: "MicroPulse PT",
  manifest: "/api/manifest?role=client",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MicroPulse PT",
  },
};

export default function ClientLayout({ children }: { children: ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}
