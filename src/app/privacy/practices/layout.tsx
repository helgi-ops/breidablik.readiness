import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PT_SELF_SERVE_PUBLIC } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: { absolute: "Privacy for practices · MicroPulse" },
  description: "How MicroPulse handles a trainer's own data, and processes clients' data on the practice's behalf.",
  alternates: { canonical: "/privacy/practices" },
  openGraph: { title: "Privacy for practices · MicroPulse", url: "/privacy/practices", images: ["/opengraph-image"] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  // Hidden until the practice terms are final (see PT_SELF_SERVE_PUBLIC).
  if (!PT_SELF_SERVE_PUBLIC) notFound();
  return children;
}
