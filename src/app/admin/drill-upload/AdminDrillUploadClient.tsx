"use client";

/**
 * Admin-only: upload drills INTO another coach's library.
 *
 * Self-contained on purpose — it does NOT touch CoachDrillLibrary.tsx (a large,
 * heavily-used component). The drill field set is replicated from that component's
 * "+ New drill" modal; the server routes (/api/admin/*) are the real auth gate.
 *
 * Default target is Emil Pálsson (Breiðablik, football). Ownership defaults to the
 * coach's own library (owner_scope='coach' → appears under scope=my for that coach).
 *
 * Load metrics are never entered here — measured load fills from the team's own GPS
 * over time. This page only writes qualitative/structural fields + an optional video.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useLang } from "@/lib/lang";
import { videoReadCategoriesForSport } from "@/lib/micropulse/drillLibrary/videoReadSchema";

const EMIL_ID = "ea7a371e-e4d7-46c7-aca7-5581c4cdc532";

type Coach = { id: string; full_name: string; team_id: string | null };
type OwnerScope = "coach" | "team";
type Mode = "drill" | "meeting";

/** Local YYYY-MM-DD (avoids the UTC off-by-one `toISOString` can cause). */
function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const MEETING_TYPES = ["staff", "team", "1to1", "video-review", "other"] as const;
type MeetingType = (typeof MEETING_TYPES)[number];
const MEETING_TYPE_LABEL: Record<MeetingType, { en: string; is: string }> = {
  staff: { en: "Staff meeting", is: "Starfsmannafundur" },
  team: { en: "Team meeting", is: "Liðsfundur" },
  "1to1": { en: "1-to-1", is: "Einstaklingsfundur" },
  "video-review": { en: "Video review", is: "Myndbandsgreining" },
  other: { en: "Other", is: "Annað" },
};

type MeetingForm = {
  title: string;
  meeting_date: string;
  meeting_type: MeetingType;
  agenda: string;
  external_url: string;
};

const emptyMeeting = (): MeetingForm => ({
  title: "",
  meeting_date: todayLocalISO(),
  meeting_type: "team",
  agenda: "",
  external_url: "",
});

type FormState = {
  category: string;
  drill_name: string;
  description: string;
  drill_format: string;
  stimulus_type: string;
  video_url: string;
  cup_principle: string;
  field_length_m: number | null;
  field_width_m: number | null;
  total_players: number | null;
  reps: string;
  duration_min: number | null;
};

const emptyForm: FormState = {
  category: "possession",
  drill_name: "",
  description: "",
  drill_format: "",
  stimulus_type: "",
  video_url: "",
  cup_principle: "",
  field_length_m: null,
  field_width_m: null,
  total_players: null,
  reps: "",
  duration_min: null,
};

// Bilingual category labels (replicated from CoachDrillLibrary for the categories
// videoReadCategoriesForSport can return).
const CATEGORY_LABELS: Record<string, { en: string; is: string }> = {
  possession: { en: "Possession", is: "Bolthald" },
  ssg: { en: "SSG", is: "SSG" },
  transition: { en: "Transition", is: "Umskipti" },
  running: { en: "Running", is: "Hlaup" },
  finishing: { en: "Finishing", is: "Klárunaræfingar" },
  shooting: { en: "Shooting", is: "Skot" },
  fast_break: { en: "Fast Break", is: "Hraðupphlaup" },
  half_court_offense: { en: "Half-Court Offense", is: "Sókn á hálfum velli" },
  defense: { en: "Defense", is: "Vörn" },
  conditioning: { en: "Conditioning", is: "Þrek" },
  warmup: { en: "Warm-up", is: "Upphitun" },
  other: { en: "Other", is: "Annað" },
};

const STIM_LABEL: Record<string, { en: string; is: string }> = {
  mechanical: { en: "Mechanical", is: "Vélrænt" },
  locomotive: { en: "Locomotive", is: "Hlaupaálag" },
  mixed: { en: "Mixed", is: "Blandað" },
  technical: { en: "Technical", is: "Tæknilegt" },
};
const STIM_OPTS = ["mechanical", "locomotive", "mixed", "technical"] as const;

const COPY = {
  EN: {
    title: "Upload drills to a coach's library",
    subtitle: "Admin tool — create drills inside another coach's library.",
    notAuth: "Not authorised.",
    backToCoach: "Back to coach dashboard",
    loading: "Loading…",
    target: "Target coach",
    ownership: "Where to save",
    ownerCoach: "Coach's own library",
    ownerTeam: "Team library",
    ownerCoachHint: "Personal library — follows the coach between clubs (shows under their “My library”).",
    ownerTeamHint: "Shared with the whole team — all the team's coaches can see it.",
    resolvedFor: "Saving for",
    team: "Team",
    sport: "Sport",
    category: "Category",
    name: "Name*",
    formatLabel: "Format (e.g. 5v5+2)",
    repsLabel: "Reps (e.g. 4x75s)",
    description: "Description",
    stimulusLabel: "Stimulus (pitch)",
    stimulusAuto: "Auto (from GPS)",
    videoLabel: "Video link (YouTube/Vimeo)",
    videoOr: "— or upload a video file (private) —",
    videoUpload: "Upload a video file",
    videoUploadHint: "Stored privately (max 200 MB). Prefer a link when you can — uploads use cloud storage.",
    aiGenerate: "Generate description with AI",
    aiGenerating: "Reading the video…",
    aiReadingLink: "Reading the video's title/description…",
    aiNeedVideo: "Add a video file or a YouTube/Vimeo link first.",
    aiCorsHint: "This host blocks reading the video — download it and upload the file instead.",
    aiLinkNote: "Drafted from the video's own title/description (not the footage) — review it.",
    aiDraftNote: "AI draft — review and edit before saving.",
    cupLabel: "CUPs principle (Owen)",
    cupNone: "— none —",
    cupCollective: "Collective (whole team)",
    cupUnit: "Unit (line/group)",
    cupPositional: "Positional (role)",
    fieldLength: "Field length (m)",
    fieldWidth: "Field width (m)",
    numPlayers: "Number of players",
    duration: "Duration (min)",
    loadNote: "Load fills from the team's own GPS over time.",
    save: "Save",
    saveAndAnother: "Save & add another",
    saving: "Saving…",
    compressing: "Compressing video…",
    uploading: "Uploading video…",
    createdFor: "Created for",
    createdThisSession: "created this session",
    errAuth: "Authentication missing",
    errSave: "Error saving",
    errName: "A drill name is required.",
    // Mode toggle + meeting mode
    modeDrill: "Drill",
    modeMeeting: "Meeting / document",
    mtgTitle: "Title*",
    mtgDate: "Date*",
    mtgType: "Meeting type",
    mtgAgenda: "Agenda / notes",
    mtgDoc: "Document",
    mtgDocUpload: "Upload a file (PDF / Word / Excel / image)",
    mtgDocOr: "— or paste a link —",
    mtgDocLink: "Link (Google Doc, PDF, …)",
    mtgDocHint: "Lands under “Meetings” in the coach's library. Documents are not compressed.",
    mtgErrTitle: "A title is required.",
    mtgErrTeam: "A file upload needs the coach to have a team — pick a coach with a team, or paste a link.",
    mtgUploading: "Uploading document…",
    mtgCreatedThisSession: "created this session",
  },
  IS: {
    title: "Hlaða drillum í safn þjálfara",
    subtitle: "Stjórnandatól — búðu til drillur í safni annars þjálfara.",
    notAuth: "Ekki heimilt.",
    backToCoach: "Til baka á þjálfaramælaborð",
    loading: "Hleð…",
    target: "Markþjálfari",
    ownership: "Hvar á að vista",
    ownerCoach: "Eigið safn þjálfarans",
    ownerTeam: "Liðasafn",
    ownerCoachHint: "Persónulegt safn — fylgir þjálfaranum milli klúbba (birtist undir „Mitt safn“).",
    ownerTeamHint: "Sameiginlegt með öllu liðinu — allir þjálfarar liðsins sjá.",
    resolvedFor: "Vista fyrir",
    team: "Lið",
    sport: "Íþrótt",
    category: "Flokkur",
    name: "Nafn*",
    formatLabel: "Format (t.d. 5v5+2)",
    repsLabel: "Reps (t.d. 4x75sek)",
    description: "Lýsing",
    stimulusLabel: "Álagsgerð (völlur)",
    stimulusAuto: "Sjálfvirkt (úr GPS)",
    videoLabel: "Myndbandshlekkur (YouTube/Vimeo)",
    videoOr: "— eða hlaðið upp myndbandsskrá (einka) —",
    videoUpload: "Hlaða upp myndbandsskrá",
    videoUploadHint: "Geymt sem einkaefni (hám. 200 MB). Notaðu hlekk þegar hægt er — upphleðsla nýtir skýjapláss.",
    aiGenerate: "Búa til lýsingu með AI",
    aiGenerating: "Les myndbandið…",
    aiReadingLink: "Les titil/lýsingu myndbandsins…",
    aiNeedVideo: "Bættu fyrst við myndbandsskrá eða YouTube/Vimeo hlekk.",
    aiCorsHint: "Þessi hýsing leyfir ekki lestur myndbandsins — sæktu það og hlaðið upp skránni í staðinn.",
    aiLinkNote: "Dregið úr titli/lýsingu myndbandsins sjálfs (ekki upptökunni) — yfirfarðu það.",
    aiDraftNote: "AI drög — yfirfarðu og lagfærðu áður en þú vistar.",
    cupLabel: "CUPs-meginregla (Owen)",
    cupNone: "— engin —",
    cupCollective: "Collective (allt liðið)",
    cupUnit: "Unit (lína/hópur)",
    cupPositional: "Positional (staða)",
    fieldLength: "Lengd vallar (m)",
    fieldWidth: "Breidd vallar (m)",
    numPlayers: "Fjöldi leikmanna",
    duration: "Duration (min)",
    loadNote: "Álagstölur fyllast úr GPS liðsins með tímanum.",
    save: "Vista",
    saveAndAnother: "Vista og bæta við annarri",
    saving: "Vista…",
    compressing: "Þjappa myndbandi…",
    uploading: "Hleð upp myndbandi…",
    createdFor: "Búið til fyrir",
    createdThisSession: "búnar til í þessari lotu",
    errAuth: "Vantar auðkenningu",
    errSave: "Villa við að vista",
    errName: "Nafn á drillu vantar.",
    // Mode toggle + meeting mode
    modeDrill: "Drilla",
    modeMeeting: "Fundur / skjal",
    mtgTitle: "Titill*",
    mtgDate: "Dagsetning*",
    mtgType: "Tegund fundar",
    mtgAgenda: "Dagskrá / glósur",
    mtgDoc: "Skjal",
    mtgDocUpload: "Hlaða upp skrá (PDF / Word / Excel / mynd)",
    mtgDocOr: "— eða límdu hlekk —",
    mtgDocLink: "Hlekkur (Google Doc, PDF, …)",
    mtgDocHint: "Birtist undir „Fundir“ í safni þjálfarans. Skjöl eru ekki þjöppuð.",
    mtgErrTitle: "Titil vantar.",
    mtgErrTeam: "Skráarupphleðsla þarf að þjálfarinn hafi lið — veldu þjálfara með lið, eða límdu hlekk.",
    mtgUploading: "Hleð upp skjali…",
    mtgCreatedThisSession: "búnir til í þessari lotu",
  },
} as const;

async function getAuthToken(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session?.access_token ?? null;
}

/** Best-effort client-side team-sport resolution (RLS may restrict it → falls back to football,
 *  which is correct for the default target). Mirrors resolveTeamSport's source order. */
async function resolveTeamSportClient(teamId: string | null): Promise<string> {
  if (!teamId) return "football";
  const supabase = getSupabaseClient();
  try {
    const { data: settings } = await supabase
      .from("team_settings").select("sport_type").eq("team_id", teamId).maybeSingle();
    const st = String((settings as { sport_type?: string | null } | null)?.sport_type ?? "").toLowerCase();
    if (st === "basketball" || st === "football") return st;
    const { data: team } = await supabase
      .from("teams").select("sport").eq("id", teamId).maybeSingle();
    const ts = String((team as { sport?: string | null } | null)?.sport ?? "").toLowerCase();
    if (ts === "basketball" || ts === "football") return ts;
  } catch {
    /* fall through */
  }
  return "football";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function NumInput({
  value,
  onChange,
  integer = false,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange(null);
        const n = integer ? parseInt(raw, 10) : Number(raw);
        onChange(Number.isNaN(n) ? null : n);
      }}
      className="w-full rounded border px-2 py-1"
    />
  );
}

export default function AdminDrillUploadClient() {
  const [lang] = useLang();
  const t = COPY[lang];

  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [targetId, setTargetId] = useState<string>(EMIL_ID);
  const [ownerScope, setOwnerScope] = useState<OwnerScope>("coach");
  const [targetSport, setTargetSport] = useState<string>("football");

  const [mode, setMode] = useState<Mode>("drill");

  const [form, setForm] = useState<FormState>(emptyForm);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Meeting (document) mode
  const [meeting, setMeeting] = useState<MeetingForm>(emptyMeeting);
  const [docFile, setDocFile] = useState<File | null>(null);
  const docInputRef = useRef<HTMLInputElement | null>(null);

  const [saving, setSaving] = useState(false);
  const [savePhase, setSavePhase] = useState<"idle" | "saving" | "compressing" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Auth gate (client-side; server routes are the real gate) ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase.auth.getSession();
        const uid = data?.session?.user?.id;
        if (!uid) { if (alive) setAuthState("denied"); return; }
        const { data: prof } = await supabase
          .from("profiles").select("role, is_admin").eq("id", uid).maybeSingle();
        // Admin = the canonical is_admin flag (same as the /admin layout) OR role='ADMIN'.
        const p = (prof as { role?: string; is_admin?: boolean } | null) ?? {};
        const isAdmin = p.is_admin === true || String(p.role ?? "").toUpperCase() === "ADMIN";
        if (alive) setAuthState(isAdmin ? "ok" : "denied");
      } catch {
        if (alive) setAuthState("denied");
      }
    })();
    return () => { alive = false; };
  }, []);

  // ── Load the coaches picker once authorised ──
  useEffect(() => {
    if (authState !== "ok") return;
    let alive = true;
    (async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch("/api/admin/coaches", { headers: { Authorization: `Bearer ${token}` } });
        const j = await res.json().catch(() => null);
        if (!alive || !res.ok || !j?.ok) return;
        const list = (j.coaches ?? []) as Coach[];
        setCoaches(list);
        // Default to Emil if present, else the first coach.
        if (!list.some((c) => c.id === EMIL_ID) && list.length > 0) setTargetId(list[0].id);
      } catch {
        /* ignore — picker stays empty, default id still works */
      }
    })();
    return () => { alive = false; };
  }, [authState]);

  const targetCoach = coaches.find((c) => c.id === targetId) ?? null;
  const targetTeamId = targetCoach?.team_id ?? null;

  // Resolve the target team's sport (drives the category list).
  useEffect(() => {
    let alive = true;
    (async () => {
      const sport = await resolveTeamSportClient(targetTeamId);
      if (alive) setTargetSport(sport);
    })();
    return () => { alive = false; };
  }, [targetTeamId]);

  const categories = videoReadCategoriesForSport(targetSport);

  // Keep the selected category valid when the sport (category list) changes.
  useEffect(() => {
    if (!categories.includes(form.category)) {
      setForm((f) => ({ ...f, category: categories[0] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSport]);

  function onPickVideoFile(file: File | null) {
    setVideoFile(file);
    setVideoDuration(null);
    if (!file) return;
    // Read duration from metadata so the upload can send duration_s (for the clip cap).
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        if (Number.isFinite(v.duration) && v.duration > 0) setVideoDuration(Math.round(v.duration));
        URL.revokeObjectURL(url);
      };
      v.onerror = () => URL.revokeObjectURL(url);
      v.src = url;
    } catch {
      /* duration is optional */
    }
  }

  // AI "Generate description" — mirrors CoachDrillLibrary.generateDescription.
  const generateDescription = useCallback(async () => {
    const link = form.video_url.trim();
    const isYouTubeVimeo = /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(link);
    const isDirectFile = /\.(mp4|mov|webm|m4v|ogg)(\?|#|$)/i.test(link);
    if (!videoFile && !link) { setAiError(t.aiNeedVideo); return; }
    setAiBusy(true); setAiError(null); setAiStatus(null);
    try {
      const token = await getAuthToken();
      if (!token) { setAiError(t.errAuth); return; }
      type DraftRead = { suggestedName: string; category: string; format: string | null; playersEst: number | null; description: { en: string; is: string }; stimulusType: string | null };
      let read: DraftRead | null = null;

      if (videoFile || isDirectFile) {
        setAiStatus(t.aiGenerating);
        const { extractFilmFrames, FrameExtractError } = await import("@/lib/video/extractFilmFrames");
        let ex;
        try {
          ex = await extractFilmFrames(videoFile ?? link, { count: 6, maxWidth: 960, quality: 0.7 });
        } catch (e) {
          if (e instanceof FrameExtractError && e.code === "CORS_BLOCKED") { setAiError(t.aiCorsHint); return; }
          throw e;
        }
        const res = await fetch("/api/coach/drill-library/video-read", {
          method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ frames: ex.frames, durationSec: ex.durationSec, lang }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) { setAiError(j?.error ?? t.aiNeedVideo); return; }
        read = j.read as DraftRead;
      } else if (isYouTubeVimeo) {
        setAiStatus(t.aiReadingLink);
        const res = await fetch("/api/coach/drill-library/link-read", {
          method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ url: link, lang }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok || !j?.ok) { setAiError(j?.error ?? t.aiNeedVideo); return; }
        read = j.read as DraftRead;
      } else {
        setAiError(t.aiNeedVideo);
        return;
      }

      if (read) {
        const draftDesc = (lang === "IS" ? read.description.is : read.description.en) || "";
        const catOk = (categories as readonly string[]).includes(read.category);
        setForm((f) => ({
          ...f,
          description: draftDesc || f.description,
          drill_name: f.drill_name.trim() ? f.drill_name : read!.suggestedName,
          drill_format: f.drill_format.trim() ? f.drill_format : (read!.format ?? ""),
          total_players: f.total_players != null ? f.total_players : (read!.playersEst ?? null),
          category: (!f.category || f.category === categories[0]) && catOk ? read!.category : f.category,
          stimulus_type: f.stimulus_type || (read!.stimulusType ?? ""),
        }));
      }
    } catch {
      setAiError(t.aiNeedVideo);
    } finally { setAiBusy(false); setAiStatus(null); }
  }, [form.video_url, videoFile, lang, t, categories]);

  async function handleSave(addAnother: boolean) {
    if (!form.drill_name.trim()) { setError(t.errName); return; }
    setSaving(true);
    setSavePhase("saving");
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.errAuth);
      const res = await fetch("/api/admin/drill-library", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target_coach_id: targetId,
          owner_scope: ownerScope,
          category: form.category,
          drill_name: form.drill_name,
          description: form.description || null,
          drill_format: form.drill_format || null,
          field_length_m: form.field_length_m,
          field_width_m: form.field_width_m,
          total_players: form.total_players,
          reps: form.reps || null,
          duration_min: form.duration_min,
          video_url: form.video_url || null,
          cup_principle: form.cup_principle || null,
          stimulus_type: form.stimulus_type || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || t.errSave);

      const drillId = (json.drill as { id?: string } | undefined)?.id ?? null;

      // If a video file was staged, upload it now that the drill has an id and
      // attach it to the drill (team-owned private clip via coach_media).
      if (videoFile && drillId && targetTeamId) {
        // Compress in the browser first (720p webm) — a raw phone clip (.mov) is far over the
        // storage object-size limit. Same path the "Read a drill from video" widget uses. If the
        // browser can't decode this codec, fall back to the raw file (upload may then reject it).
        setSavePhase("compressing");
        let clip: File = videoFile;
        try {
          const { compressVideoClip } = await import("@/lib/video/compressVideoClip");
          clip = await compressVideoClip(videoFile, { maxHeight: 720 });
        } catch {
          clip = videoFile;
        }
        setSavePhase("uploading");
        const fd = new FormData();
        fd.set("file", clip);
        fd.set("title", `${form.drill_name} — video`);
        fd.set("team_id", targetTeamId);
        fd.set("drill_id", drillId);
        fd.set("owner_type", "team");
        if (videoDuration != null) fd.set("duration_s", String(videoDuration));
        const up = await fetch("/api/coach/library/media/upload", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok || !upJson.ok) throw new Error(upJson.error || t.errSave);
      }

      setCreatedCount((c) => c + 1);
      setLastCreated(targetCoach?.full_name ?? targetId);
      // Clear the drill fields + video; keep the target + ownership for the next one.
      setForm((f) => ({ ...emptyForm, category: f.category }));
      setVideoFile(null);
      setVideoDuration(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setAiError(null);
      if (!addAnother) {
        // Nothing to navigate to; the confirmation + count stays on screen.
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setSavePhase("idle");
    }
  }

  async function handleSaveMeeting(addAnother: boolean) {
    if (!meeting.title.trim()) { setError(t.mtgErrTitle); return; }
    // A file upload needs a team to own the media; links don't.
    if (docFile && !targetTeamId) { setError(t.mtgErrTeam); return; }
    setSaving(true);
    setSavePhase("saving");
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error(t.errAuth);

      // 1) If a document file is staged, upload it first (team-owned; docs are NOT compressed).
      let mediaId: string | null = null;
      if (docFile && targetTeamId) {
        setSavePhase("uploading");
        const fd = new FormData();
        fd.set("file", docFile);
        fd.set("title", `${meeting.title.trim()} — ${docFile.name}`);
        fd.set("team_id", targetTeamId);
        fd.set("owner_type", "team");
        const up = await fetch("/api/coach/library/media/upload", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
        });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok || !upJson.ok) throw new Error(upJson.error || t.errSave);
        mediaId = (upJson.media as { id?: string } | undefined)?.id ?? null;
      }

      // 2) Create the meeting (and attach the doc/link server-side).
      setSavePhase("saving");
      const res = await fetch("/api/admin/meetings", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target_coach_id: targetId,
          owner_scope: ownerScope,
          title: meeting.title,
          meeting_date: meeting.meeting_date,
          meeting_type: meeting.meeting_type,
          agenda: meeting.agenda || null,
          media_id: mediaId,
          external_url: mediaId ? null : (meeting.external_url.trim() || null),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || t.errSave);

      setCreatedCount((c) => c + 1);
      setLastCreated(targetCoach?.full_name ?? targetId);
      // Clear the meeting fields + file; keep the target + ownership + mode for the next one.
      setMeeting(emptyMeeting());
      setDocFile(null);
      if (docInputRef.current) docInputRef.current.value = "";
      if (!addAnother) {
        // Nothing to navigate to; the confirmation + count stays on screen.
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
      setSavePhase("idle");
    }
  }

  if (authState === "checking") {
    return <div className="mx-auto max-w-2xl px-4 py-10 text-sm text-slate-500">{t.loading}</div>;
  }
  if (authState === "denied") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm font-medium text-[#a83e28]">{t.notAuth}</p>
        <Link href="/coach" className="mt-3 inline-block text-sm text-[#2740e6] hover:underline">
          {t.backToCoach}
        </Link>
      </div>
    );
  }

  const isYtVimeo = /(?:youtube\.com|youtu\.be|vimeo\.com)/i.test(form.video_url) && !videoFile;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-[#14181c]">{t.title}</h1>
        <p className="text-sm text-slate-500">{t.subtitle}</p>
      </div>

      {/* Target picker */}
      <div className="mb-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
        <Field label={t.target}>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded border px-2 py-1"
          >
            {!coaches.some((c) => c.id === targetId) && (
              <option value={targetId}>Emil Pálsson</option>
            )}
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.id}
              </option>
            ))}
          </select>
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-slate-600">{t.ownership}</span>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="owner_scope"
                checked={ownerScope === "coach"}
                onChange={() => setOwnerScope("coach")}
              />
              {t.ownerCoach}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name="owner_scope"
                checked={ownerScope === "team"}
                onChange={() => setOwnerScope("team")}
              />
              {t.ownerTeam}
            </label>
          </div>
          <p className="mt-1 text-[11px] text-blue-800">
            {ownerScope === "coach" ? t.ownerCoachHint : t.ownerTeamHint}
          </p>
        </div>

        <div className="text-[11px] text-blue-900">
          {t.resolvedFor}: <span className="font-semibold">{targetCoach?.full_name || "Emil Pálsson"}</span>
          {" · "}
          {t.team}: <span className="font-mono">{targetTeamId ?? "—"}</span>
          {" · "}
          {t.sport}: <span className="font-semibold">{targetSport}</span>
        </div>
      </div>

      {/* Mode toggle (shared target + ownership stay above) */}
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
        {(["drill", "meeting"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); }}
            className={
              "rounded-md px-3 py-1.5 font-semibold transition " +
              (mode === m ? "bg-[#2740e6] text-white" : "text-slate-600 hover:bg-slate-100")
            }
          >
            {m === "drill" ? t.modeDrill : t.modeMeeting}
          </button>
        ))}
      </div>

      {/* Drill form */}
      {mode === "drill" && (
      <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-2">
        <Field label={t.category}>
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="w-full rounded border px-2 py-1"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c] ? CATEGORY_LABELS[c][lang === "IS" ? "is" : "en"] : c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t.name}>
          <input
            value={form.drill_name}
            onChange={(e) => setForm({ ...form, drill_name: e.target.value })}
            className="w-full rounded border px-2 py-1"
          />
        </Field>

        <Field label={t.formatLabel}>
          <input
            value={form.drill_format}
            onChange={(e) => setForm({ ...form, drill_format: e.target.value })}
            className="w-full rounded border px-2 py-1"
          />
        </Field>
        <Field label={t.repsLabel}>
          <input
            value={form.reps}
            onChange={(e) => setForm({ ...form, reps: e.target.value })}
            className="w-full rounded border px-2 py-1"
          />
        </Field>

        <div className="md:col-span-2">
          <Field label={t.description}>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={6}
              className="w-full rounded border px-2 py-1"
            />
          </Field>
        </div>

        <Field label={t.stimulusLabel}>
          <select
            value={form.stimulus_type}
            onChange={(e) => setForm({ ...form, stimulus_type: e.target.value })}
            className="w-full rounded border px-2 py-1"
          >
            <option value="">{t.stimulusAuto}</option>
            {STIM_OPTS.map((s) => (
              <option key={s} value={s}>{STIM_LABEL[s][lang === "IS" ? "is" : "en"]}</option>
            ))}
          </select>
        </Field>

        <Field label={t.cupLabel}>
          <select
            value={form.cup_principle}
            onChange={(e) => setForm({ ...form, cup_principle: e.target.value })}
            className="w-full rounded border px-2 py-1"
          >
            <option value="">{t.cupNone}</option>
            <option value="collective">{t.cupCollective}</option>
            <option value="unit">{t.cupUnit}</option>
            <option value="positional">{t.cupPositional}</option>
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field label={t.videoLabel}>
            <input
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={form.video_url}
              onChange={(e) => setForm({ ...form, video_url: e.target.value })}
              className="w-full rounded border px-2 py-1"
            />
          </Field>
          <div className="mt-1.5 text-xs text-slate-500">{t.videoOr}</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={(e) => onPickVideoFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-xs text-slate-600"
            aria-label={t.videoUpload}
          />
          {videoFile && <div className="mt-1 text-[11px] text-slate-500">↑ {videoFile.name}</div>}
          <div className="mt-1 text-[10px] text-slate-400">{t.videoUploadHint}</div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void generateDescription()}
              disabled={aiBusy || (!videoFile && !form.video_url.trim())}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#7a5cc4]/40 bg-[#7a5cc4]/10 px-2.5 py-1 text-xs font-semibold text-[#7a5cc4] hover:bg-[#7a5cc4]/15 disabled:opacity-50"
            >
              <span className="rounded bg-[#7a5cc4]/20 px-1 text-[9px] font-bold uppercase tracking-wide">AI</span>
              {aiBusy ? (aiStatus ?? t.aiGenerating) : t.aiGenerate}
            </button>
            <span className="text-[10px] text-slate-400">
              {isYtVimeo ? t.aiLinkNote : t.aiDraftNote}
            </span>
          </div>
          {aiError && <p className="mt-1 rounded bg-[#a83e28]/10 px-2 py-1 text-[11px] text-[#a83e28]">{aiError}</p>}
        </div>

        {targetSport !== "basketball" && (
          <Field label={t.fieldLength}>
            <NumInput value={form.field_length_m} onChange={(v) => setForm({ ...form, field_length_m: v })} />
          </Field>
        )}
        {targetSport !== "basketball" && (
          <Field label={t.fieldWidth}>
            <NumInput value={form.field_width_m} onChange={(v) => setForm({ ...form, field_width_m: v })} />
          </Field>
        )}
        <Field label={t.numPlayers}>
          <NumInput value={form.total_players} onChange={(v) => setForm({ ...form, total_players: v })} integer />
        </Field>
        <Field label={t.duration}>
          <NumInput value={form.duration_min} onChange={(v) => setForm({ ...form, duration_min: v })} />
        </Field>

        <div className="md:col-span-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
          {t.loadNote}
        </div>
      </div>
      )}

      {/* Meeting / document form */}
      {mode === "meeting" && (
      <div className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-2">
        <Field label={t.mtgTitle}>
          <input
            value={meeting.title}
            onChange={(e) => setMeeting({ ...meeting, title: e.target.value })}
            className="w-full rounded border px-2 py-1"
          />
        </Field>
        <Field label={t.mtgDate}>
          <input
            type="date"
            value={meeting.meeting_date}
            onChange={(e) => setMeeting({ ...meeting, meeting_date: e.target.value })}
            className="w-full rounded border px-2 py-1"
          />
        </Field>

        <Field label={t.mtgType}>
          <select
            value={meeting.meeting_type}
            onChange={(e) => setMeeting({ ...meeting, meeting_type: e.target.value as MeetingType })}
            className="w-full rounded border px-2 py-1"
          >
            {MEETING_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {MEETING_TYPE_LABEL[mt][lang === "IS" ? "is" : "en"]}
              </option>
            ))}
          </select>
        </Field>
        <div className="hidden md:block" />

        <div className="md:col-span-2">
          <Field label={t.mtgAgenda}>
            <textarea
              value={meeting.agenda}
              onChange={(e) => setMeeting({ ...meeting, agenda: e.target.value })}
              rows={4}
              className="w-full rounded border px-2 py-1"
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">{t.mtgDoc}</span>
          <input
            ref={docInputRef}
            type="file"
            accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx"
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-slate-600"
            aria-label={t.mtgDocUpload}
          />
          {docFile && <div className="mt-1 text-[11px] text-slate-500">↑ {docFile.name}</div>}
          <div className="mt-2 text-xs text-slate-500">{t.mtgDocOr}</div>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={meeting.external_url}
            onChange={(e) => setMeeting({ ...meeting, external_url: e.target.value })}
            disabled={!!docFile}
            className="mt-1 w-full rounded border px-2 py-1 disabled:bg-slate-100 disabled:text-slate-400"
            aria-label={t.mtgDocLink}
          />
          <div className="mt-1 text-[10px] text-slate-400">{t.mtgDocHint}</div>
        </div>
      </div>
      )}

      {error && (
        <p className="mt-3 rounded bg-[#a83e28]/10 px-3 py-2 text-sm text-[#a83e28]">{error}</p>
      )}

      {lastCreated && !error && (
        <p className="mt-3 rounded bg-[#1c7a4a]/10 px-3 py-2 text-sm text-[#1c7a4a]">
          {t.createdFor}: <span className="font-semibold">{lastCreated}</span>
          {" · "}
          {createdCount} {mode === "meeting" ? t.mtgCreatedThisSession : t.createdThisSession}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void (mode === "drill" ? handleSave(false) : handleSaveMeeting(false))}
          disabled={saving}
          className="rounded-md bg-[#2740e6] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2740e6]/90 disabled:opacity-50"
        >
          {saving
            ? savePhase === "compressing"
              ? t.compressing
              : savePhase === "uploading"
                ? (mode === "meeting" ? t.mtgUploading : t.uploading)
                : t.saving
            : t.save}
        </button>
        <button
          type="button"
          onClick={() => void (mode === "drill" ? handleSave(true) : handleSaveMeeting(true))}
          disabled={saving}
          className="rounded-md border border-[#2740e6] px-4 py-2 text-sm font-semibold text-[#2740e6] hover:bg-[#2740e6]/5 disabled:opacity-50"
        >
          {t.saveAndAnother}
        </button>
      </div>
    </div>
  );
}
