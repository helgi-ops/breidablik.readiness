import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology",
  description: "The research behind every MicroPulse signal, with citations.",
  alternates: { canonical: "/methodology" },
  openGraph: { title: "Methodology · MicroPulse", description: "The research behind every MicroPulse signal, with citations.", url: "/methodology" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
