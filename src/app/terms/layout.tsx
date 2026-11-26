import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms for practices",
  description: "The terms that apply when a personal trainer or practice uses MicroPulse.",
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms for practices · MicroPulse", description: "The terms that apply when a personal trainer or practice uses MicroPulse.", url: "/terms" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
