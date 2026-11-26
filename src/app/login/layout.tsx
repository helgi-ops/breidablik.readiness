import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to MicroPulse.",
  alternates: { canonical: "/login" },
  openGraph: { title: "Sign in · MicroPulse", description: "Sign in to MicroPulse.", url: "/login" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
