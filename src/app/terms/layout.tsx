import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "Terms for practices",
  description: "The terms that apply when a personal trainer or practice uses MicroPulse.",
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms for practices · MicroPulse", description: "The terms that apply when a personal trainer or practice uses MicroPulse.", url: "/terms" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Hidden until the practice terms are final (see PT_SELF_SERVE_PUBLIC).
  if (!PT_SELF_SERVE_PUBLIC) notFound();
  return children;
}
