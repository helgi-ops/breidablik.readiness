"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getArticleBySlug, ARTICLES, CATEGORY_LABELS, AUDIENCE_LABELS, type BlogArticle } from "@/lib/blog/articles";
import { useLang } from "@/lib/lang";

function cx(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const CAT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" },
};

export default function BlogArticlePage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  // Shared app-wide language (default EN, persisted) — synced with the rest of the app.
  const [lang, setLang] = useLang();

  const article = getArticleBySlug(slug);

  if (!article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="text-5xl">📄</div>
          <h1 className="text-xl font-semibold text-zinc-900">Grein finnst ekki</h1>
          <Link href="/blog" className="text-sm text-emerald-600 hover:underline">
            ← Til baka á greinasíðu
          </Link>
        </div>
      </div>
    );
  }

  const cat = CATEGORY_LABELS[article.category];
  const colors = CAT_COLORS[cat.color] ?? CAT_COLORS.blue;
  const sections = lang === "IS" ? article.sectionsIS : article.sectionsEN;
  const title = lang === "IS" ? article.titleIS : article.titleEN;
  const summary = lang === "IS" ? article.summaryIS : article.summaryEN;

  // Find adjacent articles for "read next"
  const currentIdx = ARTICLES.findIndex((a) => a.slug === slug);
  const nextArticle = ARTICLES[(currentIdx + 1) % ARTICLES.length];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* ── Header ── */}
      <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-20">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/blog" className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 transition">
            <span>←</span>
            <span>{lang === "IS" ? "Greinar" : "Articles"}</span>
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

      {/* ── Article ── */}
      <article className="mx-auto max-w-3xl px-6 py-12">
        {/* Meta badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", colors.bg, colors.text, colors.border)}>
            {lang === "IS" ? cat.is : cat.en}
          </span>
          <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
            {lang === "IS" ? AUDIENCE_LABELS[article.audience].is : AUDIENCE_LABELS[article.audience].en}
          </span>
          <span className="text-[11px] text-zinc-400">
            {article.readMin} {lang === "IS" ? "mín lestur" : "min read"}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 leading-tight">
          {title}
        </h1>

        {/* Author & date */}
        <div className="mt-3 flex items-center gap-3 text-sm text-zinc-400">
          <span>{article.author}</span>
          <span>·</span>
          <time dateTime={article.date}>
            {new Date(article.date).toLocaleDateString(lang === "IS" ? "is-IS" : "en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        </div>

        {/* Summary */}
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm text-zinc-600 leading-relaxed italic">{summary}</p>
        </div>

        {/* Sections */}
        <div className="mt-10 space-y-8">
          {sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold text-zinc-900 mb-3">{section.heading}</h2>
              <div className="text-[15px] text-zinc-600 leading-relaxed whitespace-pre-line">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* Divider */}
        <hr className="my-12 border-zinc-200" />

        {/* Read next */}
        {nextArticle && nextArticle.slug !== slug && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">
              {lang === "IS" ? "Lestu næst" : "Read next"}
            </div>
            <Link
              href={`/blog/${nextArticle.slug}`}
              className="group block rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-300 hover:shadow-md"
            >
              <h3 className="text-base font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors">
                {lang === "IS" ? nextArticle.titleIS : nextArticle.titleEN}
              </h3>
              <p className="mt-1.5 text-sm text-zinc-500 line-clamp-2">
                {lang === "IS" ? nextArticle.summaryIS : nextArticle.summaryEN}
              </p>
            </Link>
          </div>
        )}
      </article>

      {/* ── Footer ── */}
      <footer className="border-t py-8">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between text-xs text-zinc-400">
          <span>© {new Date().getFullYear()} MicroPulse</span>
          <Link href="/blog" className="hover:text-zinc-600 transition">
            {lang === "IS" ? "Allar greinar" : "All articles"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
