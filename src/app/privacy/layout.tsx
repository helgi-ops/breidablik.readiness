import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What data MicroPulse processes for players and clients, why, who sees it, and your rights.",
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy · MicroPulse", description: "What data MicroPulse processes for players and clients, why, who sees it, and your rights.", url: "/privacy" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
