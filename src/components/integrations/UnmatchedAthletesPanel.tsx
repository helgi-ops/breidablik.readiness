"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────

type MatchedAthlete = {
  catapultId: string;
  catapultName: string;
  catapultEmail: string | null;
  playerId: string;
  matchMethod: string;
  confidence: number;
};

type UnmatchedAthlete = {
  catapultId: string;
  catapultName: string;
  catapultEmail: string | null;
};

type RosterPlayer = {
  id: string;
  name: string;
};

type ApiResponse = {
  teamId: string;
  totalAthletes: number;
  matched: MatchedAthlete[];
  unmatched: UnmatchedAthlete[];
  roster: RosterPlayer[];
  error?: string;
};

// ── Helpers ──────────────────────────────────────────────────────────

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

function confidenceLabel(method: string, confidence: number): string {
  if (method === "manual") return "Handvirkt";
  if (method === "email") return `Email (${Math.round(confidence * 100)}%)`;
  if (confidence >= 0.7) return `Nafn (${Math.round(confidence * 100)}%)`;
  return `Líkindi (${Math.round(confidence * 100)}%)`;
}

function confidenceColor(method: string, confidence: number): string {
  if (method === "manual") return "bg-blue-100 text-blue-800";
  if (method === "email" || confidence >= 0.9) return "bg-emerald-100 text-emerald-800";
  if (confidence >= 0.7) return "bg-amber-100 text-amber-800";
  return "bg-orange-100 text-orange-800";
}

// ── Component ────────────────────────────────────────────────────────

export default function UnmatchedAthletesPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Ekki innskráð/ur");
      const res = await fetch("/api/integrations/catapult/unmatched-athletes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Villa við að sækja");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on first open
  useEffect(() => {
    if (isOpen && !data && !loading) {
      fetchData();
    }
  }, [isOpen, data, loading, fetchData]);

  async function saveMapping(athlete: UnmatchedAthlete) {
    const playerId = selections[athlete.catapultId];
    if (!playerId) return;

    setSaving(prev => ({ ...prev, [athlete.catapultId]: true }));
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Ekki innskráð/ur");
      const res = await fetch("/api/integrations/catapult/unmatched-athletes", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          catapultId: athlete.catapultId,
          catapultName: athlete.catapultName,
          catapultEmail: athlete.catapultEmail,
          playerId,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Villa");
      setSaveSuccess(prev => ({ ...prev, [athlete.catapultId]: true }));

      // Move from unmatched to matched in local state
      if (data) {
        const player = data.roster.find(p => p.id === playerId);
        setData({
          ...data,
          matched: [
            ...data.matched,
            {
              catapultId: athlete.catapultId,
              catapultName: athlete.catapultName,
              catapultEmail: athlete.catapultEmail,
              playerId,
              matchMethod: "manual",
              confidence: 1.0,
            },
          ],
          unmatched: data.unmatched.filter(u => u.catapultId !== athlete.catapultId),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Villa við að vista");
    } finally {
      setSaving(prev => ({ ...prev, [athlete.catapultId]: false }));
    }
  }

  // Players already matched — exclude from dropdown
  const matchedPlayerIds = new Set(data?.matched.map(m => m.playerId) ?? []);
  const availableRoster = (data?.roster ?? []).filter(p => !matchedPlayerIds.has(p.id));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100">
            <svg className="h-5 w-5 text-indigo-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-1.053M18 8.625a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8.25 6.375a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Catapult leikmanna-pörun</div>
            <div className="text-xs text-slate-500">
              {data
                ? data.unmatched.length === 0
                  ? `Allir ${data.totalAthletes} leikmenn pöruðust`
                  : `${data.unmatched.length} ópöruð, ${data.matched.length} pöruð af ${data.totalAthletes}`
                : "Paraðu Catapult athletes við MicroPulse leikmenn"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && data.unmatched.length > 0 && (
            <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
              {data.unmatched.length} ópöruð
            </span>
          )}
          {data && data.unmatched.length === 0 && data.totalAthletes > 0 && (
            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
              Allt pöruðust
            </span>
          )}
          <svg className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
              </svg>
              Sæki leikmenn frá Catapult...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              {error}
              <button
                type="button"
                onClick={fetchData}
                className="ml-2 underline hover:no-underline"
              >
                Reyna aftur
              </button>
            </div>
          )}

          {/* Unmatched athletes */}
          {data && data.unmatched.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-800 mb-2">
                Ópöruð ({data.unmatched.length})
              </div>
              <div className="space-y-2">
                {data.unmatched.map(athlete => (
                  <div
                    key={athlete.catapultId}
                    className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {athlete.catapultName}
                      </div>
                      {athlete.catapultEmail && (
                        <div className="text-[11px] text-slate-500 truncate">{athlete.catapultEmail}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={selections[athlete.catapultId] ?? ""}
                        onChange={e => setSelections(prev => ({ ...prev, [athlete.catapultId]: e.target.value }))}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs bg-white focus:border-slate-500 focus:outline-none max-w-[180px]"
                      >
                        <option value="">Veldu leikmann...</option>
                        {availableRoster.map(player => (
                          <option key={player.id} value={player.id}>
                            {player.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => saveMapping(athlete)}
                        disabled={!selections[athlete.catapultId] || saving[athlete.catapultId]}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        {saving[athlete.catapultId] ? "..." : "Para"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All matched message */}
          {data && data.unmatched.length === 0 && data.totalAthletes > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                <span className="text-xs font-semibold text-emerald-800">
                  Allir {data.totalAthletes} Catapult leikmenn eru pöruðir við MicroPulse leikmenn.
                </span>
              </div>
            </div>
          )}

          {/* No athletes */}
          {data && data.totalAthletes === 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              Engir leikmenn fundust í Catapult. Athugaðu að credentials og org ID séu rétt.
            </div>
          )}

          {/* Matched athletes (collapsible) */}
          {data && data.matched.length > 0 && (
            <MatchedList matched={data.matched} roster={data.roster} />
          )}

          {/* Refresh button */}
          {data && (
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Sæki..." : "Endursækja"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Matched list sub-component ───────────────────────────────────────

function MatchedList({ matched, roster }: { matched: MatchedAthlete[]; roster: RosterPlayer[] }) {
  const [showMatched, setShowMatched] = useState(false);
  const rosterMap = new Map(roster.map(p => [p.id, p.name]));

  return (
    <div>
      <button
        type="button"
        onClick={() => setShowMatched(!showMatched)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <svg
          className={`h-3 w-3 transition-transform ${showMatched ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        Pöruð ({matched.length})
      </button>
      {showMatched && (
        <div className="mt-2 space-y-1">
          {matched.map(m => (
            <div
              key={m.catapultId}
              className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-slate-800 truncate block">
                  {m.catapultName}
                </span>
              </div>
              <svg className="h-3.5 w-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
              <div className="flex-1 min-w-0 text-right">
                <span className="text-xs font-medium text-slate-800 truncate block">
                  {rosterMap.get(m.playerId) ?? m.playerId}
                </span>
              </div>
              <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${confidenceColor(m.matchMethod, m.confidence)}`}>
                {confidenceLabel(m.matchMethod, m.confidence)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
