"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient"; // ✅ NOTA project client

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
import EnableRemindersCard from "@/components/player/EnableRemindersCard";
import ChatThread from "@/components/chat/ChatThread";
import { useLang } from "@/lib/lang";
import { PLAYER_COPY } from "../playerCopy";
type Step = 1 | 2 | 3 | 4 | 5;

/** Per-question "why we ask" explanation — the explainability layer that makes
 *  the check-in more than a form. Plain language first, light source tag. */
function WhyBox({ title, why, src }: { title: string; why: string; src: string }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary/80">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-foreground/80">{why}</p>
      <div className="mt-1.5 text-xs text-muted-foreground">{src}</div>
    </div>
  );
}

function todayIsoDateUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return true;
}

type ScaleOption = { v: number; en: string; is: string; subEN?: string; subIS?: string };

// Selected-state tone by answer value on the 1(worst)→5(best) scale, so the
// player sees the readiness meaning of their answer: 4–5 good (cobalt), 3
// middling (gold/amber), 1–2 low (clay/red). Class names stay amber/red — the
// central theme remap resolves them to the warm palette. See [[theme-is-palette-remap]].
function optionTone(v: number, active: boolean): string {
  if (!active) return "border-input bg-background hover:bg-muted";
  if (v >= 4) return "border-primary bg-primary/10";
  if (v === 3) return "border-amber-400 bg-amber-50";
  return "border-red-400 bg-red-50";
}

// Full-width vertical rows (label + optional sub-hint on the left, value on the
// right) — the readable one-question-per-line layout from the design spec, not a
// cramped 5-column grid.
function PillScale({
  value,
  onChange,
  options,
  ariaLabel,
  lang,
}: {
  value: number | null;
  onChange: (v: number) => void;
  options: ScaleOption[];
  ariaLabel: string;
  lang: "IS" | "EN";
}) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.v;
        const sub = lang === "IS" ? o.subIS : o.subEN;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.v)}
            className={[
              "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              optionTone(o.v, active),
            ].join(" ")}
          >
            <span className="min-w-0">
              <span className="text-sm font-semibold">{lang === "IS" ? o.is : o.en}</span>
              {sub ? <span className="ml-2 text-xs font-normal text-muted-foreground">· {sub}</span> : null}
            </span>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">{o.v}</span>
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

function friendlySupabaseError(e: any, lang: "IS" | "EN" = "IS") {
  const msg = String(e?.message ?? e ?? "");
  const is = lang === "IS";

  if (e?.code === "23505" || msg.toLowerCase().includes("duplicate key")) {
    return is
      ? "Þú hefur nú þegar skilað check-in í dag. Ef þarf að breyta, hafðu samband við þjálfara."
      : "You've already submitted a check-in today. If you need to change it, contact your coach.";
  }

  if (e?.code === "22007" || msg.toLowerCase().includes("invalid input syntax for type date")) {
    return is
      ? "Villa með dagsetningu í vistun. Við sendum alltaf YYYY-MM-DD — ef þetta heldur áfram er líklegt að trigger/fall í DB sé að reyna að setja '' í einhvern DATE dálk."
      : "Date error while saving. We always send YYYY-MM-DD — if this persists, a DB trigger/function is likely trying to insert '' into a DATE column.";
  }

  if (e?.code === "42501" || msg.toLowerCase().includes("row-level security")) {
    return is
      ? "Aðgangsvilla (RLS). Þú hefur ekki heimild til að vista check-in. Hafðu samband við þjálfara."
      : "Access error (RLS). You don't have permission to save a check-in. Contact your coach.";
  }

  return msg || (is ? "Villa kom upp við að vista check-in." : "Something went wrong saving your check-in.");
}

/** Where to go after check-in. PT clients open this with ?return=/client so
 *  they land back in the PT shell instead of the football /team surface.
 *  Only same-origin paths are honoured (guards against open-redirect). */
function checkinReturnPath(): string {
  if (typeof window === "undefined") return "/player";
  const r = new URLSearchParams(window.location.search).get("return");
  return r && r.startsWith("/") && !r.startsWith("//") ? r : "/player";
}

export default function PlayerCheckinPage() {
  const supabase = React.useMemo(() => getSupabaseClient(), []);
  const router = useRouter();
  const [lang] = useLang();
  const c = PLAYER_COPY[lang].checkin;

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const [step, setStep] = React.useState<Step>(1);

  const [fatigueEnergy, setFatigueEnergy] = React.useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = React.useState<number | null>(null);
  const [sleepDuration, setSleepDuration] = React.useState<number | null>(null);
  const [stressMood, setStressMood] = React.useState<number | null>(null);
  const [muscleSoreness, setMuscleSoreness] = React.useState<number | null>(null);

  // Wearable auto-detected sleep for last night (if any). When non-null the
  // sleep-quality + sleep-duration steps pre-fill from it and show a "📱
  // auto-detected from Polar" hint so the player knows where the value came
  // from (and can override if it feels wrong). This closes the loop:
  // wearable_sleep_data rows feed the readiness check-in instead of just
  // sitting in a table doing nothing.
  const [wearableSleepHint, setWearableSleepHint] = React.useState<{
    provider: string;
    totalMin: number;
    sleepDate: string;
  } | null>(null);

  const [notes, setNotes] = React.useState("");

  const [playerId, setPlayerId] = React.useState<string | null>(null);
  const [playerName, setPlayerName] = React.useState<string | null>(null);
  const [isGameDay, setIsGameDay] = React.useState(false);
  const [gameBypass, setGameBypass] = React.useState(false);

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

      // ✅ DEBUG: STRAX EFTIR getUser()
      console.log("CHECKIN auth.uid:", user?.id ?? null);

      if (!user) {
        setLoading(false);
        router.replace(`/login?next=${encodeURIComponent("/player/checkin")}`);
        return;
      }

      let { data: playerRow, error: playerErr } = await supabase
        .from("players")
        .select("id, full_name, user_id")
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
          .select("id, full_name, user_id")
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

      // ✅ DEBUG: staðfestum mapping (hjálpar við “einn leikmaður failar”)
      console.log("CHECKIN player.id:", playerRow.id, "player.user_id:", playerRow.user_id ?? null);

      // ✅ SANITY: ef eitthvað er “off” í mapping (ætti aldrei að gerast ef query eq user_id)
      if (playerRow.user_id && playerRow.user_id !== user.id) {
        setLoading(false);
        setError(lang === "IS"
          ? "Tenging notanda við leikmann er röng (user_id mismatch). Hafðu samband við þjálfara."
          : "User-to-player link is wrong (user_id mismatch). Contact your coach.");
        return;
      }

      setPlayerId(playerRow.id);
      setPlayerName(playerRow.full_name ?? null);

      // Fetch today's MD day to detect game days. PT clients must NOT inherit
      // any team's week setup — their check-in is always the plain readiness
      // form, never the match-day bypass. So skip this entirely in PT context.
      const ptClientContext = checkinReturnPath().startsWith("/client");
      const today = todayIsoDateUTC();
      if (!ptClientContext) {
        const { data: microdose } = await supabase
          .from("v_player_today_microdose_resolved")
          .select("md_day_resolved, md_day_raw")
          .eq("player_id", playerRow.id)
          .eq("entry_date", today)
          .maybeSingle();
        if (!cancelled) {
          const mdVal = String((microdose as any)?.md_day_resolved ?? (microdose as any)?.md_day_raw ?? "").trim().toUpperCase();
          setIsGameDay(mdVal === "MD");
        }
      } else if (!cancelled) {
        setIsGameDay(false);
      }

      // Look for fresh wearable sleep for last night. wearable_sleep_data
      // uses sleep_date = wake-up date, so for today's check-in we want the
      // row dated today (woke up this morning) — if syncing happened
      // overnight via webhook/cron — or yesterday (the player slept Sat→Sun
      // and check-in is Sunday morning before next sync). Pick the most
      // recent within 1 day of today.
      const { data: wearableSleep } = await supabase
        .from("wearable_sleep_data")
        .select("provider, total_sleep_min, sleep_date, provider_score")
        .eq("player_id", playerRow.id)
        .gte("sleep_date", new Date(Date.now() - 36 * 3600 * 1000).toISOString().slice(0, 10))
        .order("sleep_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelled && wearableSleep) {
        const ws = wearableSleep as {
          provider: string; total_sleep_min: number | null; sleep_date: string; provider_score: number | null;
        };
        if (ws.total_sleep_min && ws.total_sleep_min > 0) {
          setWearableSleepHint({
            provider: ws.provider,
            totalMin: ws.total_sleep_min,
            sleepDate: ws.sleep_date,
          });
          // Pre-fill sleep duration from wearable (player can override).
          // Map total_sleep_min to the 5-step sleep_duration scale (matching the
          // pill ranges): <5h=1, 5-6h=2, 6-7h=3, 7-8h=4, 8h+=5.
          const h = ws.total_sleep_min / 60;
          const durationStep = h < 5 ? 1 : h < 6 ? 2 : h < 7 ? 3 : h < 8 ? 4 : 5;
          setSleepDuration(durationStep);
          // Pre-fill sleep quality from provider's own sleep score when
          // available (Polar Sleep+ 1-100). Map 1-100 → 1-5: <40=1, 40-55=2,
          // 55-70=3, 70-85=4, 85+=5. Conservative mapping.
          if (typeof ws.provider_score === "number" && ws.provider_score > 0) {
            const s = ws.provider_score;
            const qualityStep = s < 40 ? 1 : s < 55 ? 2 : s < 70 ? 3 : s < 85 ? 4 : 5;
            setSleepQuality(qualityStep);
          }
        }
      }

      setLoading(false);
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

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
      // ✅ Refresh user snapshot right before save (helps with “stuck session”)
      const { data: authRes } = await supabase.auth.getUser();
      console.log("CHECKIN submit auth.uid:", authRes?.user?.id ?? null);

      const entry_date = todayIsoDateUTC();
      if (!isIsoDate(entry_date)) {
        throw {
          code: "22007",
          message: `invalid input syntax for type date: "${String(entry_date)}" (client guard)`,
        };
      }

      // notes is kept out of the main upsert — some DB environments don't have
      // the column yet. We attempt a separate update after the core insert succeeds.
      const payload = {
        player_id: playerId,
        entry_date,
        fatigue_energy: fatigueEnergy,
        sleep_quality: sleepQuality,
        sleep_duration: sleepDuration,
        stress_mood: stressMood,
        muscle_soreness: muscleSoreness,
      };

      console.log("CHECKIN payload:", payload);

      // ✅ UPSERT = idempotent, verndar gegn duplicates/tvísmelli
      const res = await supabase
        .from("readiness_entries")
        .upsert(payload, { onConflict: "player_id,entry_date" })
        .select("id, entry_date")
        .single();

      console.log("CHECKIN upsert result:", { data: res.data, error: res.error });

      if (res.error) {
        console.error("CHECKIN upsert error (raw):", res.error);
        console.error("CHECKIN upsert error (json):", JSON.stringify(res.error, null, 2));
        throw res.error;
      }

      if (!res.data?.id) {
        throw { message: "Vistun tókst ekki (ekkert svar frá DB)." };
      }

      // Attempt to save notes and sore_areas separately — fail silently if columns don't exist
      const extraFields: Record<string, unknown> = {};
      const trimmedNotes = notes.trim();
      if (trimmedNotes) extraFields.notes = trimmedNotes;

      if (Object.keys(extraFields).length > 0) {
        const extraRes = await supabase
          .from("readiness_entries")
          .update(extraFields)
          .eq("id", res.data.id);
        if (extraRes.error) {
          console.warn("CHECKIN extra fields update failed (columns may not exist):", extraRes.error.message);
        }
      }

      setSuccess(true);
    } catch (e: any) {
      console.error("CHECKIN submit error:", e);
      setError(friendlySupabaseError(e, lang));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center px-4">
        <div className="w-full rounded-2xl border bg-card p-6 text-center">
          <div className="text-sm text-muted-foreground">{lang === "IS" ? "Hleð check-in…" : "Loading check-in…"}</div>
        </div>
      </div>
    );
  }

  if (isGameDay && !gameBypass) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">{lang === "IS" ? "🏟️ Leikdagur" : "🏟️ Match day"}</CardTitle>
            <CardDescription>
              {lang === "IS"
                ? "Í dag er leikur. Check-in er valkvætt — GPS og RPE eftir leikinn koma sjálfvirkt inn í kerfið og þjálfarinn hefur allar nauðsynlegar upplýsingar."
                : "There's a match today. Check-in is optional — post-match GPS and RPE flow into the system automatically and the coach has everything needed."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {lang === "IS"
                ? "Ef eitthvað er að (meiðsl, veikindi eða sérstök þreyta) — gerðu check-in svo þjálfarinn fái vitneskju áður en leikurinn fer í gang."
                : "If something's off (injury, illness or unusual fatigue) — check in so the coach knows before kickoff."}
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-1/2 rounded-xl"
              onClick={() => router.push(checkinReturnPath())}
            >
              {lang === "IS" ? "Sleppa" : "Skip"}
            </Button>
            <Button
              type="button"
              className="w-1/2 rounded-xl"
              onClick={() => setGameBypass(true)}
            >
              {lang === "IS" ? "Gera Check-in" : "Check in"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">{lang === "IS" ? "Check-in móttekið ✅" : "Check-in received ✅"}</CardTitle>
            <CardDescription>
              {lang === "IS"
                ? `Takk${playerName ? `, ${playerName}` : ""}! Dagsæfing er nú uppfærð og læst sjálfvirkt.`
                : `Thanks${playerName ? `, ${playerName}` : ""}! Today's session is now updated and locked automatically.`}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{c.q.fatigue.title}: {fatigueEnergy ?? "-"}</Badge>
              <Badge variant="secondary">{c.q.sleepQuality.title}: {sleepQuality ?? "-"}</Badge>
              <Badge variant="secondary">{c.q.sleepDuration.title}: {sleepDuration ?? "-"}</Badge>
              <Badge variant="secondary">{c.q.stressMood.title}: {stressMood ?? "-"}</Badge>
              <Badge variant="secondary">{c.q.soreness.title}: {muscleSoreness ?? "-"}</Badge>
            </div>

            {notes.trim() ? (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">{lang === "IS" ? "Athugasemd" : "Note"}</div>
                <div className="whitespace-pre-wrap">{notes.trim()}</div>
              </div>
            ) : null}

          </CardContent>

          {/* Coach-player chat */}
          {playerId && (
            <div className="px-6 pb-4">
              <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">{lang === "IS" ? "Skilaboð frá þjálfara" : "Message from coach"}</div>
              <ChatThread
                playerId={playerId}
                playerName={playerName ?? (lang === "IS" ? "Leikmaður" : "Player")}
                entryDate={todayIsoDateUTC()}
                compact
                viewerRole="player"
                lang={lang}
              />
            </div>
          )}

          <CardFooter>
            <Button className="w-full rounded-xl" onClick={() => (window.location.href = checkinReturnPath())}>
              {lang === "IS" ? "Áfram" : "Continue"}
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
          <h1 className="text-2xl font-semibold tracking-tight">{lang === "IS" ? "Daglegt check-in" : "Daily check-in"}</h1>

          <Badge variant="outline" className="rounded-full">
            {playerName ? playerName : (lang === "IS" ? "Leikmaður" : "Player")}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {isGameDay
            ? (lang === "IS" ? "Leikdagur — þú velur að gefa merki. Takk fyrir heiðarleikann." : "Match day — checking in is your call. Thanks for the honesty.")
            : c.subtitle}
        </p>
      </div>

      <Card className="rounded-2xl">
        <CardHeader className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {step === 1 && `${c.q.fatigue.title} (1–5)`}
              {step === 2 && `${c.q.sleepQuality.title} (1–5)`}
              {step === 3 && `${c.q.sleepDuration.title} (1–5)`}
              {step === 4 && `${c.q.stressMood.title} (1–5)`}
              {step === 5 && `${c.q.soreness.title} (1–5)`}
            </CardTitle>
            <div className="flex items-center gap-2">
              <StepDot active={step >= 1} />
              <StepDot active={step >= 2} />
              <StepDot active={step >= 3} />
              <StepDot active={step >= 4} />
              <StepDot active={step >= 5} />
            </div>
          </div>

          <CardDescription>
            {step === 1 && c.q.fatigue.desc}
            {step === 2 && c.q.sleepQuality.desc}
            {step === 3 && c.q.sleepDuration.desc}
            {step === 4 && c.q.stressMood.desc}
            {step === 5 && c.q.soreness.desc}
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
              <Label>{c.q.fatigue.title}</Label>
              <PillScale
                ariaLabel="Fatigue/Energy val"
                lang={lang}
                value={fatigueEnergy}
                onChange={setFatigueEnergy}
                options={[
                  { v: 1, en: "Very tired", is: "Mikil þreyta" },
                  { v: 2, en: "Quite tired", is: "Frekar þreytt/ur" },
                  { v: 3, en: "Normal", is: "Í lagi" },
                  { v: 4, en: "Fresh", is: "Fersk/ur" },
                  { v: 5, en: "Very fresh", is: "Mjög fersk/ur" },
                ]}
              />
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-2">
              <Label>{c.q.sleepQuality.title}</Label>
              {wearableSleepHint && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                  <span>📱</span>
                  <span>
                    Forfyllt frá {wearableSleepHint.provider === "polar" ? "Polar" : wearableSleepHint.provider} —
                    {" "}{Math.floor(wearableSleepHint.totalMin / 60)}h {String(wearableSleepHint.totalMin % 60).padStart(2, "0")}m.
                    {" "}Þú getur breytt ef þér finnst þetta ekki passa við hvernig svefn liðar.
                  </span>
                </div>
              )}
              <PillScale
                ariaLabel="Sleep quality val"
                lang={lang}
                value={sleepQuality}
                onChange={setSleepQuality}
                options={[
                  { v: 1, en: "Very bad", is: "Mjög slæmur", subEN: "woke often", subIS: "vaknaði oft" },
                  { v: 2, en: "Bad", is: "Slæmur" },
                  { v: 3, en: "Restless", is: "Órólegur", subEN: "broken", subIS: "sundurslitinn" },
                  { v: 4, en: "Good", is: "Góður", subEN: "slept well", subIS: "svaf vel" },
                  { v: 5, en: "Very good", is: "Mjög góður" },
                ]}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-2">
              <Label>{c.q.sleepDuration.title}</Label>
              {wearableSleepHint && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
                  <span>📱</span>
                  <span>
                    Mælt af {wearableSleepHint.provider === "polar" ? "Polar" : wearableSleepHint.provider}:
                    {" "}{Math.floor(wearableSleepHint.totalMin / 60)}h {String(wearableSleepHint.totalMin % 60).padStart(2, "0")}m.
                  </span>
                </div>
              )}
              <PillScale
                ariaLabel="Sleep duration val"
                lang={lang}
                value={sleepDuration}
                onChange={setSleepDuration}
                options={[
                  { v: 1, en: "< 5 hours", is: "< 5 klst" },
                  { v: 2, en: "5–6 hours", is: "5–6 klst" },
                  { v: 3, en: "6–7 hours", is: "6–7 klst" },
                  { v: 4, en: "7–8 hours", is: "7–8 klst", subEN: "good", subIS: "gott" },
                  { v: 5, en: "8+ hours", is: "8+ klst" },
                ]}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-2">
              <Label>{c.q.stressMood.title}</Label>
              <PillScale
                ariaLabel="Stress & mood val"
                lang={lang}
                value={stressMood}
                onChange={setStressMood}
                options={[
                  { v: 1, en: "Very stressed", is: "Mjög stressuð/aður", subEN: "high load", subIS: "mikið álag" },
                  { v: 2, en: "Stressed", is: "Stressuð/aður" },
                  { v: 3, en: "Normal", is: "Í lagi" },
                  { v: 4, en: "Feeling good", is: "Líður vel" },
                  { v: 5, en: "Feeling great", is: "Líður frábærlega" },
                ]}
              />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-2">
              <Label>{c.q.soreness.title}</Label>
              <PillScale
                ariaLabel="General muscle soreness val"
                lang={lang}
                value={muscleSoreness}
                onChange={setMuscleSoreness}
                options={[
                  { v: 1, en: "Very sore", is: "Mjög aum/ur", subEN: "stiff", subIS: "stíft" },
                  { v: 2, en: "Some soreness", is: "Frekar aum/ur" },
                  { v: 3, en: "Normal", is: "Í lagi", subEN: "a little", subIS: "smá" },
                  { v: 4, en: "Good", is: "Lítil eymsli" },
                  { v: 5, en: "Feeling great", is: "Engin eymsli" },
                ]}
              />
              <details className="mt-2">
                <summary className="cursor-pointer list-none text-xs font-semibold text-primary hover:underline">
                  {lang === "IS" ? "+ Bæta við athugasemd (valfrjálst)" : "+ Add a note (optional)"}
                </summary>
                <div className="mt-2 space-y-1">
                  <Textarea
                    id="notes"
                    aria-label={c.notesTitle}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={lang === "IS"
                      ? "Skrifaðu ef þú finnur fyrir sárindum (t.d. „mjóhryggur stífur eftir leik“, „hamstring viðkvæmur“), veikindum eða öðru sem skiptir máli…"
                      : "Note any soreness (e.g. 'lower back tight after the match', 'hamstring tender'), illness or anything else that matters…"}
                    className="min-h-[100px] rounded-xl"
                  />
                  <div className="text-xs text-muted-foreground">
                    {lang === "IS"
                      ? "Valfrjálst — AI sérstillingakerfið les þetta og getur stungið upp á breytingum á styrktaræfingu þinni."
                      : "Optional — the AI personalization engine reads this and can suggest changes to your strength session."}
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {(() => {
            const q =
              step === 1 ? c.q.fatigue
              : step === 2 ? c.q.sleepQuality
              : step === 3 ? c.q.sleepDuration
              : step === 4 ? c.q.stressMood
              : step === 5 ? c.q.soreness
              : null;
            return q ? <WhyBox title={c.explainTitle} why={q.why} src={q.src} /> : null;
          })()}

          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{lang === "IS" ? "Skref" : "Step"} {step}/5</span>
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
            {lang === "IS" ? "Til baka" : "Back"}
          </Button>

          {step < 5 ? (
            <Button
              type="button"
              className="w-2/3 rounded-xl"
              onClick={() => setStep((s) => (Math.min(5, s + 1) as Step))}
              disabled={!canGoNext || saving}
            >
              {lang === "IS" ? "Áfram →" : "Next →"}
            </Button>
          ) : (
            <Button
              type="button"
              className="w-2/3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
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
              {saving ? (lang === "IS" ? "Vista…" : "Saving…") : (lang === "IS" ? "Klára skráningu ✓" : "Finish check-in ✓")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {lang === "IS"
          ? "Ef eitthvað er „off“ í líkamanum: skrifaðu athugasemd — það sparar tíma og minnkar áhættu."
          : "If something feels off in your body, add a note — it saves time and lowers risk."}
      </p>

      <EnableRemindersCard />
    </div>
  );
}
