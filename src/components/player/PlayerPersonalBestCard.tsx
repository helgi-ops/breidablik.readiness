"use client";

/**
 * PlayerPersonalBestCard — a small celebratory card shown to a player when they
 * hit a recent personal best (last ~14 days). Reads /api/player/personal-best
 * (self-scoped). Dismissible per-PB (localStorage) so it congratulates once,
 * not forever. Silent when there's no recent PB. Bilingual.
 */
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { pbCardCopy, type PersonalBest } from "@/lib/micropulse/personalBest";

type PbApi = {
  id: string; metric: string; value: number; unit: string;
  priorBest: number | null; improvement: number | null; achievedAt: string;
};

const DISMISS_KEY = (id: string) => `pb-card-dismissed:${id}`;

export default function PlayerPersonalBestCard() {
  const [lang] = useLang();
  const isIS = lang === "IS";
  const [pb, setPb] = React.useState<PbApi | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/player/personal-best", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json()).catch(() => null);
      if (!alive) return;
      const got = res?.ok ? (res.pb as PbApi | null) : null;
      if (got) {
        try { if (localStorage.getItem(DISMISS_KEY(got.id)) === "1") { setDismissed(true); } } catch { /* ignore */ }
        setPb(got);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!pb || dismissed) return null;

  const copy = pbCardCopy(
    {
      metric: (pb.metric as PersonalBest["metric"]) ?? "cmj_jump_height",
      value: pb.value, unit: pb.unit, priorBest: pb.priorBest ?? 0,
      improvement: pb.improvement ?? 0, improvementPct: 0, achievedAt: pb.achievedAt, testId: pb.id,
    },
    isIS ? "is" : "en",
  );

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY(pb.id), "1"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-emerald-50 px-4 py-3 shadow-sm">
      <button
        type="button"
        onClick={dismiss}
        aria-label={isIS ? "Loka" : "Dismiss"}
        className="absolute right-2 top-2 rounded-full p-1 text-amber-700/60 transition hover:bg-amber-100 hover:text-amber-800"
      >
        <span aria-hidden className="block h-4 w-4 text-center text-sm leading-4">×</span>
      </button>
      <div className="flex items-start gap-3 pr-6">
        <span className="mt-0.5 text-2xl" aria-hidden>🏆</span>
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-emerald-900">{copy.headline}</div>
          <div className="mt-0.5 text-[13px] font-medium text-emerald-800/80">{copy.sub}</div>
        </div>
      </div>
    </div>
  );
}
