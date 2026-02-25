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

type Step = 1 | 2 | 3 | 4;

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

  // Duplicate checkin same day
  if (e?.code === "23505" || msg.toLowerCase().includes("duplicate key")) {
    return "Þú hefur nú þegar skilað check-in í dag. Ef þarf að breyta, hafðu samband við þjálfara.";
  }

  // Date parsing
  if (e?.code === "22007" || msg.toLowerCase().includes("invalid input syntax for type date")) {
    return "Villa með dagsetningu í vistun. Við sendum alltaf YYYY-MM-DD — ef þetta heldur áfram er líklegt að trigger/fall í DB sé að reyna að setja '' í einhvern DATE dálk.";
  }

  // RLS / auth
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

  const [readiness, setReadiness] = React.useState<number | null>(null); // 1–10
  const [sleep, setSleep] = React.useState<number | null>(null); // 0–2
  const [soreness, setSoreness] = React.useState<number | null>(null); // 1–5
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

      // 1) Find player
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

      // 2) Ensure player exists
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
      // ✅ HARD-SET entry_date so DB never receives "".
      // We also validate format to avoid any weird runtime/cache issues.
      const entry_date = todayIsoDateUTC();
      if (!isIsoDate(entry_date)) {
        throw {
          code: "22007",
          message: `invalid input syntax for type date: "${String(entry_date)}" (client guard)`,
        };
      }

      const payload = {
        player_id: playerId,
        entry_date, // ✅ explicit date
        readiness,
        sleep,
        soreness,
        notes: notes.trim() ? notes.trim() : null,
      };

      console.log("CHECKIN payload:", payload);

      // ✅ Ask Supabase to return the inserted row so we know insert truly succeeded
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

      // ✅ extra sanity: if no data comes back, treat as failure (shouldn't happen with .single())
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
              <Badge variant="secondary">Readiness: {readiness ?? "-"}</Badge>
              <Badge variant="secondary">Svefn: {sleep ?? "-"}</Badge>
              <Badge variant="secondary">Eymsli: {soreness ?? "-"}</Badge>
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
                  { v: 6, label: "Miðlungs", hint: "Allt í lagi/Þokkaleg/ur" },
                  { v: 8, label: "Gott", hint: "Ferskur" },
                  { v: 10, label: "Frábært", hint: "Mjög ferskur" },
                ]}
              />
              <div className="text-xs text-muted-foreground">Ef þú vilt nákvæmara: hugsaðu 1–10.</div>
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
                  { v: 2, label: "Lítil", hint: "Finn aðeins til" },
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
