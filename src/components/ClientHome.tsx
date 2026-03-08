"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import HomeVideo from "@/components/HomeVideo";

type Lang = "IS" | "EN";

export default function ClientHome() {
  const [lang, setLang] = useState<Lang>("IS");

  const copy = useMemo(() => {
    const IS = {
      nav: { product: "Vara", features: "Eiginleikar", pricing: "Verð", demo: "Bóka kynningu" },
      hero: {
        badge: "MicroPulse • Performance Intelligence",
        h1: "Gagnadrifin ákvarðanataka fyrir elite lið",
        p: "MicroPulse sameinar readiness gögn, MD-kerfi, Stage 4 ákvarðanir og skýrar tillögur í eitt kerfi — svo staffið viti nákvæmlega hvað á að gera áður en æfing hefst.",
        cta1: "Bóka kynningu",
        cta2: "Skoða verð",
        note: "Hannað fyrir fótbolta, körfu og performance teymi."
      },
      features: [
        { title: "Readiness á einni síðu", desc: "Skýr merki og flagg sem everyone skilur — engar getgátur." },
        { title: "MD± rútína", desc: "Kerfið rammar inn daginn (MD+1/MD-2 o.s.frv.) og heldur öllu í takt." },
        { title: "Stage 4 ákvarðanir", desc: "Sjálfvirkar tillögur + coach override þegar þú þarft að taka stjórn." }
      ],
      socialProof: "Notað af performance fólki sem vill hraða, skýrleika og samræmi."
    };

    const EN = {
      nav: { product: "Product", features: "Features", pricing: "Pricing", demo: "Book demo" },
      hero: {
        badge: "MicroPulse • Performance Intelligence",
        h1: "Data-driven decisions for elite teams",
        p: "MicroPulse unifies readiness data, MD cycle logic, Stage 4 decisions, and clear recommendations — so your staff knows exactly what to do before the session starts.",
        cta1: "Book demo",
        cta2: "View pricing",
        note: "Built for football, basketball, and performance teams."
      },
      features: [
        { title: "Readiness at a glance", desc: "Clear signals and flags everyone understands — no guesswork." },
        { title: "MD± workflow", desc: "Daily structure (MD+1/MD-2 etc.) that keeps the whole org aligned." },
        { title: "Stage 4 decisions", desc: "Automated recommendations + coach override when you need control." }
      ],
      socialProof: "For staff who want speed, clarity, and consistency."
    };

    return lang === "IS" ? IS : EN;
  }, [lang]);

  return (
    <main className="min-h-screen bg-white text-neutral-900">
      {/* NAVBAR */}
      <header className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-black text-white grid place-items-center font-semibold">
              μ
            </div>
            <div className="text-lg font-semibold tracking-tight">MicroPulse</div>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm text-neutral-700">
            <a href="#features" className="hover:text-neutral-900 transition">{copy.nav.features}</a>
            <Link href="/pricing" className="hover:text-neutral-900 transition">{copy.nav.pricing}</Link>
          </nav>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="inline-flex rounded-xl border border-neutral-200 bg-white p-1">
              <button
                onClick={() => setLang("IS")}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  lang === "IS" ? "bg-black text-white" : "text-neutral-700 hover:bg-neutral-100"
                }`}
                aria-pressed={lang === "IS"}
              >
                IS
              </button>
              <button
                onClick={() => setLang("EN")}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  lang === "EN" ? "bg-black text-white" : "text-neutral-700 hover:bg-neutral-100"
                }`}
                aria-pressed={lang === "EN"}
              >
                EN
              </button>
            </div>

            <Link
              href="/pricing"
              className="hidden sm:inline-flex items-center justify-center rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
            >
              {copy.nav.demo}
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.06),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(0,0,0,0.05),transparent_40%)]" />
        <div className="relative mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-neutral-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {copy.hero.badge}
            </div>

            <h1 className="mt-6 text-5xl font-bold tracking-tight leading-[1.05]">
              {copy.hero.h1}
            </h1>

            <p className="mt-6 text-lg text-neutral-600">
              {copy.hero.p}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-white font-medium hover:opacity-90 transition"
              >
                {copy.hero.cta1}
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-3 font-medium text-neutral-900 hover:bg-neutral-100 transition"
              >
                {copy.hero.cta2}
              </Link>
            </div>

            <p className="mt-5 text-sm text-neutral-500">
              {copy.hero.note}
            </p>
          </div>

          {/* quick proof row */}
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-neutral-500">Signal</div>
              <div className="mt-1 text-xl font-semibold">Clear flags</div>
              <div className="mt-2 text-sm text-neutral-600">Green/amber/red sem staffið notar strax.</div>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-neutral-500">Workflow</div>
              <div className="mt-1 text-xl font-semibold">MD aligned</div>
              <div className="mt-2 text-sm text-neutral-600">Dagurinn fær ramma, minna chaos.</div>
            </div>
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-neutral-500">Decision</div>
              <div className="mt-1 text-xl font-semibold">Stage 4</div>
              <div className="mt-2 text-sm text-neutral-600">Tillögur sem hægt er að læsa / overrida.</div>
            </div>
          </div>
        </div>
      </section>

      {/* VIDEO (3 min, poster + modal) */}
      <HomeVideo />

      {/* FEATURES */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                {lang === "IS" ? "Eiginleikar sem vinna fyrir staffið" : "Features your staff will actually use"}
              </h2>
              <p className="mt-3 text-neutral-600">
                {copy.socialProof}
              </p>
            </div>
            <Link
              href="/pricing"
              className="hidden md:inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-5 py-2.5 text-sm font-medium text-neutral-900 hover:bg-neutral-100 transition"
            >
              {lang === "IS" ? "Skoða pakkana" : "See plans"}
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {copy.features.map((f) => (
              <div key={f.title} className="rounded-2xl border bg-white p-7 shadow-sm">
                <div className="text-xl font-semibold">{f.title}</div>
                <p className="mt-3 text-neutral-600">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-14 rounded-2xl border bg-neutral-50 p-7 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="text-lg font-semibold">
                {lang === "IS" ? "Viltu sjá þetta live?" : "Want to see it live?"}
              </div>
              <p className="mt-1 text-neutral-600">
                {lang === "IS"
                  ? "Bókaðu demo og við stillum MicroPulse upp fyrir þitt lið."
                  : "Book a demo and we’ll map MicroPulse to your team’s workflow."}
              </p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-white font-medium hover:opacity-90 transition"
            >
              {lang === "IS" ? "Bóka demo" : "Book demo"}
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t py-10">
        <div className="mx-auto max-w-6xl px-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between text-sm text-neutral-600">
          <div>© {new Date().getFullYear()} MicroPulse</div>
          <div className="flex gap-5">
            <Link className="hover:text-neutral-900 transition" href="/pricing">
              {lang === "IS" ? "Verð & Demo" : "Pricing & Demo"}
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}