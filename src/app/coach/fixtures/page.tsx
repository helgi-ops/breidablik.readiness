"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import PagePurpose from "@/components/coach/PagePurpose";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const COPY = {
  EN: {
    title: "Fixtures",
    subtitleP: "Set the month's games once — Week Setup reads the match day from here.",
    add: "Add fixture", edit: "Edit fixture", save: "Save", cancel: "Cancel",
    date: "Date", opponent: "Opponent", opponentPh: "e.g. FH, Víkingur, Valur…",
    home: "Home", away: "Away", kickoff: "Kickoff (optional)", competition: "Competition (optional)",
    competitionPh: "e.g. Besta deild",
    upcoming: "Upcoming", past: "Recent (played)", none: "No fixtures yet — add the month's games above.",
    del: "Delete", delConfirm: "Delete this fixture?", saving: "Saving…", loading: "Loading…",
    needDate: "Pick a date first.", vs: "vs",
    savedNote: "Week Setup will now auto-detect the match day for any week that contains one of these fixtures.",
    err: "Something went wrong.",
  },
  IS: {
    title: "Leikjadagatal",
    subtitleP: "Settu upp leiki mánaðarins einu sinni — Vikuskipulag les leikdaginn héðan.",
    add: "Bæta við leik", edit: "Breyta leik", save: "Vista", cancel: "Hætta við",
    date: "Dagsetning", opponent: "Andstæðingur", opponentPh: "t.d. FH, Víkingur, Valur…",
    home: "Heima", away: "Úti", kickoff: "Byrjunartími (valfrjálst)", competition: "Mót (valfrjálst)",
    competitionPh: "t.d. Besta deild",
    upcoming: "Framundan", past: "Nýlegt (leikið)", none: "Engir leikir enn — bættu við leikjum mánaðarins að ofan.",
    del: "Eyða", delConfirm: "Eyða þessum leik?", saving: "Vista…", loading: "Hleð…",
    needDate: "Veldu dagsetningu fyrst.", vs: "vs",
    savedNote: "Vikuskipulag þekkir nú sjálfkrafa leikdaginn fyrir hverja viku sem inniheldur einn af þessum leikjum.",
    err: "Eitthvað fór úrskeiðis.",
  },
} as const;

type Fixture = {
  id: string;
  match_date: string;
  opponent: string | null;
  is_home: boolean | null;
  kickoff_time: string | null;
  competition: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabel(iso: string, lang: "EN" | "IS") {
  // iso = YYYY-MM-DD; render "July 2026" / "júlí 2026" without timezone drift.
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return d.toLocaleDateString(lang === "IS" ? "is-IS" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(iso: string, lang: "EN" | "IS") {
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1, day ?? 1));
  return d.toLocaleDateString(lang === "IS" ? "is-IS" : "en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export default function FixturesPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [lang] = useLang();
  const t = COPY[lang === "IS" ? "IS" : "EN"];

  const [teamId, setTeamId] = useState<string | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state (editingId === null → adding a new fixture)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fDate, setFDate] = useState("");
  const [fOpponent, setFOpponent] = useState("");
  const [fHome, setFHome] = useState(true);
  const [fKickoff, setFKickoff] = useState("");
  const [fCompetition, setFCompetition] = useState("");

  function resetForm() {
    setEditingId(null);
    setFDate("");
    setFOpponent("");
    setFHome(true);
    setFKickoff("");
    setFCompetition("");
  }

  async function loadFixtures(tid: string) {
    setLoading(true);
    // Show recent-past (~45d) for reference plus everything upcoming.
    const from = new Date();
    from.setDate(from.getDate() - 45);
    const fromISO = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
    const { data, error: e } = await supabase
      .from("match_schedule")
      .select("id, match_date, opponent, is_home, kickoff_time, competition")
      .eq("team_id", tid)
      .gte("match_date", fromISO)
      .order("match_date", { ascending: true });
    if (e) { setError(e.message); setLoading(false); return; }
    setFixtures((data ?? []) as Fixture[]);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (alive) { setError("Not signed in"); setLoading(false); } return; }
      const { data: profile } = await supabase
        .from("profiles").select("team_id").eq("id", user.id).maybeSingle();
      const tid = (profile as { team_id?: string | null } | null)?.team_id ?? null;
      if (!alive) return;
      setTeamId(tid);
      if (!tid) { setError("No team linked to this account"); setLoading(false); return; }
      await loadFixtures(tid);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  function startEdit(f: Fixture) {
    setEditingId(f.id);
    setFDate(f.match_date);
    setFOpponent(f.opponent ?? "");
    setFHome(f.is_home ?? true);
    setFKickoff(f.kickoff_time ? f.kickoff_time.slice(0, 5) : "");
    setFCompetition(f.competition ?? "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveFixture() {
    if (!teamId) return;
    if (!fDate.trim()) { setError(t.needDate); return; }
    setSaving(true);
    setError(null);
    const payload = {
      team_id: teamId,
      match_date: fDate.trim(),
      opponent: fOpponent.trim() || null,
      is_home: fHome,
      kickoff_time: fKickoff.trim() || null,
      competition: fCompetition.trim() || null,
    };
    // Upsert on (team_id, match_date): editing the same date updates in place;
    // changing the date creates a new fixture (the old date remains — delete it
    // explicitly if it was a typo).
    const { error: e } = await supabase
      .from("match_schedule")
      .upsert(payload, { onConflict: "team_id,match_date" });
    if (e) { setError(e.message); setSaving(false); return; }
    resetForm();
    await loadFixtures(teamId);
    setSaving(false);
  }

  async function deleteFixture(f: Fixture) {
    if (!teamId) return;
    if (typeof window !== "undefined" && !window.confirm(t.delConfirm)) return;
    setSaving(true);
    const { error: e } = await supabase
      .from("match_schedule")
      .delete()
      .eq("team_id", teamId)
      .eq("match_date", f.match_date);
    if (e) { setError(e.message); setSaving(false); return; }
    if (editingId === f.id) resetForm();
    await loadFixtures(teamId);
    setSaving(false);
  }

  const today = todayISO();
  const upcoming = fixtures.filter((f) => f.match_date >= today);
  const past = fixtures.filter((f) => f.match_date < today).reverse();

  function renderGroup(list: Fixture[]) {
    // Group consecutive fixtures by month for a calendar feel.
    const out: React.ReactNode[] = [];
    let curMonth = "";
    for (const f of list) {
      const ml = monthLabel(f.match_date, lang === "IS" ? "IS" : "EN");
      if (ml !== curMonth) {
        curMonth = ml;
        out.push(
          <div key={`m-${f.id}`} className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {ml}
          </div>,
        );
      }
      out.push(
        <div key={f.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <div className="w-28 shrink-0 text-sm font-medium">{dayLabel(f.match_date, lang === "IS" ? "IS" : "EN")}</div>
          <Badge variant={f.is_home ? "default" : "secondary"} className="shrink-0">
            {f.is_home ? t.home : t.away}
          </Badge>
          <div className="min-w-0 flex-1 truncate text-sm">
            <span className="text-muted-foreground">{t.vs} </span>
            <span className="font-medium">{f.opponent || "—"}</span>
            {f.kickoff_time ? <span className="ml-2 text-xs text-muted-foreground">{f.kickoff_time.slice(0, 5)}</span> : null}
            {f.competition ? <span className="ml-2 text-xs text-muted-foreground">· {f.competition}</span> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => startEdit(f)}>{t.edit}</Button>
          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => deleteFixture(f)}>{t.del}</Button>
        </div>,
      );
    }
    return out;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <PagePurpose en={COPY.EN.subtitleP} is={COPY.IS.subtitleP} />
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {/* Add / edit form */}
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? t.edit : t.add}</CardTitle>
          <CardDescription>{t.savedNote}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t.date}</Label>
            <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t.opponent}</Label>
            <Input value={fOpponent} onChange={(e) => setFOpponent(e.target.value)} placeholder={t.opponentPh} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t.home} / {t.away}</Label>
            <div className="flex gap-2">
              <Button type="button" variant={fHome ? "default" : "outline"} className="flex-1" onClick={() => setFHome(true)}>{t.home}</Button>
              <Button type="button" variant={!fHome ? "default" : "outline"} className="flex-1" onClick={() => setFHome(false)}>{t.away}</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t.kickoff}</Label>
            <Input type="time" value={fKickoff} onChange={(e) => setFKickoff(e.target.value)} placeholder="19:15" />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs text-muted-foreground">{t.competition}</Label>
            <Input value={fCompetition} onChange={(e) => setFCompetition(e.target.value)} placeholder={t.competitionPh} />
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={saveFixture} disabled={saving || !fDate}>{saving ? t.saving : t.save}</Button>
          {editingId ? <Button variant="outline" onClick={resetForm} disabled={saving}>{t.cancel}</Button> : null}
        </CardFooter>
      </Card>

      {/* Fixture list */}
      {loading ? (
        <div className="text-sm text-muted-foreground">{t.loading}</div>
      ) : fixtures.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-muted-foreground">{t.none}</div>
      ) : (
        <div className="space-y-6">
          {upcoming.length > 0 ? (
            <div>
              <div className="mb-2 text-sm font-semibold">{t.upcoming}</div>
              <div className="space-y-1">{renderGroup(upcoming)}</div>
            </div>
          ) : null}
          {past.length > 0 ? (
            <div>
              <Separator className="my-2" />
              <div className="mb-2 text-sm font-semibold text-muted-foreground">{t.past}</div>
              <div className="space-y-1 opacity-70">{renderGroup(past)}</div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
