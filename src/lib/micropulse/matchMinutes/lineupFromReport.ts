import "server-only";

/**
 * StatsBomb "Match Report" PDF → the matchday lineup (starting XI, subs, unused) + minutes.
 *
 * The report's formations page lists both teams' Starting Eleven (number, name, position, and the
 * minute a starter was substituted OFF), the Substitutes (with the minute they came ON), and the
 * Unused Substitutes. That is exactly what Match minutes needs: started / minutes_played / DNP.
 *
 * Only the small lineup slice of the text goes to the model (Sonnet-5, thinking disabled — it reasons
 * by default and would return empty JSON otherwise). READ-ONLY AI: the output is a proposal the coach
 * reviews and saves. Descriptive — it never touches the readiness colour or the daily decision.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MATCH_REPORT_MODEL, isMatchReportPdfText } from "@/lib/micropulse/statsIngestion/matchReportExtract";
import { matchByInitialSurname, normalizeName } from "@/lib/micropulse/statsIngestion/nameMatch";

export type LineupPlayerX = { number: number | null; name: string; position: string | null; minute: number | null };
export type SideLineup = { team: string; starters: LineupPlayerX[]; subs: LineupPlayerX[]; unused: LineupPlayerX[] };
export type LineupExtract = { home: SideLineup; away: SideLineup; date: string | null };

const SYSTEM = `You extract the matchday lineup from the text of a StatsBomb football match report's formations page.

The text lists, for each team: "Starting Eleven" (each player as number, name, position, and — ONLY if the player was substituted off — the minute they came off), then "Substitutes" (each as number, name, and the minute they came ON), then "Unused Substitutes" (name only, did not play). Names may be Icelandic — copy them EXACTLY as written, with accents.

Return ONLY a JSON object, no prose, no markdown fences:
{
  "date": "YYYY-MM-DD or null",
  "home": { "team": "team name", "starters": [{"number": 9, "name": "...", "position": "Right Back", "minute": 25}], "subs": [{"number": 8, "name": "...", "minute": 46}], "unused": [{"number": 16, "name": "..."}] },
  "away": { ... same shape ... }
}
For a starter who played the whole match, set "minute" to null. For a sub, "minute" is the minute they came ON. Never invent players or minutes; if a value isn't shown, use null. Include every player listed.`;

/** Extract both teams' lineups from a StatsBomb Match Report PDF. */
export async function extractLineupFromReport(opts: { apiKey: string; buffer: Buffer }): Promise<LineupExtract> {
  const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text?: string }>;
  const text = ((await pdfParse(opts.buffer))?.text ?? "").trim();
  if (!text) throw new Error("Could not read a text layer from this PDF.");
  if (!isMatchReportPdfText(text)) throw new Error("This isn't a StatsBomb Match Report PDF (expected the “Match Report / Match Statistics” layout).");

  // Send only the title block (team names + date) + the formations/lineup slice.
  const head = text.slice(0, 400);
  const a = text.indexOf("Starting Eleven");
  const b = text.indexOf("MATCH STATISTICS");
  const slice = a >= 0 ? text.slice(a, b > a ? b : a + 3500) : text.slice(0, 4000);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MATCH_REPORT_MODEL,
      max_tokens: 3000,
      thinking: { type: "disabled" },
      system: SYSTEM,
      messages: [{ role: "user", content: `${head}\n\n${slice}` }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const json = await res.json();
  let txt = String(json?.content?.find((c: { type: string }) => c.type === "text")?.text ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const i = txt.indexOf("{"), j = txt.lastIndexOf("}");
  txt = i >= 0 && j > i ? txt.slice(i, j + 1) : txt;
  const parsed = JSON.parse(txt) as LineupExtract;
  const clean = (s: SideLineup | undefined): SideLineup => ({
    team: String(s?.team ?? ""),
    starters: Array.isArray(s?.starters) ? s!.starters : [],
    subs: Array.isArray(s?.subs) ? s!.subs : [],
    unused: Array.isArray(s?.unused) ? s!.unused : [],
  });
  return { date: parsed?.date ?? null, home: clean(parsed?.home), away: clean(parsed?.away) };
}

export type LineupMinute = { name: string; number: number | null; position: string | null; started: boolean; isDnp: boolean; minutes: number };

/**
 * Turn one side's lineup into per-player Match-minutes rows.
 *
 * A time next to a STARTER is ambiguous in the text — it can be a substitution OR a yellow card. We
 * disambiguate by pairing: a starter's time only counts as "subbed off" when it matches the minute a
 * SUB came on (every substitution has both halves). A starter whose time matches no sub-on played the
 * full match (he was booked, not replaced). Subs = full − on-minute; unused = DNP. The coach reviews
 * the pre-filled grid before saving, so any red-card edge case is easy to correct.
 */
export function sideToMinutes(side: SideLineup, fullMatch = 90): LineupMinute[] {
  const pool = side.subs.map((p) => p.minute).filter((m): m is number => m != null); // sub-on minutes (multiset)
  const out: LineupMinute[] = [];
  for (const p of side.starters) {
    let minutes = fullMatch;
    if (p.minute != null && p.minute > 0) {
      const idx = pool.indexOf(p.minute);
      if (idx >= 0) { minutes = Math.round(p.minute); pool.splice(idx, 1); } // paired with a sub-on → substituted off
      // else: a card (or unpaired event) while still on the pitch → full match
    }
    out.push({ name: p.name, number: p.number ?? null, position: p.position ?? null, started: true, isDnp: false, minutes });
  }
  for (const p of side.subs) out.push({ name: p.name, number: p.number ?? null, position: p.position ?? null, started: false, isDnp: false, minutes: p.minute != null ? Math.max(1, Math.round(fullMatch - p.minute)) : fullMatch });
  for (const p of side.unused) out.push({ name: p.name, number: p.number ?? null, position: p.position ?? null, started: false, isDnp: true, minutes: 0 });
  return out;
}

/**
 * Extract the own-team lineup from a match report PDF and WRITE it to match_player_minutes for the
 * given date (starting XI / subs / DNP + minutes). Best-effort: returns null (and writes nothing) if
 * the PDF isn't a match report, the coach's team isn't in it, or no player matched the roster. Meant
 * to run alongside the Single-Match player-stats import so one PDF fills both. Descriptive only.
 */
export async function writeLineupMinutes(
  supabase: SupabaseClient, teamId: string, buffer: Buffer, apiKey: string, matchDate: string,
): Promise<{ filled: number; opponent: string | null } | null> {
  let extract: LineupExtract;
  try { extract = await extractLineupFromReport({ apiKey, buffer }); } catch { return null; }

  const { data: team } = await supabase.from("teams").select("name, club_short_name").eq("id", teamId).maybeSingle();
  const ownKeys = [team?.name, (team as { club_short_name?: string } | null)?.club_short_name].filter(Boolean).map((x) => normalizeName(String(x)));
  const sideMatches = (s: SideLineup) => { const k = normalizeName(s.team); return ownKeys.some((o) => o && (k.includes(o) || o.includes(k))); };
  const own = sideMatches(extract.home) ? extract.home : sideMatches(extract.away) ? extract.away : null;
  if (!own) return null;
  const opponent = own === extract.home ? extract.away.team : extract.home.team;

  const { data: squadRows } = await supabase.from("players").select("id, full_name, is_active").eq("team_id", teamId);
  const squad = (squadRows ?? [])
    .filter((p) => (p as { is_active: boolean | null }).is_active !== false)
    .map((p) => ({ id: (p as { id: string }).id, fullName: (p as { full_name: string | null }).full_name ?? "—" }));

  const byPlayer = new Map<string, { player_id: string; match_date: string; team_id: string; minutes_played: number; is_dnp: boolean; started: boolean }>();
  for (const r of sideToMinutes(own)) {
    const m = matchByInitialSurname(r.name, squad);
    if (!m.playerId) continue;
    byPlayer.set(m.playerId, { player_id: m.playerId, match_date: matchDate, team_id: teamId, minutes_played: r.isDnp ? 0 : r.minutes, is_dnp: r.isDnp, started: r.isDnp ? false : r.started });
  }
  if (byPlayer.size === 0) return null;

  const { error } = await supabase.from("match_player_minutes").upsert([...byPlayer.values()] as never, { onConflict: "player_id,match_date" });
  if (error) return null;
  return { filled: byPlayer.size, opponent };
}
