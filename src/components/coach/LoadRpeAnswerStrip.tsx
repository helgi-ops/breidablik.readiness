"use client";

/**
 * LoadRpeAnswerStrip — the answer-first header for the Load & RPE tab.
 *
 * The daily job of that tab is one question: "is the internal-load feed healthy,
 * and who needs a look?" This strip answers it without scrolling — four KPI cards
 * (RPE compliance, today's internal load + 7-day trend, ACWR risk split, HR-vs-sRPE
 * agreement) over a single shared Í dag / Í gær date. Each card anchors to its
 * detail card below. It reuses the SAME data the detail cards already fetch (the
 * session-rpe summary + acwr API routes, and the HR gather + hrLoad engine); no new
 * queries invented. Bilingual, warm-paper tokens.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { computeHrLoad, type HrLoadRow } from "@/lib/micropulse/hrLoad";
import VerdictBanner, { type VerdictTone, type VerdictDriver, type ConfidenceLevel } from "@/components/coach/VerdictBanner";

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoDay(d);
}

type SummaryEntry = { rpe?: number | null; session_load?: number | null; load_band?: string | null };
type Summary = {
  totalExpectedPlayers?: number; totalSubmissions?: number; missingSubmissions?: number;
  avgRpe?: number | null; totalDailyLoad?: number | null;
};
type AcwrPlayer = { full_name?: string; acwr?: number | null; zone?: string };

const num = (v: unknown): number | null => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);

export default function LoadRpeAnswerStrip({ teamId, date, onDate }: { teamId?: string | null; date?: string; onDate?: (d: string) => void }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const IS = lang === "IS";

  const today = useMemo(() => isoDay(new Date()), []);
  // Controlled by the tab (so this one date drives the detail cards too); falls back
  // to its own state if mounted standalone.
  const [ownDate, setOwnDate] = useState(today);
  const dateKey = date ?? ownDate;
  const setDateKey = (d: string) => { setOwnDate(d); onDate?.(d); };

  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<SummaryEntry[]>([]);
  const [series, setSeries] = useState<number[]>([]);       // 7-day team sRPE totals, oldest→newest
  const [acwr, setAcwr] = useState<AcwrPlayer[]>([]);
  const [hr, setHr] = useState<{ belt: number; roster: number; flagged: string[] } | null>(null);
  const [reminderState, setReminderState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  // ── Shared-date signals (RPE summary + 7-day team series) ────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/session-rpe/summary?date=${dateKey}&teamId=${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => null);
        if (!alive || !j) return;
        setSummary(j.summary ?? null);
        setEntries((j.entries ?? []) as SummaryEntry[]);
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [teamId, dateKey, supabase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const from = addDays(dateKey, -6);
        const { data } = await supabase
          .from("session_rpe_entries")
          .select("session_date, session_load")
          .eq("team_id", teamId)
          .gte("session_date", from)
          .lte("session_date", dateKey);
        if (!alive) return;
        const byDay = new Map<string, number>();
        for (const r of (data ?? []) as Array<{ session_date: string; session_load: number | null }>) {
          const d = String(r.session_date).slice(0, 10);
          byDay.set(d, (byDay.get(d) ?? 0) + (num(r.session_load) ?? 0));
        }
        setSeries(Array.from({ length: 7 }, (_, i) => byDay.get(addDays(dateKey, i - 6)) ?? 0));
      } catch { if (alive) setSeries([]); }
    })();
    return () => { alive = false; };
  }, [teamId, dateKey, supabase]);

  // ── 28-day signals (ACWR + HR) — date-independent ────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/coach/session-rpe/acwr?teamId=${teamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = await res.json().catch(() => null);
        if (alive && j) setAcwr((j.players ?? []) as AcwrPlayer[]);
      } catch { /* soft */ }
    })();
    return () => { alive = false; };
  }, [teamId, supabase]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!teamId) return;
      try {
        const start = isoDay(new Date(Date.now() - 28 * 86_400_000));
        const [playersRes, loadRes, rpeRes] = await Promise.all([
          supabase.from("players").select("id, full_name").eq("team_id", teamId).eq("is_active", true),
          supabase.from("player_external_load_daily")
            .select("player_id, date, hr_zone_1_time_s, hr_zone_2_time_s, hr_zone_3_time_s, hr_zone_4_time_s, hr_zone_5_time_s, hr_zone_6_time_s, hr_zone_7_time_s, hr_zone_8_time_s, pct_max_heart_rate")
            .eq("team_id", teamId).gte("date", start),
          supabase.from("session_rpe_entries").select("player_id, session_date, session_load").eq("team_id", teamId).gte("session_date", start),
        ]);
        if (!alive) return;
        const names = new Map<string, string>();
        for (const p of (playersRes.data ?? []) as Array<Record<string, unknown>>) names.set(String(p.id), String(p.full_name ?? "Player"));
        const byPD = new Map<string, Map<string, HrLoadRow>>();
        const ensure = (pid: string, date: string): HrLoadRow => {
          let m = byPD.get(pid); if (!m) { m = new Map(); byPD.set(pid, m); }
          let r = m.get(date); if (!r) { r = { date, srpeLoad: null, hrZonesSec: [], pctMaxHr: null }; m.set(date, r); }
          return r;
        };
        for (const row of (loadRes.data ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.player_id ?? ""); const date = String(row.date ?? "").slice(0, 10);
          if (!pid || !date) continue;
          const r = ensure(pid, date);
          r.hrZonesSec = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => num(row[`hr_zone_${b}_time_s`]));
          r.pctMaxHr = num(row.pct_max_heart_rate);
        }
        for (const row of (rpeRes.data ?? []) as Array<Record<string, unknown>>) {
          const pid = String(row.player_id ?? ""); const date = String(row.session_date ?? "").slice(0, 10);
          if (!pid || !date) continue;
          const load = num(row.session_load); if (load == null) continue;
          const r = ensure(pid, date); r.srpeLoad = (r.srpeLoad ?? 0) + load;
        }
        const flagged: string[] = []; let belt = 0;
        for (const [pid, m] of byPD) {
          const read = computeHrLoad([...m.values()]);
          if (!read.dataCoverage.hasHr) continue;
          belt += 1;
          const a = read.latest?.alignment;
          if (a === "hidden_load" || a === "low_cardio_response") flagged.push((names.get(pid) ?? "Player").split(" ")[0]);
        }
        setHr({ belt, roster: names.size, flagged });
      } catch { if (alive) setHr(null); }
    })();
    return () => { alive = false; };
  }, [teamId, supabase]);

  const sendReminder = useCallback(async () => {
    if (!teamId || reminderState === "sending") return;
    setReminderState("sending");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/notifications/manual-rpe-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ teamId, date: dateKey }),
      });
      setReminderState(res.ok ? "sent" : "error");
    } catch { setReminderState("error"); }
  }, [teamId, dateKey, supabase, reminderState]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const expected = summary?.totalExpectedPlayers ?? 0;
  const submitted = summary?.totalSubmissions ?? 0;
  const missing = summary?.missingSubmissions ?? Math.max(0, expected - submitted);
  const compliance = expected > 0 ? Math.round((submitted / expected) * 100) : 0;

  const totalLoad = num(summary?.totalDailyLoad) ?? 0;
  const meanLoad = submitted > 0 ? Math.round(totalLoad / submitted) : 0;
  const maxLoad = useMemo(() => entries.reduce((m, e) => Math.max(m, num(e.session_load) ?? 0), 0), [entries]);
  const seriesMax = Math.max(1, ...series);

  // Honest load status: today's squad total vs the prior-6-day average (non-zero days
  // only, so rest days don't dilute the baseline). Was a hardcoded "ok" — now computed.
  const priorAvg = useMemo(() => {
    const prior = series.slice(0, 6).filter((v) => v > 0);
    return prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
  }, [series]);
  const loadStatus = useMemo(() => {
    if (totalLoad <= 0 || priorAvg <= 0) return null; // not enough history to judge
    const ratio = totalLoad / priorAvg;
    if (ratio >= 1.5) return { label: { EN: "spike", IS: "stökk" }, bg: "#f9efec", fg: "#8f3d29", ratio };
    if (ratio <= 0.5) return { label: { EN: "light", IS: "létt" }, bg: "#eef2fb", fg: "#3a5bb8", ratio };
    return { label: { EN: "typical", IS: "dæmigert" }, bg: "#eef6f0", fg: "#2e6b4a", ratio };
  }, [totalLoad, priorAvg]);

  const zones = useMemo(() => {
    let hi = 0, caution = 0, ok = 0;
    const flag: { name: string; acwr: number }[] = [];
    for (const p of acwr) {
      const z = String(p.zone ?? "");
      if (z === "high_risk") { hi += 1; flag.push({ name: (p.full_name ?? "").split(" ")[0], acwr: num(p.acwr) ?? 0 }); }
      else if (z === "caution") { caution += 1; flag.push({ name: (p.full_name ?? "").split(" ")[0], acwr: num(p.acwr) ?? 0 }); }
      else ok += 1;
    }
    flag.sort((a, b) => b.acwr - a.acwr);
    return { hi, caution, ok, flag, total: acwr.length };
  }, [acwr]);

  // ── Squad verdict — one plain read of the whole tab + what to do. Rules decide;
  // synthesised from the SAME four signals the KPI cards show (no new data). Ladder:
  // sharp ACWR spike → thin coverage → load spike → HR divergence → mild caution → all-clear.
  const loadVerdict = useMemo((): { tone: VerdictTone; sentence: { EN: string; IS: string }; subtitle?: { EN: string; IS: string }; action?: { EN: string; IS: string }; confidence: { level: ConfidenceLevel; note?: { EN: string; IS: string } }; drivers: VerdictDriver[] } => {
    const dataless = expected === 0 && zones.total === 0 && (!hr || hr.belt === 0);
    if (dataless) {
      return {
        tone: "neutral",
        sentence: { EN: "No load data yet — it fills in as RPE, GPS and belt sessions sync.", IS: "Engin álagsgögn enn — fyllist inn þegar RPE, GPS og beltis-lotur samstillast." },
        confidence: { level: "low" },
        drivers: [],
      };
    }
    const covNote = { EN: `RPE ${compliance}%${hr ? ` · HR ${hr.belt}/${hr.roster}` : ""}`, IS: `RPE ${compliance}%${hr ? ` · HR ${hr.belt}/${hr.roster}` : ""}` };
    const level: ConfidenceLevel = compliance >= 70 && zones.total > 0 ? "moderate" : "low";
    const drivers: VerdictDriver[] = [
      ...zones.flag.slice(0, 4).map((f) => ({ label: f.name, tone: "watch" as const, detail: { EN: `ACWR ${f.acwr.toFixed(2)}`, IS: `ACWR ${f.acwr.toFixed(2)}` } })),
      ...(hr?.flagged ?? []).slice(0, 3).map((n) => ({ label: n, tone: "watch" as const, detail: { EN: "HR≠RPE", IS: "HR≠RPE" } })),
    ].slice(0, 6);

    if (zones.hi > 0) {
      return {
        tone: "watch",
        sentence: { EN: `${zones.hi} player${zones.hi > 1 ? "s" : ""} on a sharp load spike (ACWR high) — the first thing to check today.`, IS: `${zones.hi} leikmað${zones.hi > 1 ? "ur með" : "ur með"} snöggt álagsstökk (ACWR hátt) — það fyrsta til að skoða í dag.` },
        subtitle: { EN: "A workload-change flag, not an injury prediction.", IS: "Merki um álagsbreytingu, ekki meiðsla-spá." },
        action: { EN: "Check their last 1–2 weeks before the next hard session; consider easing their load or spacing high days.", IS: "Skoðaðu síðustu 1–2 vikur þeirra fyrir næstu erfiðu æfingu; íhugaðu að létta álag eða dreifa erfiðum dögum." },
        confidence: { level, note: covNote }, drivers,
      };
    }
    if (expected > 0 && compliance < 50) {
      return {
        tone: "watch",
        sentence: { EN: `Only ${submitted} of ${expected} logged RPE — today's load picture is partial until more submit.`, IS: `Aðeins ${submitted} af ${expected} skráðu RPE — álagsmyndin í dag er ófullkomin þar til fleiri skila.` },
        action: { EN: "Send a reminder (below) — internal load only makes sense once the ratings are in.", IS: "Sendu áminningu (að neðan) — innra álag er aðeins marktækt þegar skráningarnar eru komnar." },
        confidence: { level: "low", note: covNote }, drivers,
      };
    }
    if (loadStatus && loadStatus.label.EN === "spike") {
      return {
        tone: "watch",
        sentence: { EN: `Today's squad load is a spike — ${loadStatus.ratio.toFixed(1)}× the recent daily norm.`, IS: `Álag liðsins í dag er stökk — ${loadStatus.ratio.toFixed(1)}× nýlega dagsvenju.` },
        action: { EN: "Fine if it was planned (a match or heavy session). If not, watch recovery and tomorrow's load.", IS: "Í lagi ef það var planað (leikur eða þung æfing). Annars fylgstu með endurheimt og álagi morgundagsins." },
        confidence: { level, note: covNote }, drivers,
      };
    }
    if (hr && hr.flagged.length > 0) {
      return {
        tone: "watch",
        sentence: { EN: `${hr.flagged.length} player${hr.flagged.length > 1 ? "s" : ""} — heart rate and effort ratings disagree.`, IS: `${hr.flagged.length} leikm. — púls og áreynslumat ósamræmd.` },
        subtitle: { EN: "A cross-check to investigate — not an injury flag.", IS: "Kross-tékk til að skoða — ekki meiðslamerki." },
        action: { EN: "Open Heart Rate Intelligence to see who and why before setting their next load.", IS: "Opnaðu Púls-greiningu til að sjá hverjir og af hverju áður en næsta álag er stillt." },
        confidence: { level, note: covNote }, drivers,
      };
    }
    if (zones.caution > 0) {
      return {
        tone: "watch",
        sentence: { EN: `${zones.caution} player${zones.caution > 1 ? "s" : ""} drifting into the ACWR caution band — worth a glance, nothing urgent.`, IS: `${zones.caution} leikm. að færast í ACWR-varúðarbil — vert að líta, ekkert brýnt.` },
        action: { EN: "Keep an eye on their weekly ramp; no change needed yet.", IS: "Hafðu auga með vikulegu álagi þeirra; engin breyting nauðsynleg enn." },
        confidence: { level, note: covNote }, drivers,
      };
    }
    return {
      tone: "good",
      sentence: { EN: "Load looks controlled and effort ratings are in — nothing to action today.", IS: "Álag lítur stýrt út og áreynslumat komin — ekkert að aðhafast í dag." },
      action: missing > 0
        ? { EN: `The only gap is RPE coverage — ${missing} still to submit.`, IS: `Eina gatið er RPE-þekja — ${missing} eiga eftir að skila.` }
        : { EN: "Full coverage, load in range — you're on top of it.", IS: "Full þekja, álag í jafnvægi — þú hefur stjórn á þessu." },
      confidence: { level, note: covNote }, drivers: [],
    };
  }, [expected, submitted, compliance, missing, zones, hr, loadStatus]);

  if (!teamId) return null;

  const label = { rpe: "RPE skil", load: IS ? "Innra álag dagsins" : "Today's internal load", acwr: IS ? "ACWR áhætta" : "ACWR risk", hr: "HR vs sRPE" };
  const dark = "#2f2e28";
  const dashArc = 2 * Math.PI * 24; // r=24

  return (
    <div className="space-y-4">
      {/* Squad verdict — one plain read + what to do, above the KPI cards */}
      <VerdictBanner
        lang={IS ? "IS" : "EN"}
        kicker={IS ? "Álag & RPE" : "Load & RPE"}
        tone={loadVerdict.tone}
        sentence={loadVerdict.sentence}
        subtitle={loadVerdict.subtitle}
        action={loadVerdict.action}
        confidence={loadVerdict.confidence}
        drivers={loadVerdict.drivers}
      />

      {/* Date scope */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-[#ddd9cf]">
          {[{ k: today, l: IS ? "Í dag" : "Today" }, { k: addDays(today, -1), l: IS ? "Í gær" : "Yesterday" }].map((o) => (
            <button key={o.k} type="button" onClick={() => setDateKey(o.k)}
              className={`px-3 py-1.5 text-xs font-semibold ${dateKey === o.k ? "text-white" : "text-[#5a584f]"}`}
              style={dateKey === o.k ? { background: dark } : { background: "#fff" }}>{o.l}</button>
          ))}
        </div>
        <input type="date" value={dateKey} onChange={(e) => setDateKey(e.target.value)}
          className="rounded-lg border border-[#ddd9cf] bg-white px-2.5 py-1.5 text-xs text-[#5a584f]" />
      </div>

      {/* 4 KPI answer cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* RPE compliance */}
        <a href="#rpe" className="flex items-center gap-3 rounded-2xl border border-[#e8e4d9] bg-white p-4 transition-colors hover:border-[#c9c4b4]" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
            <circle cx="32" cy="32" r="24" fill="none" stroke="#f0eee7" strokeWidth="8" />
            <circle cx="32" cy="32" r="24" fill="none" stroke="#cb8420" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={dashArc} strokeDashoffset={dashArc * (1 - compliance / 100)} transform="rotate(-90 32 32)" />
            <text x="32" y="36" textAnchor="middle" className="fill-[#292824] text-[15px] font-bold tabular-nums">{compliance}%</text>
          </svg>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#908d83]" title={IS ? "Hve margir skráðu áreynslumat (0–10) eftir æfingu. Án skráningar ekkert innra-álag." : "How many logged their effort rating (0–10) after the session. No log → no internal load."}>{label.rpe}</div>
            <div className="text-xl font-bold tabular-nums text-[#292824]">{submitted} / {expected}</div>
            {missing > 0 && <div className="text-xs font-semibold text-[#a4691c]">{missing} {IS ? "vantar" : "missing"} →</div>}
          </div>
        </a>

        {/* Today's internal load + 7-day trend */}
        <a href="#rpe" className="rounded-2xl border border-[#e8e4d9] bg-white p-4 transition-colors hover:border-[#c9c4b4]" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <div className="flex items-start justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#908d83]" title={IS ? "Foster sRPE = mat × mínútur (AU). Heild liðsins í dag + meðaltal/hæst. Huglægt álag." : "Foster sRPE = rating × minutes (AU). Squad total today + avg/max. Subjective load."}>{label.load}</div>
            {loadStatus && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: loadStatus.bg, color: loadStatus.fg }}
                title={IS ? `Í dag vs meðaltal síðustu 6 daga (${loadStatus.ratio.toFixed(1)}×)` : `Today vs the prior 6-day average (${loadStatus.ratio.toFixed(1)}×)`}>
                {IS ? loadStatus.label.IS : loadStatus.label.EN}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[26px] font-bold tabular-nums text-[#292824]">{totalLoad.toLocaleString("is-IS")}</div>
          <div className="text-[11px] text-[#908d83]">sRPE · {IS ? "meðaltal" : "avg"} {meanLoad} · {IS ? "hæst" : "max"} {maxLoad}</div>
          <div className="mt-2 flex h-[26px] items-end gap-1">
            {series.map((v, i) => (
              <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(3, (v / seriesMax) * 26)}px`, background: i === 6 ? "oklch(0.52 0.243 264.376)" : "#ddd9cf" }} />
            ))}
          </div>
          <div className="mt-0.5 flex justify-between text-[9px] text-[#c9c4b4]"><span>−6d</span><span>{IS ? "í dag" : "today"}</span></div>
        </a>

        {/* ACWR risk split */}
        <a href="#acwr" className="rounded-2xl border bg-white p-4 transition-colors hover:border-[#c9c4b4]" style={{ borderColor: zones.hi > 0 ? "#f3e2dc" : "#e8e4d9", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <div className="flex items-start justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#908d83]" title={IS ? "Bráð (7d) ÷ langvinnt (28d) álag. Viðmið um álagsbreytingu, EKKI meiðsla-spá (Impellizzeri 2020)." : "Acute (7d) ÷ chronic (28d) load. A workload-change reference, NOT an injury predictor (Impellizzeri 2020)."}>{label.acwr}</div>
            {(zones.hi + zones.caution) > 0 && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "#f9efec", color: "#8f3d29" }}>{zones.hi + zones.caution} {IS ? "þarf að skoða" : "to check"}</span>}
          </div>
          <div className="mt-1 flex items-end gap-3">
            {[{ n: zones.hi, c: "#8f3d29", l: IS ? "hátt" : "high" }, { n: zones.caution, c: "#a4691c", l: IS ? "varúð" : "caution" }, { n: zones.ok, c: "#2e6b4a", l: IS ? "í lagi" : "ok" }].map((z) => (
              <div key={z.l}><div className="text-[26px] font-bold leading-none tabular-nums" style={{ color: z.c }}>{z.n}</div><div className="text-[11px] text-[#908d83]">{z.l}</div></div>
            ))}
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#f0eee7]">
            {[{ n: zones.hi, c: "#b34a30" }, { n: zones.caution, c: "#cb8420" }, { n: zones.ok, c: "#2b8a54" }].map((z, i) => (
              <div key={i} style={{ width: `${zones.total > 0 ? (z.n / zones.total) * 100 : 0}%`, background: z.c }} />
            ))}
          </div>
          {zones.flag.length > 0 && (
            <div className="mt-1.5 truncate text-xs text-[#8f3d29]">{zones.flag.slice(0, 4).map((f) => `${f.name} ${f.acwr.toFixed(2)}`).join(" · ")}</div>
          )}
        </a>

        {/* HR vs sRPE */}
        <a href="#hr" className="rounded-2xl border border-[#e8e4d9] bg-white p-4 transition-colors hover:border-[#c9c4b4]" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
          <div className="flex items-start justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#908d83]" title={IS ? "Hlutlægur beltis-púls borinn við huglægt matið; ósamræmi = falið álag eða lítið hjarta-drif." : "Objective belt HR cross-checked against the subjective rating; divergence = hidden load or low cardiac demand."}>{label.hr}</div>
            {hr && <span className="text-[11px] text-[#908d83]">{hr.belt}/{hr.roster} {IS ? "með belti" : "with belt"}</span>}
          </div>
          <div className="mt-1 text-[26px] font-bold tabular-nums" style={{ color: (hr?.flagged.length ?? 0) > 0 ? "#a4691c" : "#2e6b4a" }}>{hr?.flagged.length ?? 0}</div>
          <div className="text-[11px] text-[#908d83]">{IS ? "í ósamræmi" : "diverging"}</div>
          {hr && hr.flagged.length > 0 && <div className="mt-1 text-xs leading-snug text-[#5a584f]">{hr.flagged.slice(0, 4).join(", ")}</div>}
        </a>
      </div>

      {/* Missing-players reminder — wired to the real RPE-reminder endpoint */}
      {missing > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eddfb4] px-4 py-2.5" style={{ background: "rgba(251,247,233,0.4)" }}>
          <span className="text-xs font-semibold text-[#8a5718]">{missing} {IS ? "hafa ekki skilað RPE" : "haven't submitted RPE"}</span>
          <button type="button" onClick={sendReminder} disabled={reminderState === "sending" || reminderState === "sent"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#eddfb4] bg-white px-3 py-1.5 text-xs font-semibold text-[#8a5718] disabled:opacity-60">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
            {reminderState === "sent" ? (IS ? "Áminning send ✓" : "Reminder sent ✓")
              : reminderState === "sending" ? (IS ? "Sendi…" : "Sending…")
              : reminderState === "error" ? (IS ? "Villa — reyndu aftur" : "Error — retry")
              : (IS ? "Senda áminningu á alla" : "Remind everyone")}
          </button>
        </div>
      )}
    </div>
  );
}
