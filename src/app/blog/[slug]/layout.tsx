import type { Metadata } from "next";
import { ARTICLES } from "@/lib/blog/articles";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = ARTICLES.find((x) => x.slug === slug);
  if (!a) return { title: "Article" };
  return {
    title: a.titleEN,
    description: a.summaryEN,
    alternates: { canonical: `/blog/${a.slug}` },
    openGraph: { type: "article", title: a.titleEN, description: a.summaryEN, url: `/blog/${a.slug}`, publishedTime: a.date },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
