"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { WeekType } from "@/lib/micropulse/weekSetup/weekType";

type MatchInput = {
  match_id: string;
  date: string; // YYYY-MM-DD
  kickoff_time?: string; // "19:15" optional
  home_away?: "H" | "A";
};

type WeekRow = {
  id: string;
  week_start_date: string; // YYYY-MM-DD
  week_type: WeekType;
  matches: MatchInput[];
};

function isoMondayOf(date: Date) {
  // Returns YYYY-MM-DD for Monday of the ISO week (local time)
  const d = new Date(date);
  const day = d.getDay(); // Sun=0..Sat=6
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WeekSetupPage() {


  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [weekStart, setWeekStart] = useState<string>(() => isoMondayOf(new Date()));
  const [weekType, setWeekType] = useState<WeekType>("ONE_MATCH");
  const [matches, setMatches] = useState<MatchInput[]>([
    { match_id: "M1", date: "", kickoff_time: "", home_away: "H" },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Load current week if exists
  useEffect(() => {
    let alive = true;

    async function loadWeek() {
      setLoading(true);
      setError(null);
      setOk(null);

      const { data, error } = await supabase
        .from("coach_week_setup")
        .select("id, week_start_date, week_type, matches")
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      if (data) {
        const row = data as WeekRow;
        setWeekType(row.week_type);
        setMatches(
          (row.matches?.length ? row.matches : [{ match_id: "M1", date: "", kickoff_time: "", home_away: "H" }]).map(
            (m, idx) => ({
              match_id: m.match_id || `M${idx + 1}`,
              date: m.date || "",
              kickoff_time: m.kickoff_time || "",
              home_away: (m.home_away as any) || "H",
            })
          )
        );
      } else {
        // No row for this week -> reset defaults
        setWeekType("ONE_MATCH");
        setMatches([{ match_id: "M1", date: "", kickoff_time: "", home_away: "H" }]);
      }

      setLoading(false);
    }

    loadWeek();

    return () => {
      alive = false;
    };
  }, [supabase, weekStart]);

  function setMatch(i: number, patch: Partial<MatchInput>) {
    setMatches((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }

  function applyWeekType(next: WeekType) {
    setWeekType(next);
    setError(null);
    setOk(null);

    setMatches((prev) => {
      if (next === "ONE_MATCH") return [prev[0] ?? { match_id: "M1", date: "", kickoff_time: "", home_away: "H" }];
      // TWO_MATCHES
      const first = prev[0] ?? { match_id: "M1", date: "", kickoff_time: "", home_away: "H" };
      const second = prev[1] ?? { match_id: "M2", date: "", kickoff_time: "", home_away: "A" };
      return [first, second];
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setOk(null);

    // Minimal client-side validation (RPC does the real validation)
    const trimmed = matches.map((m, idx) => ({
      match_id: (m.match_id || `M${idx + 1}`).trim(),
      date: (m.date || "").trim(),
      kickoff_time: (m.kickoff_time || "").trim() || undefined,
      home_away: (m.home_away || "H") as "H" | "A",
    }));

    const { data, error } = await supabase.rpc("save_week_setup", {
      p_week_start_date: weekStart,
      p_week_type: weekType,
      p_matches: trimmed,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setOk("Vikan var vistuð ✅");
    setSaving(false);
    return data;
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Coach · Week Setup</h1>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Week start (Monday)</span>
          <input
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            style={{ padding: 8 }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Week type</span>
          <select value={weekType} onChange={(e) => applyWeekType(e.target.value as WeekType)} style={{ padding: 8 }}>
            <option value="ONE_MATCH">ONE_MATCH</option>
            <option value="TWO_MATCHES">TWO_MATCHES</option>
          </select>
        </label>

        <div style={{ border: "1px solid #3333", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Matches</div>

          {matches.map((m, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 8, marginBottom: 10 }}>
              <input
                placeholder={`match_id (e.g. M${idx + 1})`}
                value={m.match_id}
                onChange={(e) => setMatch(idx, { match_id: e.target.value })}
                style={{ padding: 8 }}
              />
              <input
                type="date"
                value={m.date}
                onChange={(e) => setMatch(idx, { date: e.target.value })}
                style={{ padding: 8 }}
              />
              <input
                placeholder="kickoff (optional) e.g. 19:15"
                value={m.kickoff_time ?? ""}
                onChange={(e) => setMatch(idx, { kickoff_time: e.target.value })}
                style={{ padding: 8 }}
              />
              <select
                value={m.home_away ?? "H"}
                onChange={(e) => setMatch(idx, { home_away: e.target.value as "H" | "A" })}
                style={{ padding: 8 }}
              >
                <option value="H">H</option>
                <option value="A">A</option>
              </select>
            </div>
          ))}

          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Ath: Leikdagsetningar verða að vera innan viku {weekStart} → {new Date(new Date(weekStart).getTime() + 6 * 86400000).toISOString().slice(0, 10)}.
          </div>
        </div>

        <button onClick={handleSave} disabled={saving || loading} style={{ padding: 10, fontWeight: 700 }}>
          {saving ? "Saving..." : loading ? "Loading..." : "Save week"}
        </button>

        {error && <div style={{ color: "crimson" }}>Villa: {error}</div>}
        {ok && <div style={{ color: "green" }}>{ok}</div>}
      </div>
    </div>
  );
}
