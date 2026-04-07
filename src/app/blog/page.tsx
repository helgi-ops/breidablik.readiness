"use client";

import * as React from "react";
import Link from "next/link";
import { ARTICLES, CATEGORY_LABELS, AUDIENCE_LABELS, type BlogArticle } from "@/lib/blog/articles";

type Lang = "IS" | "EN";

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

function CategoryBadge({ category, lang }: { category: BlogArticle["category"]; lang: Lang }) {
  const cat = CATEGORY_LABELS[category];
  const colors = CAT_COLORS[cat.color] ?? CAT_COLORS.blue;
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", colors.bg, colors.text, colors.border)}>
      {lang === "IS" ? cat.is : cat.en}
    </span>
  );
}

function AudienceBadge({ audience, lang }: { audience: BlogArticle["audience"]; lang: Lang }) {
  const a = AUDIENCE_LABELS[audience];
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
      {lang === "IS" ? a.is : a.en}
    </span>
  );
}

export default function BlogListingPage() {
  const [lang, setLang] = React.useState<Lang>("IS");
  const [filter, setFilter] = React.useState<BlogArticle["category"] | "all">("all");

  const filtered = filter === "all" ? ARTICLES : ARTICLES.filter((a) => a.category === filter);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* ── Header ── */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/home" className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-emerald-500" />
            <span className="font-semibold tracking-tight text-zinc-900">MicroPulse</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                onClick={() => setLang("IS")}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  lang === "IS" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                IS
              </button>
              <button
                onClick={() => setLang("EN")}
                className={cx(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition",
                  lang === "EN" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* ── Page title ── */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            {lang === "IS" ? "Fræðslugreinar" : "Articles"}
          </h1>
          <p className="mt-2 text-base text-zinc-500">
            {lang === "IS"
              ? "Vísindabyggð fræðsla um meiðslaforvarnir, álagsstjórnun og þjálfunarfræði."
              : "Evidence-based education on injury prevention, load management, and training science."}
          </p>
        </div>

        {/* ── Category filter ── */}
        <div className="mb-8 flex flex-wrap gap-2">
          {(["all", "meidslafovarnir", "alagsstjornun", "thjalfunarfraedi"] as const).map((cat) => {
            const active = filter === cat;
            const label =
              cat === "all"
                ? lang === "IS" ? "Allt" : "All"
                : lang === "IS" ? CATEGORY_LABELS[cat].is : CATEGORY_LABELS[cat].en;
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cx(
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Article cards ── */}
        <div className="space-y-4">
          {filtered.map((article) => (
            <Link
              key={article.slug}
              href={`/blog/${article.slug}`}
              className="group block rounded-2xl border border-zinc-200 bg-white p-6 transition hover:border-zinc-300 hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <CategoryBadge category={article.category} lang={lang} />
                <AudienceBadge audience={article.audience} lang={lang} />
                <span className="text-[11px] text-zinc-400">
                  {article.readMin} {lang === "IS" ? "mín lestur" : "min read"}
                </span>
              </div>

              <h2 className="text-lg font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors leading-snug">
                {lang === "IS" ? article.titleIS : article.titleEN}
              </h2>

              <p className="mt-2 text-sm text-zinc-500 leading-relaxed line-clamp-2">
                {lang === "IS" ? article.summaryIS : article.summaryEN}
              </p>

              <div className="mt-3 flex items-center gap-3 text-xs text-zinc-400">
                <span>{article.author}</span>
                <span>·</span>
                <span>{new Date(article.date).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 text-center text-sm text-zinc-400">
            {lang === "IS" ? "Engar greinar fundust í þessum flokki." : "No articles found in this category."}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-4xl px-6 flex items-center justify-between text-xs text-zinc-400">
          <span>© {new Date().getFullYear()} MicroPulse</span>
          <Link href="/home" className="hover:text-zinc-600 transition">
            {lang === "IS" ? "Til baka á forsíðu" : "Back to homepage"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
