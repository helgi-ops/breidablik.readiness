"use client";

/**
 * ClubBrandingSettings
 *
 * ELITE-only panel inside coach/settings. Lets the admin set:
 *   - club_short_name  — shown as the app name on the home screen
 *   - club_logo_url    — publicly accessible PNG URL (ideally 512×512)
 *   - club_theme_color — hex colour for the PWA splash / status bar
 *
 * Changes are saved directly to the teams table via Supabase.
 * The dynamic manifest picks them up on next page load (max 60 s cache).
 */

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BrandingState = {
  club_short_name: string;
  club_logo_url: string;
  club_theme_color: string;
};

const DEFAULTS: BrandingState = {
  club_short_name: "",
  club_logo_url: "",
  club_theme_color: "#005a2b",
};

export default function ClubBrandingSettings() {
  const [teamId, setTeamId]   = useState<string | null>(null);
  const [form, setForm]       = useState<BrandingState>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [ok, setOk]           = useState<string | null>(null);
  const [err, setErr]         = useState<string | null>(null);

  // ── Load current values ───────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("team_id")
        .eq("id", user.id)
        .maybeSingle();

      const tid = profile?.team_id ?? null;
      if (!tid || !alive) { setLoading(false); return; }

      setTeamId(tid);

      const { data: team } = await supabase
        .from("teams")
        .select("club_short_name, club_logo_url, club_theme_color")
        .eq("id", tid)
        .maybeSingle();

      if (alive && team) {
        setForm({
          club_short_name:  team.club_short_name  ?? "",
          club_logo_url:    team.club_logo_url    ?? "",
          club_theme_color: team.club_theme_color ?? "#005a2b",
        });
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!teamId) return;
    setSaving(true); setOk(null); setErr(null);

    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from("teams")
      .update({
        club_short_name:  form.club_short_name.trim()  || null,
        club_logo_url:    form.club_logo_url.trim()    || null,
        club_theme_color: form.club_theme_color.trim() || "#005a2b",
      })
      .eq("id", teamId);

    if (error) { setErr(error.message); }
    else       { setOk("Vörumerki vistað. Uppfærist á heimaskjá eftir u.þ.b. 1 mínútu."); }
    setSaving(false);
  }

  function set(key: keyof BrandingState, val: string) {
    setForm((p) => ({ ...p, [key]: val }));
    setOk(null); setErr(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Vörumerki klúbbsins</CardTitle>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
            Elite
          </span>
        </div>
        <CardDescription>
          Leikmenn sjá klúbbsins eigið nafn og merki þegar þeir setja MicroPulse á heimaskjá sinn.
          Virkar á iOS (Safari → Bæta við heimaskjá) og Android (Chrome → Setja upp forrit).
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        {/* Preview strip */}
        <div className="flex items-center gap-4 rounded-xl border bg-neutral-50 p-4">
          <div
            className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl shadow"
            style={{ background: form.club_theme_color || "#005a2b" }}
          >
            {form.club_logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.club_logo_url}
                alt="Club logo preview"
                className="h-10 w-10 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <span className="text-2xl font-bold text-white">
                {(form.club_short_name || "M").slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <div className="text-sm font-semibold">{form.club_short_name || "MicroPulse"}</div>
            <div className="text-xs text-muted-foreground">Svo lítur það út á heimaskjá</div>
          </div>
        </div>

        {/* Short name */}
        <div className="grid gap-1.5">
          <Label>Stutt nafn (sýnt undir táknmynd)</Label>
          <Input
            placeholder="t.d. Breiðablik, KR, Víkingur"
            value={form.club_short_name}
            onChange={(e) => set("club_short_name", e.target.value)}
            maxLength={30}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">Hámark 30 stafir. Ef tómt: „MicroPulse".</p>
        </div>

        {/* Logo URL */}
        <div className="grid gap-1.5">
          <Label>Logo URL (PNG, 512×512 mælt)</Label>
          <Input
            placeholder="https://example.com/club-logo-512.png"
            value={form.club_logo_url}
            onChange={(e) => set("club_logo_url", e.target.value)}
            disabled={loading || saving}
          />
          <p className="text-xs text-muted-foreground">
            Verður að vera opinberlega aðgengileg URL. Notaðu Supabase Storage, Cloudinary, eða annað CDN.
            Ef tómt: MicroPulse logo notað.
          </p>
        </div>

        {/* Theme colour */}
        <div className="grid gap-1.5">
          <Label>Þemalit (splash screen &amp; status bar)</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={form.club_theme_color || "#005a2b"}
              onChange={(e) => set("club_theme_color", e.target.value)}
              disabled={loading || saving}
              className="h-10 w-14 cursor-pointer rounded-md border p-1"
            />
            <Input
              value={form.club_theme_color}
              onChange={(e) => set("club_theme_color", e.target.value)}
              placeholder="#005a2b"
              className="w-32 font-mono text-sm"
              disabled={loading || saving}
            />
          </div>
        </div>

        {/* Feedback */}
        {err && <p className="text-sm text-destructive">Villa: {err}</p>}
        {ok  && <p className="text-sm text-emerald-600">{ok}</p>}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading || saving || !teamId}>
            {saving ? "Vista..." : "Vista vörumerki"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
