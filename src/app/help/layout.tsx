import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
  description: "Guides and answers for personal trainers and club coaches using MicroPulse.",
  alternates: { canonical: "/help" },
  openGraph: { title: "Help · MicroPulse", description: "Guides and answers for personal trainers and club coaches using MicroPulse.", url: "/help" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
