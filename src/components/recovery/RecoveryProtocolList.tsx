"use client";

/**
 * RecoveryProtocolList — shared library browser used by both /coach and
 * /player recovery pages. Pure presentation; data is fetched via the
 * /api/recovery-protocols endpoint.
 */

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  EVIDENCE_DESCRIPTIONS,
  EVIDENCE_LABELS,
  type RecoveryEvidenceTier,
  type RecoveryProtocol,
  type RecoveryProtocolCategory,
} from "@/lib/recovery/types";

const CATEGORIES: ReadonlyArray<RecoveryProtocolCategory | "all"> = [
  "all",
  "post_match",
  "md_plus_1",
  "pre_match",
  "travel",
  "general",
];

function evidenceClass(tier: RecoveryEvidenceTier): string {
  if (tier === "strong") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (tier === "moderate") return "border-sky-300 bg-sky-50 text-sky-800";
  if (tier === "mixed") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function categoryClass(c: RecoveryProtocolCategory): string {
  switch (c) {
    case "post_match":
      return "border-violet-300 bg-violet-50 text-violet-800";
    case "md_plus_1":
      return "border-indigo-300 bg-indigo-50 text-indigo-800";
    case "pre_match":
      return "border-orange-300 bg-orange-50 text-orange-800";
    case "travel":
      return "border-teal-300 bg-teal-50 text-teal-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

export default function RecoveryProtocolList() {
  const [protocols, setProtocols] = useState<RecoveryProtocol[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RecoveryProtocolCategory | "all">("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data: sess } = await sb.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          setError("Not signed in");
          return;
        }
        const res = await fetch("/api/recovery-protocols", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          if (!cancelled) setError(j.error || `HTTP ${res.status}`);
          return;
        }
        const json = (await res.json()) as { ok: boolean; protocols: RecoveryProtocol[] };
        if (!cancelled) setProtocols(json.protocols);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!protocols) return [];
    if (filter === "all") return protocols;
    return protocols.filter((p) => p.category === filter);
  }, [protocols, filter]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-500">Loading recovery protocols…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="text-sm text-red-700">Recovery protocol library error: {error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setFilter(c)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              filter === c
                ? "border-slate-800 bg-slate-800 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          No protocols in this category yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isOpen = openSlug === p.slug;
            return (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => setOpenSlug(isOpen ? null : p.slug)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-slate-50"
                >
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${categoryClass(
                          p.category,
                        )}`}
                      >
                        {CATEGORY_LABELS[p.category]}
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${evidenceClass(
                          p.evidence_tier,
                        )}`}
                        title={EVIDENCE_DESCRIPTIONS[p.evidence_tier]}
                      >
                        {EVIDENCE_LABELS[p.evidence_tier]}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {p.duration_min} min
                      </span>
                    </div>
                    <div className="mt-1.5 text-sm font-semibold text-slate-900">{p.title}</div>
                    <div className="mt-0.5 text-xs text-slate-600">{p.goal}</div>
                  </div>
                  <span className="text-slate-400">{isOpen ? "▾" : "▸"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          When to use
                        </div>
                        <div className="mt-0.5 text-xs text-slate-700">{p.when_to_use}</div>
                      </div>
                      {p.trigger_hint && (
                        <div>
                          <div className="text-[11px] uppercase tracking-wide text-slate-500">
                            Trigger
                          </div>
                          <div className="mt-0.5 text-xs text-slate-700">{p.trigger_hint}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 space-y-3">
                      {p.sections.map((sec, si) => (
                        <div
                          key={si}
                          className="rounded-md border border-slate-200 bg-slate-50/40 p-3"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-sm font-medium text-slate-900">
                              {si + 1}. {sec.title}
                            </div>
                            <div className="text-[10px] text-slate-500">{sec.duration_min} min</div>
                          </div>
                          <div className="mt-1 text-xs text-slate-600">{sec.description}</div>
                          <ul className="mt-2 space-y-2">
                            {sec.drills.map((d, di) => (
                              <li
                                key={di}
                                className="rounded border border-slate-200 bg-white p-2"
                              >
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-900">
                                    {d.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    {d.reps_or_time}
                                  </span>
                                </div>
                                {d.cues.length > 0 && (
                                  <ul className="mt-1 list-disc pl-4 text-[11px] text-slate-600">
                                    {d.cues.map((c, ci) => (
                                      <li key={ci}>{c}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>

                    {p.citations && p.citations.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-2">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          References
                        </div>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                          {p.citations.map((c, ci) => (
                            <li key={ci}>
                              · {c.label}
                              {c.source && (
                                <span className="text-slate-400"> — {c.source}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
