"use client";

/**
 * /client/chat — stub that links to the existing player-coach chat surface
 * on /player so we don't duplicate the message infrastructure for the MVP.
 *
 * Phase 2 will lift the chat thread inline so the bottom nav doesn't lose
 * the PWA frame.
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useLang } from "@/lib/lang";

export default function ClientChatPage() {
  const [lang] = useLang();
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xl font-semibold text-slate-900">
          {lang === "IS" ? "Spjall við þjálfara" : "Chat with trainer"}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Hröð skilaboð, spurningar um æfingar, dagsetningar."
            : "Quick messages, exercise questions, scheduling."}
        </div>
      </div>
      <Link
        href="/player"
        className="block rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50"
      >
        <div className="text-sm font-medium text-slate-900">
          {lang === "IS" ? "Opna skilaboð" : "Open messages"} →
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {lang === "IS"
            ? "Notar núverandi skilaboða-kerfi á player surface."
            : "Opens the existing message thread on your player surface."}
        </div>
      </Link>
    </div>
  );
}
