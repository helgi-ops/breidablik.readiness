"use client";

import { useEffect, useState } from "react";

export default function HomeVideo() {
  const [open, setOpen] = useState(false);

  // ESC til að loka
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <section className="bg-neutral-50 py-24">
      <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-12 items-center">
        {/* TEXT */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-sm text-neutral-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            3 mín kynning
          </div>

          <h2 className="mt-4 text-4xl font-bold tracking-tight">
            MicroPulse – Real-Time Performance Intelligence
          </h2>

          <p className="mt-5 text-lg text-neutral-600">
            MicroPulse sameinar readiness gögn, MD-kerfi, Stage 4 ákvarðanir og
            skýrar tillögur í eitt kerfi — svo þú sért með rétta mynd áður en æfing hefst.
          </p>

          <ul className="mt-6 space-y-2 text-neutral-700">
            <li>• Skýr merki, engar getgátur</li>
            <li>• Dagleg rútína fyrir staff og leikmenn</li>
            <li>• Hentar fótbolta + körfu + performance teymi</li>
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => setOpen(true)}
              className="inline-flex items-center justify-center rounded-xl bg-black px-6 py-3 text-white font-medium hover:opacity-90 transition"
            >
              Spila kynningu
            </button>

            <a
              href="/pricing"
              className="inline-flex items-center justify-center rounded-xl border border-neutral-200 bg-white px-6 py-3 font-medium text-neutral-900 hover:bg-neutral-100 transition"
            >
              Book demo
            </a>
          </div>
        </div>

        {/* POSTER CARD */}
        <button
          onClick={() => setOpen(true)}
          className="group relative overflow-hidden rounded-2xl shadow-2xl border bg-black/5 text-left"
          aria-label="Play MicroPulse introduction video"
        >
          <img
            src="/images/micropulse-video-poster.jpg"
            alt="MicroPulse intro video"
            className="h-full w-full object-cover aspect-video"
            loading="lazy"
          />

          {/* subtle overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

          {/* play button */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="rounded-full bg-white/95 p-4 shadow-lg group-hover:scale-105 transition">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                className="text-neutral-900"
                aria-hidden="true"
              >
                <path
                  d="M8 5v14l11-7L8 5z"
                  fill="currentColor"
                />
              </svg>
            </div>
          </div>

          {/* label */}
          <div className="absolute bottom-4 left-4 right-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-sm font-medium text-neutral-900">
              ▶ Kynning á MicroPulse (3:00)
            </div>
          </div>
        </button>
      </div>

      {/* MODAL */}
      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="mx-auto flex h-full max-w-5xl items-center px-6">
            <div
              className="relative w-full overflow-hidden rounded-2xl bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* close */}
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white transition"
              >
                Loka
              </button>

              <video
                src="/videos/MicroPulse_Performance.mp4"
                controls
                playsInline
                preload="metadata"
                className="w-full aspect-video"
                poster="/images/micropulse-video-poster.jpg"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}