"use client";

import * as React from "react";
import { createClient } from "@supabase/supabase-js";

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
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ 5 spurningar + notes
type Step = 1 | 2 | 3 | 4 | 5 | 6;

// ✅ Always produce YYYY-MM-DD (UTC) so Postgres DATE will accept it
function todayIsoDateUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ✅ Validate YYYY-MM-DD quickly (defensive)
function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return true;
}

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

function friendlySupabaseError(e: any) {
  const msg = String(e?.message ?? e ?? "");

  if (e?.code === "23505" || msg.toLowerCase().includes("duplicate key")) {
    return "Þú hefur nú þegar skilað check-in í dag. Ef þarf að breyta, hafðu samband við þjálfara.";
  }

  if (e?.code === "22007" || msg.toLowerCase().includes("invalid input syntax for type date")) {
    return "Villa með dagsetningu í vistun. Við sendum alltaf YYYY-MM-DD — ef þetta heldur áfram er líklegt að trigger/fall í DB sé að reyna að setja '' í einhvern DATE dálk.";
  }

  if (e?.code === "42501" || msg.toLowerCase().includes("row-level security")) {
    return "Aðgangsvilla (RLS). Þú hefur ekki heimild til að vista check-in. Hafðu samband við þjálfara.";
  }

  return msg || "Villa kom upp við að vista check-in.";
}

export default function PlayerCheckinPage() {
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const [step, setStep] = React.useState<Step>(1);

  // ✅ Research-aligned 5 (1–5, higher = better)
  const [fatigueEnergy, setFatigueEnergy] = React.useState<number | null>(null); // 1–5
  const [sleepQuality, setSleepQuality] = React.useState<number | null>(null); // 1–5
  const [sleepDuration, setSleepDuration] = React.useState<number | null>(null); // 1–5
  const [stressMood, setStressMood] = React.useState<number | null>(null); // 1–5
  const [muscleSoreness, setMuscleSoreness] = React.useState<number | null>(null); // 1–5 (5 = feeling great)

  const [notes, setNotes] = React.useState("");

  // IMPORTANT: playerId þarf að vera players.id (FK í readiness_entries)
  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [playerName, setPlayerName] = React.useState<string | null>(null);

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

      if (!playerRow?.id) {
        const { error: ensureErr } = await supabase.rpc("ensure_player_for_user");
        if (cancelled) return;

        if (ensureErr) {
          setLoading(false);
          setError(`Gat ekki tengt notanda við leikmann: ${ensureErr.message}`);
          return;
        }

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

      setPlayerId(playerRow.id);
      setPlayerName(playerRow.full_name ?? null);
      setLoading(false);
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  const canGoNext = React.useMemo(() => {
    if (step === 1) return fatigueEnergy !== null;
    if (step === 2) return sleepQuality !== null;
    if (step === 3) return sleepDuration !== null;
    if (step === 4) return stressMood !== null;
    if (step === 5) return muscleSoreness !== null;
    return true;
  }, [step, fatigueEnergy, sleepQuality, sleepDuration, stressMood, muscleSoreness]);

  const submit = async () => {
    if (!playerId) return;

    if (
      fatigueEnergy === null ||
      sleepQuality === null ||
      sleepDuration === null ||
      stressMood === null ||
      muscleSoreness === null
    ) {
      setError("Vinsamlegast svaraðu öllum 5 spurningunum áður en þú sendir.");
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const entry_date = todayIsoDateUTC();
      if (!isIsoDate(entry_date)) {
        throw {
          code: "22007",
          message: `invalid input syntax for type date: "${String(entry_date)}" (client guard)`,
        };
      }

      // ✅ Send ONLY the research-aligned columns.
      // DB trigger will compute total_score + fill legacy readiness/sleep/soreness.
      const payload = {
        player_id: playerId,
        entry_date,
        fatigue_energy: fatigueEnergy,
        sleep_quality: sleepQuality,
        sleep_duration: sleepDuration,
        stress_mood: stressMood,
        muscle_soreness: muscleSoreness,
        notes: notes.trim() ? notes.trim() : null,
      };

      console.log("CHECKIN payload:", payload);

      const res = await supabase
        .from("readiness_entries")
        .insert(payload)
        .select("id, entry_date")
        .single();

      if (res.error) {
        console.error("CHECKIN insert error (raw):", res.error);
        console.error("CHECKIN insert error (json):", JSON.stringify(res.error, null, 2));
        throw res.error;
      }

      if (!res.data?.id) {
        throw { message: "Insert tókst ekki (ekkert svar frá DB)." };
      }

      setSuccess(true);
    } catch (e: any) {
      console.error("CHECKIN submit error:", e);
      setError(friendlySupabaseError(e));
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
              Takk{playerName ? `, ${playerName}` : ""}! Dagsæfing er nú uppfærð og læst sjálfvirkt.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">Fatigue/Energy: {fatigueEnergy ?? "-"}</Badge>
              <Badge variant="secondary">Sleep quality: {sleepQuality ?? "-"}</Badge>
              <Badge variant="secondary">Sleep duration: {sleepDuration ?? "-"}</Badge>
              <Badge variant="secondary">Stress/Mood: {stressMood ?? "-"}</Badge>
              <Badge variant="secondary">Muscle soreness: {muscleSoreness ?? "-"}</Badge>
            </div>

            {notes.trim() ? (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">Athugasemd</div>
                <div className="whitespace-pre-wrap">{notes.trim()}</div>
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
          30 sek. — skýr merki = betri ákvörðun og læst dagsæfing.
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {step === 1 && "Fatigue / Energy (1–5)"}
              {step === 2 && "Sleep quality (1–5)"}
              {step === 3 && "Sleep duration (1–5)"}
              {step === 4 && "Stress & mood (1–5)"}
              {step === 5 && "General muscle soreness (1–5)"}
              {step === 6 && "Athugasemd (valfrjálst)"}
            </CardTitle>
            <div className="flex items-center gap-2">
              <StepDot active={step >= 1} />
              <StepDot active={step >= 2} />
              <StepDot active={step >= 3} />
              <StepDot active={step >= 4} />
              <StepDot active={step >= 5} />
              <StepDot active={step >= 6} />
            </div>
          </div>

          <CardDescription>
            {step === 1 && "Hvernig er orkan/þreytan í dag? 5 = mjög fersk/ur."}
            {step === 2 && "Hvernig var gæði svefns? 5 = mjög góður svefn."}
            {step === 3 && "Hversu lengi svafstu? 5 = 8+ klst."}
            {step === 4 && "Hvernig er stress/skap í dag? 5 = mjög gott."}
            {step === 5 && "Hvernig er almenn vöðvaeymsli? 5 = feeling great."}
            {step === 6 && "Ef eitthvað skiptir máli (t.d. stífleiki, veikindi, óvenjulegt stress) skrifaðu hér."}
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
              <Label>Fatigue / Energy</Label>
              <PillScale
                ariaLabel="Fatigue/Energy val"
                value={fatigueEnergy}
                onChange={setFatigueEnergy}
                options={[
                  { v: 1, label: "Very tired", hint: "Mikil þreyta" },
                  { v: 2, label: "Quite tired", hint: "Frekar þreytt/ur" },
                  { v: 3, label: "Normal", hint: "Góð/ur" },
                  { v: 4, label: "Fresh", hint: "Fersk/ur" },
                  { v: 5, label: "Very fresh", hint: "Mjög fersk/ur" },
                ]}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <Label>Sleep quality</Label>
              <PillScale
                ariaLabel="Sleep quality val"
                value={sleepQuality}
                onChange={setSleepQuality}
                options={[
                  { v: 1, label: "Very bad", hint: "Mjög slæmur" },
                  { v: 2, label: "Bad", hint: "Slæmur" },
                  { v: 3, label: "Restless", hint: "Órólegur" },
                  { v: 4, label: "Good", hint: "Góður" },
                  { v: 5, label: "Very good", hint: "Mjög góður" },
                ]}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <Label>Sleep duration</Label>
              <PillScale
                ariaLabel="Sleep duration val"
                value={sleepDuration}
                onChange={setSleepDuration}
                options={[
                  { v: 1, label: "< 5 hours", hint: "Mjög stuttur svefn" },
                  { v: 2, label: "5–6 hours", hint: "Stuttur" },
                  { v: 3, label: "6–7 hours", hint: "Miðlungs" },
                  { v: 4, label: "7–8 hours", hint: "Góður" },
                  { v: 5, label: "8+ hours", hint: "Mjög góður" },
                ]}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2">
              <Label>Stress & mood</Label>
              <PillScale
                ariaLabel="Stress & mood val"
                value={stressMood}
                onChange={setStressMood}
                options={[
                  { v: 1, label: "Very stressed", hint: "Mjög stressaður eða mjög mikið álag" },
                  { v: 2, label: "Stressed", hint: "Stressaður / mikið álag" },
                  { v: 3, label: "Normal", hint: "Góð/ur" },
                  { v: 4, label: "Feeling good", hint: "Líður vel" },
                  { v: 5, label: "Feeling great", hint: "Líður frábærlega" },
                ]}
              />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-2">
              <Label>General muscle soreness</Label>
              <PillScale
                ariaLabel="General muscle soreness val"
                value={muscleSoreness}
                onChange={setMuscleSoreness}
                options={[
                  { v: 1, label: "Very sore", hint: "Mjög aum/ur" },
                  { v: 2, label: "Some soreness", hint: "Frekar aum/ur" },
                  { v: 3, label: "Normal", hint: "Góð/ur" },
                  { v: 4, label: "Good", hint: "Fersk/ur" },
                  { v: 5, label: "Feeling great", hint: "Mjög fersk/ur" },
                ]}
              />
            </div>
          ) : null}

          {step === 6 ? (
            <div className="space-y-2">
              <Label htmlFor="notes">Athugasemd</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Dæmi: stífur í mjöðm, illt í hásin, veikindi, óvenjulegt stress…"
                className="min-h-[120px] rounded-xl"
              />
              <div className="text-xs text-muted-foreground">
                Valfrjálst — en getur hjálpað þjálfara að setja rétta áætlun.
              </div>
            </div>
          ) : null}

          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Skref {step}/6</span>
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

          {step < 6 ? (
            <Button
              type="button"
              className="w-2/3 rounded-xl"
              onClick={() => setStep((s) => (Math.min(6, s + 1) as Step))}
              disabled={!canGoNext || saving}
            >
              Áfram
            </Button>
          ) : (
            <Button
              type="button"
              className="w-2/3 rounded-xl"
              onClick={submit}
              disabled={
                saving ||
                fatigueEnergy === null ||
                sleepQuality === null ||
                sleepDuration === null ||
                stressMood === null ||
                muscleSoreness === null
              }
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