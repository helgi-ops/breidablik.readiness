"use client";

/**
 * KKÍ games on the Opponent Analysis page — opponent-scoped. The coach names the team they're
 * scouting (prefilled from the selected opponent) and pastes one or more kki.is match links; those
 * games are saved UNDER that opponent (into the scout season) and feed their scouting report. The
 * saved-games list shows that opponent's games — never your own team's. Descriptive scouting; it
 * never touches the readiness colour or the daily decision.
 */

import * as React from "react";

type SavedGame = { gameId: string; date: string | null; opponent: string | null; pts: number };

export default function KkiOpponentGames({
  opponent, token, is, onSaved,
}: { opponent: string | null; token: () => Promise<string | null>; is: boolean; onSaved?: () => void }) {
  const t = (en: string, isl: string) => (is ? isl : en);
  const [team, setTeam] = React.useState(opponent ?? "");
  const [links, setLinks] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = React.useState<SavedGame[]>([]);

  // Follow the selected opponent — refill the name and load that team's saved games.
  React.useEffect(() => { setTeam(opponent ?? ""); setMsg(null); }, [opponent]);

  const loadSaved = React.useCallback(async (name: string) => {
    if (!name.trim()) { setSaved([]); return; }
    try {
      const tok = await token(); if (!tok) return;
      const res = await fetch(`/api/coach/basketball-opponent-scout?savedGames=${encodeURIComponent(name.trim())}`, { headers: { Authorization: `Bearer ${tok}` }, cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; games?: SavedGame[] };
      if (res.ok && j.ok) setSaved(j.games ?? []);
    } catch { /* non-critical */ }
  }, [token]);
  React.useEffect(() => { void loadSaved(team); }, [team, loadSaved]);

  const save = React.useCallback(async () => {
    const name = team.trim();
    const urls = links.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (!name) { setMsg({ ok: false, text: t("Enter the team you're scouting.", "Sláðu inn liðið sem þú ert að skanna.") }); return; }
    if (urls.length === 0) { setMsg({ ok: false, text: t("Paste at least one kki.is game link.", "Límdu inn að minnsta kosti einn kki.is leikhlekk.") }); return; }
    setBusy(true); setMsg(null);
    try {
      const tok = await token(); if (!tok) { setMsg({ ok: false, text: t("Not signed in.", "Ekki innskráð(ur).") }); return; }
      const res = await fetch("/api/coach/basketball-opponent-scout", {
        method: "POST", headers: { Authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ opponent: name, addGames: urls }),
      });
      const j = (await res.json()) as { ok: boolean; added?: number; games?: number; skipped?: Array<{ gameId: string; reason: string }>; error?: string };
      if (res.ok && j.ok) {
        const skips = (j.skipped ?? []).length;
        setMsg({ ok: true, text: t(
          `Saved ${j.added} game${j.added === 1 ? "" : "s"} under ${name} (${j.games} total)${skips ? ` · ${skips} skipped` : ""}.`,
          `Vistaði ${j.added} leik${j.added === 1 ? "" : "i"} undir ${name} (${j.games} alls)${skips ? ` · ${skips} sleppt` : ""}.`,
        ) });
        setLinks("");
        void loadSaved(name);
        onSaved?.();
      } else {
        setMsg({ ok: false, text: j.error ?? t("Could not save those games.", "Gat ekki vistað þessa leiki.") });
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : t("Network error", "Netvilla") });
    } finally { setBusy(false); }
  }, [team, links, token, onSaved, loadSaved, is]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <label className="text-[12px] font-semibold text-slate-700">{t("Team you're scouting", "Lið sem þú ert að skanna")}
            <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={t("e.g. Fjölnir", "t.d. Fjölnir")}
              className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-[13px]" />
          </label>
        </div>
        <label className="mt-2 block text-[12px] font-semibold text-slate-700">{t("KKÍ game link(s)", "KKÍ leikhlekkur / -hlekkir")}
          <textarea value={links} onChange={(e) => setLinks(e.target.value)} rows={3}
            placeholder={"https://kki.is/…/Leikur?…&game_id=…\nhttps://kki.is/…/Leikur?…&game_id=…"}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[12.5px] font-mono" />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="h-9 rounded-lg bg-[#2740e6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50">
            {busy ? t("Saving…", "Vista…") : team.trim() ? t(`Save under ${team.trim()}`, `Vista undir ${team.trim()}`) : t("Save games", "Vista leiki")}
          </button>
          <span className="text-[11px] text-slate-500">{t("One link per game — paste several at once (new line, space or comma).", "Einn hlekkur per leik — límdu marga í einu (ný lína, bil eða komma).")}</span>
        </div>
        {msg && <div className={`mt-2 rounded-lg px-3 py-2 text-[12.5px] ${msg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</div>}
      </div>

      {saved.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[12px] font-semibold text-slate-700">
            {t("Games saved for", "Vistaðir leikir fyrir")} <span className="text-[#2740e6]">{team.trim() || opponent}</span> <span className="font-normal text-slate-400">({saved.length})</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {saved.map((g) => (
              <span key={g.gameId} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700">
                {g.date ? <span className="text-slate-400">{g.date.slice(5)} </span> : null}
                {g.opponent ? <span className="font-semibold">v {g.opponent}</span> : <span className="font-semibold">#{g.gameId}</span>}
                {g.pts ? <span className="ml-1 tabular-nums text-slate-500">{g.pts}</span> : null}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">{t("These games feed this opponent's scouting report above. Re-pull or add more links any time.", "Þessir leikir fæða skýrsluna um andstæðinginn hér að ofan. Bættu við hlekkjum hvenær sem er.")}</p>
        </div>
      )}
    </div>
  );
}
