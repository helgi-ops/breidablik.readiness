import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create a MicroPulse account for your club, team or personal-training practice.",
  alternates: { canonical: "/signup" },
  openGraph: { title: "Sign up · MicroPulse", description: "Create a MicroPulse account for your club, team or personal-training practice.", url: "/signup" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
