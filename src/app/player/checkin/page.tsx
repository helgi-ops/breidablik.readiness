"use client";

import * as React from "react";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";

// shadcn/ui
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Supabase client (client-side)
// ATH: Ef þú ert með eigin helper (t.d. src/lib/supabaseClient), notaðu hann í staðinn.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Step = 1 | 2 | 3 | 4;

function PillScale({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: number | null;
  onChange: (v: number) => void;
  options: { v: number; label: string; hint?: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.v)}
            className={[
              "rounded-xl border px-3 py-2 text-left transition",
              "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              active ? "border-primary bg-primary/10" : "bg-background",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.v}</span>
            </div>
            {o.hint ? <div className="mt-1 text-xs text-muted-foreground">{o.hint}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

function StepDot({ active }: { active: boolean }) {
  return (
    <div
      className={[
        "h-2.5 w-2.5 rounded-full transition",
        active ? "bg-primary" : "bg-muted-foreground/30",
      ].join(" ")}
    />
  );
}

export default function PlayerCheckinPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const [step, setStep] = React.useState<Step>(1);

  const [readiness, setReadiness] = React.useState<number | null>(null); // 1–10
  const [sleep, setSleep] = React.useState<number | null>(null); // 0–2
  const [soreness, setSoreness] = React.useState<number | null>(null); // 1–5
  const [notes, setNotes] = React.useState("");

  // IMPORTANT: playerId þarf að vera players.id (FK í readiness_entries)
  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [playerName, setPlayerName] = React.useState<string | null>(null);

  // ✅ DEBUG: geymum result svo þú getur séð þetta líka í UI ef þarf (valfrjálst)
  const [debugWeekData, setDebugWeekData] = React.useState<any[] | null>(null);
  const [debugWeekError, setDebugWeekError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setError(null);
      setLoading(true);

      const { data: authRes, error: authErr } = await supabase.auth.getUser();
      if (cancelled) return;

      if (authErr) {
        setLoading(false);
        setError(authErr.message);
        return;
      }

      const user = authRes?.user;
      if (!user) {
        setLoading(false);
        setError("Þú þarft að vera skráður inn til að skila check-in.");
        return;
      }

      // ✅ 1) Reyna að finna players row
      let { data: playerRow, error: playerErr } = await supabase
        .from("players")
        .select("id, full_name")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (playerErr) {
        setLoading(false);
        setError(playerErr.message);
        return;
      }

      // ✅ 2) Ef enginn leikmaður: búa til via RPC (ensure)
      // ATH: þetta krefst að þú hafir búið til RPC í Supabase: public.ensure_player_for_user()
      if (!playerRow?.id) {
        const { error: ensureErr } = await supabase.rpc("ensure_player_for_user");
        if (cancelled) return;

        if (ensureErr) {
          setLoading(false);
          setError(`Gat ekki tengt notanda við leikmann: ${ensureErr.message}`);
          return;
        }

        // ✅ 3) Re-fetch players row eftir ensure
        const res2 = await supabase
          .from("players")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        if (res2.error) {
          setLoading(false);
          setError(res2.error.message);
          return;
        }

        playerRow = res2.data ?? null;
      }

      if (!playerRow?.id) {
        setLoading(false);
        setError("Notandi er ekki tengdur leikmanni (players).");
        return;
      }

      // ✅ playerId = players.id -> FK OK í readiness_entries
      setPlayerId(playerRow.id);
      setPlayerName(playerRow.full_name ?? null);
      setLoading(false);
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  // ✅ DEBUG: Sækja vikugögn úr v_player_daily_decision_v3
  React.useEffect(() => {
    let cancelled = false;

    async function loadWeek() {
      if (!playerId) return;

      const { data, error } = await supabase
        .from("v_player_daily_decision_v3")
        .select("*")
        .eq("player_id", playerId)
        .gte("day_date", "2026-02-02")
        .lte("day_date", "2026-02-08")
        .order("day_date", { ascending: true });

      if (cancelled) return;

      console.log("PLAYER WEEK DATA", data, error);

      setDebugWeekData((data as any[]) ?? null);
      setDebugWeekError(error?.message ?? null);
    }

    loadWeek();

    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const canGoNext = React.useMemo(() => {
    if (step === 1) return readiness !== null;
    if (step === 2) return sleep !== null;
    if (step === 3) return soreness !== null;
    return true;
  }, [step, readiness, sleep, soreness]);

  const submit = async () => {
    if (!playerId) return;

    if (readiness === null || sleep === null || soreness === null) {
      setError("Vinsamlegast fylltu út readiness, svefn og eymsli áður en þú sendir.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const entry_date = new Date().toISOString().slice(0, 10);

      const payload = {
        player_id: playerId, // ✅ players.id -> FK constraint OK
        entry_date,
        readiness,
        sleep,
        soreness,
        notes: notes?.trim() || null,
      };

      const { error: insErr } = await supabase.from("readiness_entries").insert(payload);
      if (insErr) throw insErr;

      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? "Villa kom upp við að vista check-in.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4">
        <div className="w-full rounded-2xl border bg-card p-6 text-center">
          <div className="text-sm text-muted-foreground">Hleð check-in…</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Check-in móttekið ✅</CardTitle>
            <CardDescription>
              Takk{playerName ? `, ${playerName}` : ""}! Þetta hjálpar þjálfarateyminu að stilla
              dagskrána.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Readiness: {readiness ?? "-"}</Badge>
              <Badge variant="secondary">Svefn: {sleep ?? "-"}</Badge>
              <Badge variant="secondary">Eymsli: {soreness ?? "-"}</Badge>
            </div>
            {notes ? (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Athugasemd</div>
                <div className="whitespace-pre-wrap">{notes}</div>
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
            <Button className="w-full rounded-xl" onClick={() => (window.location.href = "/player")}>
              Fara á leikmannasíðu
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Daglegt check-in</h1>

          <Badge variant="outline" className="rounded-full">
            {playerName ? playerName : "Leikmaður"}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          30 sek. — skýr merki = betri ákvörðun fyrir daginn.
        </p>

        <div className="mt-2 text-xs text-muted-foreground">
          <div>debug week rows: {debugWeekData ? debugWeekData.length : 0}</div>
          {debugWeekError ? (
            <div className="text-destructive">debug error: {debugWeekError}</div>
          ) : null}
        </div>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {step === 1 && "Readiness"}
              {step === 2 && "Svefn (0–2)"}
              {step === 3 && "Eymsli (1–5)"}
              {step === 4 && "Athugasemd (valfrjálst)"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <StepDot active={step >= 1} />
              <StepDot active={step >= 2} />
              <StepDot active={step >= 3} />
              <StepDot active={step >= 4} />
            </div>
          </div>

          <CardDescription>
            {step === 1 && "Veldu það sem passar best (vistast sem 1–10 í kerfinu)."}
            {step === 2 && "Svefn síðustu nótt. 2 = góður svefn."}
            {step === 3 && "Hversu aumur/auð? 1 = engin eymsli, 5 = mjög slæmt."}
            {step === 4 && "Ef eitthvað skiptir máli (t.d. stífleiki, veikindi, stress) skrifaðu hér."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-2">
              <Label>Veldu readiness</Label>
              <PillScale
                ariaLabel="Readiness val"
                value={readiness}
                onChange={setReadiness}
                options={[
                  { v: 2, label: "Lágt", hint: "Þreyta / Mikið orkuleysi" },
                  { v: 4, label: "Frekar lágt", hint: "Smá orkuleysi" },
                  { v: 6, label: "Miðlungs", hint: "Allt í lagi/Þokkaleg/ur " },
                  { v: 8, label: "Gott", hint: "Ferskur" },
                  { v: 10, label: "Frábært", hint: "Mjög ferskur" },
                ]}
              />
              <div className="text-xs text-muted-foreground">
                Ef þú vilt nákvæmara: þú getur hugsað 1–10,.
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <Label>Svefn</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 0, t: "Slakur", d: "Lítill eða truflaður" },
                  { v: 1, t: "Miðlungs", d: "Allt í lagi" },
                  { v: 2, t: "Góður", d: "Hvíldin góð" },
                ].map((o) => {
                  const active = sleep === o.v;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setSleep(o.v)}
                      className={[
                        "rounded-xl border p-3 text-left transition",
                        "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                        active ? "border-primary bg-primary/10" : "bg-background",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{o.t}</div>
                        <div className="text-xs text-muted-foreground">{o.v}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{o.d}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <Label>Eymsli</Label>
              <PillScale
                ariaLabel="Eymsli val"
                value={soreness}
                onChange={setSoreness}
                options={[
                  { v: 1, label: "Engin", hint: "fersk/ur" },
                  { v: 2, label: "Lítil", hint: "Finnst aðeins til" },
                  { v: 3, label: "Miðlungs", hint: "Áberandi en ekki of mikið" },
                  { v: 4, label: "Mikil", hint: "Frekar erfitt að hreyfa" },
                  { v: 5, label: "Mjög mikil", hint: "Sársauki, get ekki æft" },
                ]}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2">
              <Label htmlFor="notes">Athugasemd</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dæmi: stífur í mjöðm, illt í hásin, lítið borðað, stress…"
                className="min-h-[120px] rounded-xl"
              />
              <div className="text-xs text-muted-foreground">
                Valfrjálst — en getur hjálpað þjálfara að setja rétta áætlun.
              </div>
            </div>
          ) : null}

          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Skref {step}/4</span>
          </div>
        </CardContent>

        <CardFooter className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-1/3 rounded-xl"
            onClick={() => setStep((s) => (Math.max(1, s - 1) as Step))}
            disabled={step === 1 || saving}
          >
            Til baka
          </Button>

          {step < 4 ? (
            <Button
              type="button"
              className="w-2/3 rounded-xl"
              onClick={() => setStep((s) => (Math.min(4, s + 1) as Step))}
              disabled={!canGoNext || saving}
            >
              Áfram
            </Button>
          ) : (
            <Button
              type="button"
              className="w-2/3 rounded-xl"
              onClick={submit}
              disabled={saving || readiness === null || sleep === null || soreness === null}
            >
              {saving ? "Vista…" : "Senda check-in"}
            </Button>
          )}
        </CardFooter>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Ef eitthvað er “off” í líkamanum: skrifaðu athugasemd — það sparar tíma og minnkar áhættu.
      </p>
    </div>
  );
}
