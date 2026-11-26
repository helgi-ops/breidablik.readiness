import type { MetadataRoute } from "next";
import { ARTICLES } from "@/lib/blog/articles";
import { OPERATOR } from "@/lib/legal/operator";
import { PUBLIC_PATHS } from "@/lib/seo/publicPaths";


export default function sitemap(): MetadataRoute.Sitemap {
  const base = OPERATOR.siteUrl;
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: p === "/blog" ? "weekly" : "monthly",
    priority: p === "/home" || p === "/personal-trainers" ? 1 : 0.6,
  }));
  const articles: MetadataRoute.Sitemap = ARTICLES.map((a) => ({
    url: `${base}/blog/${a.slug}`,
    lastModified: a.date,
    changeFrequency: "yearly",
    priority: 0.4,
  }));
  return [...pages, ...articles];
}
