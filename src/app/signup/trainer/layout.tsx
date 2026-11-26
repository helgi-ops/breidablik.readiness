import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: { absolute: "Start your practice · MicroPulse" },
  description: "One-step signup for personal trainers and S&C coaches. Invite a client and send a first session in under 10 minutes.",
  alternates: { canonical: "/signup/trainer" },
  openGraph: { title: "Start your practice · MicroPulse", description: "One-step signup for personal trainers and S&C coaches. Invite a client and send a first session in under 10 minutes.", url: "/signup/trainer", images: ["/opengraph-image"] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Hidden until the practice terms are final (see PT_SELF_SERVE_PUBLIC).
  if (!PT_SELF_SERVE_PUBLIC) notFound();
  return children;
}
