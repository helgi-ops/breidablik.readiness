import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Privacy for practices · MicroPulse" },
  description: "How MicroPulse handles a trainer's own data, and processes clients' data on the practice's behalf.",
  alternates: { canonical: "/privacy/practices" },
  openGraph: { title: "Privacy for practices · MicroPulse", url: "/privacy/practices", images: ["/opengraph-image"] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
