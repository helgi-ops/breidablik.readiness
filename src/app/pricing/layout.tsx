import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Plans for clubs and teams, from the free plan to Elite. Personal trainers: free in early access.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Pricing · MicroPulse", description: "Plans for clubs and teams, from the free plan to Elite. Personal trainers: free in early access.", url: "/pricing" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
