// src/app/coach/layout.tsx
// Server component. Exports Coach-specific metadata (PWA manifest link with
// role=coach) so that iOS Safari reads the correct manifest from the initial
// SSR HTML — before any client JS runs. Without this, the root layout's
// player manifest leaks into the "Add to Home Screen" dialog on /coach.
import type { Metadata } from "next";
import CoachShell from "./CoachShell";

export const metadata: Metadata = {
  title: "MicroPulse — Þjálfari",
  manifest: "/api/manifest?role=coach",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MP Coach",
  },
};

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CoachShell>{children}</CoachShell>;
}
