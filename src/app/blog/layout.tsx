import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Articles",
  description: "Plain-language articles on training load, injury prevention and coaching.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "Articles · MicroPulse", description: "Plain-language articles on training load, injury prevention and coaching.", url: "/blog" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
